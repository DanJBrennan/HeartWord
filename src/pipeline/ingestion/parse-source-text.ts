import { readZipEntry } from "./simple-zip.js";

/**
 * One translation-unit of source Scripture text: a paragraph from the
 * source .docx, tagged with the verse range it covers. This is the finest
 * grain of text we align to audio timing at — see the "Alignment
 * granularity" note in docs/ARCHITECTURE.md's ingestion section for why
 * paragraph-level (not single-verse) is what v1 attempts.
 */
export interface VerseGroup {
  verseStart: number;
  verseEnd: number;
  /** e.g. "Mark 2:1-5" or "Mark 2:12" for a single-verse paragraph. */
  verseRef: string;
  text: string;
}

/**
 * Extracts word/document.xml from a .docx (a plain zip container). Used
 * to shell out to the `unzip` CLI on the theory that it's "a preinstalled
 * system tool" -- true on Linux, but not on native Windows, where Dan
 * actually runs the app (see simple-zip.ts's header for the full story).
 * readZipEntry reads the zip format directly with node:zlib, no external
 * tool or npm dependency needed, and works the same on every platform.
 */
function readDocumentXml(docxPath: string): string {
  return readZipEntry(docxPath, "word/document.xml").toString("utf-8");
}

/**
 * Reduces Word's paragraph XML to plain text, one line per paragraph.
 * Crude but sufficient: we only need paragraph boundaries and their text,
 * not run-level formatting (bold/italic carry no meaning for alignment).
 */
function xmlToParagraphLines(xml: string): string[] {
  const withBreaks = xml.replace(/<w:p[ >]/g, "\n<w:p ");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return stripped
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Published chapter identity for the opening card; never translated by a model. */
export function parseChapterTitle(docxPath: string, chapter: number): string | null {
  const first = xmlToParagraphLines(readDocumentXml(docxPath))[0]?.trim();
  if (!first || !Number.isInteger(chapter) || chapter < 1) return null;
  const match = first.match(/^(.+?)\s+(\d+)$/u);
  return match && Number(match[2]) === chapter && /\p{L}/u.test(match[1]!) ? first : null;
}

/**
 * A verse marker: one to three digits, optionally followed by a space,
 * immediately followed by a capital letter or an opening quote — matches
 * how this source docx writes verse numbers ("1Njap", "6Guru", "23 Mpe",
 * `7"No dini`). This is a heuristic tuned to the Mark 2 docx actually in
 * hand, not a general-purpose Scripture-text parser; a differently
 * formatted chapter file may need this adjusted (see "Known limitations"
 * in docs/ARCHITECTURE.md's ingestion section).
 */
// A verse may continue the previous sentence: the approved English Mark 2
// reference writes "26how ...". Accept lowercase immediately after a
// number, without also treating ordinary prose such as "40 days" as a verse.
const VERSE_MARKER = /(\d{1,3})(?:\s?(?=[A-ZÀ-Ÿ"“'])|(?=[a-zà-ÿ]))/g;

/**
 * Splits one paragraph's text into its verse(s). A paragraph normally
 * carries several verses run together with no paragraph break between
 * them (this source docx does not put each verse on its own line).
 */
function splitParagraphIntoVerses(line: string): Array<{ verse: number; text: string }> {
  const markers: Array<{ verse: number; index: number; markerLength: number }> = [];
  for (const match of line.matchAll(VERSE_MARKER)) {
    markers.push({ verse: Number(match[1]), index: match.index ?? 0, markerLength: match[0].length });
  }
  if (markers.length === 0) return [];

  const verses: Array<{ verse: number; text: string }> = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]!; // i < markers.length by the loop bound
    const start = marker.index + marker.markerLength;
    const end = i + 1 < markers.length ? markers[i + 1]!.index : line.length;
    verses.push({ verse: marker.verse, text: line.slice(start, end).trim() });
  }
  return verses;
}

export interface VerseRecord {
  verse: number;
  text: string;
  /** Which source paragraph (0-indexed, in document order) this verse's
   *  text came from — lets a caller that needs paragraph grouping (like
   *  parseSourceText below) or paragraph-relative audio timing (like the
   *  quote-alignment exercise in scripts/quote-alignment/) recover it
   *  without re-parsing the docx. */
  paragraphIndex: number;
  /** A verse can continue before the next marker in the following paragraph. */
  continuationParagraphIndices?: number[];
  /** Published reference-only entry, retained without inventing verse text. */
  referenceOnlyFollowing?: Array<{verse:number;referencedVerse:number;raw:string;paragraphIndex:number}>;
}

/** A printed marker such as Meyah Mark 4's `6(4:5)` has no supplied words.
 * Retain it as an unresolved coverage question attached to the preceding
 * supplied verse; never turn it into a duplicate verse or audio segment. */
export function parseReferenceOnlyVerseMarkers(docxPath:string):Array<{verse:number;referencedVerse:number;raw:string;paragraphIndex:number}>{
  return xmlToParagraphLines(readDocumentXml(docxPath)).flatMap((line,paragraphIndex)=>{
    const match=line.match(/^(\d{1,3})\s*\((\d{1,3}):(\d{1,3})\)$/u);
    return match?[{verse:Number(match[1]),referencedVerse:Number(match[3]),raw:line,paragraphIndex}]:[];
  });
}

/**
 * Parses a chapter's source .docx into individual verses, in document
 * order, skipping any paragraph with no recognizable verse marker (the
 * chapter title, pericope headings like "Yesus dimig Lewi", and
 * parallel-passage references like "(Mat. 9:9-13; Luk. 5:27-32)") — see
 * parseSourceText below for why those are excluded. This is the finer
 * grain parseSourceText groups into paragraphs; use this directly when a
 * caller needs to locate something (like a quotation) within a specific
 * verse rather than only the paragraph it's part of.
 */
export function parseSourceTextByVerse(docxPath: string): VerseRecord[] {
  const xml = readDocumentXml(docxPath);
  const lines = xmlToParagraphLines(xml);

  const records: VerseRecord[] = [];
  lines.forEach((line, paragraphIndex) => {
    const referenceOnly=line.match(/^(\d{1,3})\s*\((\d{1,3}):(\d{1,3})\)$/u);
    if(referenceOnly){
      const previous=records.at(-1), verse=Number(referenceOnly[1]),referencedVerse=Number(referenceOnly[3]);
      if(previous && previous.verse===referencedVerse && verse===referencedVerse+1)
        (previous.referenceOnlyFollowing??=[]).push({verse,referencedVerse,raw:line,paragraphIndex});
      return;
    }
    const verses = splitParagraphIntoVerses(line);
    const firstMarker = [...line.matchAll(VERSE_MARKER)][0];
    const prefix = firstMarker ? line.slice(0, firstMarker.index).trim() : "";
    const previous = records.at(-1);
    // Mark 5:9's reply is at the start of the paragraph containing v10.
    // Preserve these supplied words on v9; they are neither a heading nor
    // part of v10. Require adjacent paragraphs and consecutive verse numbers
    // so an unrelated preface is not silently attached to earlier Scripture.
    const previousParagraph = previous?.continuationParagraphIndices?.at(-1) ?? previous?.paragraphIndex;
    if (prefix && previous && previousParagraph === paragraphIndex - 1 && verses[0]?.verse === previous.verse + 1) {
      previous.text += " " + prefix;
      (previous.continuationParagraphIndices ??= []).push(paragraphIndex);
    }
    for (const { verse, text } of verses) {
      records.push({ verse, text, paragraphIndex });
    }
  });
  return records;
}

/**
 * Parses a chapter's source .docx into ordered verse-group paragraphs.
 * Skips any paragraph with no recognizable verse marker (the chapter
 * title, pericope headings like "Yesus dimig Lewi", and parallel-passage
 * references like "(Mat. 9:9-13; Luk. 5:27-32)") — those are translation
 * publishing conventions, not part of the read-aloud Scripture text, so
 * they have no corresponding audio and would misalign everything after
 * them if included.
 */
export interface SourceHeading {
  /** The Hatam pericope heading text, e.g. "Yesus dimig Lewi". */
  headingText: string;
  /** The parenthetical synoptic cross-reference that follows the heading
   *  in this source docx, e.g. "Mat. 9:9-13; Luk. 5:27-32" -- null if a
   *  heading has none (not expected in practice for this docx, but not
   *  assumed). */
  parallelRefs: string | null;
  /** The verse number of the first verse-marked paragraph that follows
   *  this heading -- how a heading is anchored to the text, since the
   *  docx has no other structural link between them. */
  verseStart: number;
}
/** A published non-Scripture title that the narrator may nevertheless read. */
export interface NarratedParagraphTitle { text:string; parallelRefs:string; paragraphIndex:number; verseStart:number; }
/** Only a title immediately followed by its own parenthetical references is
 * classified this way; arbitrary unnumbered prose remains untouched. */
export function parseNarratedParagraphTitles(docxPath:string):NarratedParagraphTitle[] {
  const lines=xmlToParagraphLines(readDocumentXml(docxPath)), titles:NarratedParagraphTitle[]=[];
  for(let i=1;i+2<lines.length;i++){const title=lines[i]!, refs=lines[i+1]!, following=splitParagraphIntoVerses(lines[i+2]!);
    if(!splitParagraphIntoVerses(title).length && /^\(.+\)$/.test(refs) && following.length)titles.push({text:title,parallelRefs:refs.slice(1,-1),paragraphIndex:i,verseStart:following[0]!.verse});}
  return titles;
}

/**
 * Recovers the chapter's own pericope headings and synoptic cross-
 * references -- the exact things parseSourceText/parseSourceTextByVerse
 * deliberately DISCARD because they have no corresponding audio. Scene
 * breakdown (stage 2) needs the opposite: these headings are the
 * translation's OWN scene divisions, already reviewed and published, so
 * using them is following the source text rather than inventing
 * narrative structure -- see AGENTS.md/NON_GOALS.md on not inventing
 * content beyond what the source says. Confirmed against Hatam Mark 2's
 * real docx: exactly 4 headings, matching the 4 standard synoptic
 * pericopes (healing the paralytic / calling Levi / question about
 * fasting / lord of the Sabbath), each followed by the expected
 * Matthew/Luke parallel reference.
 *
 * Same crude "no verse marker on this paragraph" signal as the functions
 * above, refined further: a parenthetical-only paragraph is a cross-
 * reference, not a heading, and the document's very first paragraph (the
 * bare chapter title, e.g. "MARKUS 2") is dropped positionally rather
 * than pattern-matched, since matching it as "no lowercase letters"
 * would also wrongly catch a heading that happened to be short and
 * capitalized.
 */
export function parseSourceHeadings(docxPath: string): SourceHeading[] {
  const xml = readDocumentXml(docxPath);
  const lines = xmlToParagraphLines(xml).slice(1); // drop the bare chapter title (first paragraph)

  const headings: SourceHeading[] = [];
  let pendingHeading: string | null = null;
  let pendingParallelRefs: string | null = null;

  for (const line of lines) {
    const verses = splitParagraphIntoVerses(line);
    if (verses.length > 0) {
      if (pendingHeading !== null) {
        headings.push({ headingText: pendingHeading, parallelRefs: pendingParallelRefs, verseStart: verses[0]!.verse });
      }
      pendingHeading = null;
      pendingParallelRefs = null;
      continue;
    }
    if (/^\(.+\)$/.test(line)) {
      pendingParallelRefs = line.slice(1, -1);
      continue;
    }
    pendingHeading = line;
  }

  return headings;
}

export function parseSourceText(docxPath: string, book: string, chapter: number): VerseGroup[] {
  const verses = parseSourceTextByVerse(docxPath);
  const bookTitle = book.charAt(0).toUpperCase() + book.slice(1);

  const groups: VerseGroup[] = [];
  let currentParagraph = -1;
  let currentVerses: Array<{ verse: number; text: string }> = [];

  const flush = () => {
    if (currentVerses.length === 0) return;
    const text = currentVerses.map((v) => v.text).join(" ");
    const verseStart = currentVerses[0]!.verse;
    const verseEnd = currentVerses[currentVerses.length - 1]!.verse;
    const verseRef =
      verseStart === verseEnd
        ? `${bookTitle} ${chapter}:${verseStart}`
        : `${bookTitle} ${chapter}:${verseStart}-${verseEnd}`;
    groups.push({ verseStart, verseEnd, verseRef, text });
  };

  for (const record of verses) {
    if (record.paragraphIndex !== currentParagraph) {
      flush();
      currentVerses = [];
      currentParagraph = record.paragraphIndex;
    }
    currentVerses.push({ verse: record.verse, text: record.text });
  }
  flush();

  return groups;
}
