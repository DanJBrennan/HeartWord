"""Split the supplied Sougb New Testament PDF into chapter DOCX source files.

The printed verse markers are the only split points. A printed range such as
1:1-2 stays one paragraph labelled 1-2; no verse boundary is guessed.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import re

from docx import Document
from docx.text.paragraph import Paragraph
from pypdf import PdfReader


BOOKS = [
    ("Matius", "Matthew", 28), ("Markus", "Mark", 16),
    ("Lukas", "Luke", 24), ("Yohanes", "John", 21),
    ("Watti'u Manga Rasul", "Acts", 28), ("Roma", "Romans", 16),
    ("1 Korintus", "1 Corinthians", 16), ("2 Korintus", "2 Corinthians", 13),
    ("Galatia", "Galatians", 6), ("Efesus", "Ephesians", 6),
    ("Filipi", "Philippians", 4), ("Kolose", "Colossians", 4),
    ("1 Tesalonika", "1 Thessalonians", 5),
    ("2 Tesalonika", "2 Thessalonians", 3),
    ("1 Timotius", "1 Timothy", 6), ("2 Timotius", "2 Timothy", 4),
    ("Titus", "Titus", 3), ("Filemon", "Philemon", 1),
    ("Ibrani", "Hebrews", 13), ("Yakobus", "James", 5),
    ("1 Petrus", "1 Peter", 5), ("2 Petrus", "2 Peter", 3),
    ("1 Yohanes", "1 John", 5), ("2 Yohanes", "2 John", 1),
    ("3 Yohanes", "3 John", 1), ("Yudas", "Jude", 1),
    ("Sondapa", "Revelation", 22),
]

BOOK_FIRST_VERSE = re.compile(r"(?<!\d)1:1(?:-\d+)?(?=\s)")
VERSE = re.compile(r"(?<!\w)(\d{1,2}):(\d{1,3})(?:-(\d{1,3}))?(?=\s)")


@dataclass(frozen=True)
class Entry:
    chapter: int
    first: int
    last: int
    text: str

    @property
    def label(self) -> str:
        return str(self.first) if self.first == self.last else f"{self.first}-{self.last}"


def normalized(value: str) -> str:
    return " ".join(value.split())


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def extract_books(source: str) -> list[tuple[str, str, list[Entry]]]:
    if "\ufffd" in source:
        raise ValueError("PDF extraction contains replacement characters")
    starts = []
    for marker in BOOK_FIRST_VERSE.finditer(source):
        prefix = source[: marker.start()].rstrip()
        title = prefix.splitlines()[-1].strip()
        title_start = prefix.rfind(title)
        if title_start < 0 or (title_start and source[title_start - 1] not in "\n\f"):
            raise ValueError(f"Book title is not an isolated line: {title!r}")
        starts.append((title_start, title))
    if [title for _, title in starts] != [item[0] for item in BOOKS]:
        raise ValueError(f"Unexpected book starts: {[title for _, title in starts]}")
    if source[: starts[0][0]].strip():
        raise ValueError("Unassigned text precedes Matthew")

    books = []
    for index, (title_start, printed_title) in enumerate(starts):
        _, folder, chapters = BOOKS[index]
        end = starts[index + 1][0] if index + 1 < len(starts) else len(source)
        block = source[title_start:end]
        verse_start = block.find(printed_title) + len(printed_title)
        verse_source = block[verse_start:]
        markers = list(VERSE.finditer(verse_source))
        if not markers or verse_source[: markers[0].start()].strip():
            raise ValueError(f"Unassigned text before {printed_title} 1:1")
        entries = []
        previous = None
        for pos, marker in enumerate(markers):
            chapter, first = int(marker[1]), int(marker[2])
            last = int(marker[3]) if marker[3] else first
            body_end = markers[pos + 1].start() if pos + 1 < len(markers) else len(verse_source)
            body = normalized(verse_source[marker.end():body_end])
            if not body or last < first:
                raise ValueError(f"Empty/reversed verse at {folder} {chapter}:{first}-{last}")
            if previous:
                if chapter == previous.chapter:
                    if first != previous.last + 1:
                        raise ValueError(f"Verse gap/overlap in {folder} {chapter}: {previous.last} -> {first}")
                elif chapter != previous.chapter + 1 or first != 1:
                    raise ValueError(f"Chapter gap/overlap in {folder}: {previous.chapter} -> {chapter}:{first}")
            elif chapter != 1 or first != 1:
                raise ValueError(f"{folder} does not start at 1:1")
            entry = Entry(chapter, first, last, body)
            entries.append(entry)
            previous = entry
        if previous.chapter != chapters:
            raise ValueError(f"{folder} has {previous.chapter} chapters; expected {chapters}")
        books.append((printed_title, folder, entries))
    return books


def write_chapter(template: Path, target: Path, title: str, entries: list[Entry]) -> None:
    document = Document(template)
    if len(document.paragraphs) < 2 or len(document.paragraphs[1].runs) != 3:
        raise ValueError("Meyah reference structure changed")
    for paragraph in document.paragraphs[2:]:
        paragraph._element.getparent().remove(paragraph._element)
    title_paragraph, verse_paragraph = document.paragraphs[:2]
    title_paragraph.runs[0].text = f"{title} {entries[0].chapter}"
    title_paragraph.runs[0].font.all_caps = True
    verse_pattern = deepcopy(verse_paragraph._p)
    current = verse_paragraph
    for index, entry in enumerate(entries):
        if index:
            new_element = deepcopy(verse_pattern)
            current._p.addnext(new_element)
            current = Paragraph(new_element, document._body)
        current.runs[0].text = entry.label
        current.runs[1].text = " "
        current.runs[2].text = entry.text
    target.parent.mkdir(parents=True, exist_ok=True)
    document.save(target)
    reopened = Document(target)
    actual = [(p.runs[0].text, p.runs[2].text) for p in reopened.paragraphs[1:]]
    expected = [(entry.label, entry.text) for entry in entries]
    if actual != expected or reopened.paragraphs[0].text != f"{title} {entries[0].chapter}":
        raise ValueError(f"DOCX round trip differs from source: {target}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--text-cache", type=Path)
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args()
    if args.text_cache and not args.audit_only:
        raise ValueError("Writing source documents requires extraction from the supplied PDF")
    if args.text_cache:
        source = args.text_cache.read_text(encoding="utf-8")
        page_count = source.count("\f") + 1
    else:
        reader = PdfReader(args.pdf)
        page_count = len(reader.pages)
        source = "\f".join(page.extract_text() for page in reader.pages)
    books = extract_books(source)
    expected_count = sum(chapters for _, _, chapters in BOOKS)
    actual_count = sum(len({entry.chapter for entry in entries}) for _, _, entries in books)
    if actual_count != expected_count:
        raise ValueError(f"Expected {expected_count} chapters, found {actual_count}")
    print(f"PDF pages: {page_count}; books: {len(books)}; chapters: {actual_count}")
    print(f"Printed verse markers: {sum(len(entries) for _, _, entries in books)}")
    print(f"Combined ranges: {sum(entry.first != entry.last for _, _, entries in books for entry in entries)}")
    if args.audit_only:
        return
    if any(args.output_root.glob("*/*.docx")) or args.manifest.exists():
        raise FileExistsError("Output already exists; inspect it before rerunning")
    manifest = {"source_pdf": str(args.pdf), "source_pdf_sha256": digest(args.pdf),
                "reference_docx": str(args.template), "reference_docx_sha256": digest(args.template),
                "pdf_pages": page_count, "books": []}
    for title, folder, entries in books:
        group = {"source_title": title, "folder": folder, "chapters": []}
        for chapter in sorted({entry.chapter for entry in entries}):
            subset = [entry for entry in entries if entry.chapter == chapter]
            target = args.output_root / folder / f"{folder} {chapter}.docx"
            write_chapter(args.template, target, title, subset)
            group["chapters"].append({"chapter": chapter, "file": str(target),
                                      "sha256": digest(target), "printed_markers": len(subset),
                                      "verses_covered": subset[-1].last,
                                      "combined_ranges": [item.label for item in subset if item.first != item.last],
                                      "text_sha256": sha256(" ".join(item.text for item in subset).encode()).hexdigest()})
        manifest["books"].append(group)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {actual_count} chapter documents and {args.manifest}")


if __name__ == "__main__":
    main()
