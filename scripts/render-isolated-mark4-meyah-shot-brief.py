"""Render the fixed isolated editorial brief beside its source picture inventory."""
from pathlib import Path
import hashlib
import html
import json
import re

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
source = checkout / "docs" / "production" / "mark4-meyah-correspondence-2026-10-25" / "meyah-shot-plan-first-pass.md"
inventory = json.loads((root / "assets" / "review" / "meyah-mark4-correspondence-20261025" / "inventory.json").read_text(encoding="utf8"))
approval = json.loads((root / "review" / "meyah-mark4-speaker-map-producer-approval.json").read_text(encoding="utf8"))
if inventory["sourceReviewId"] != approval["reviewId"] or inventory["alignmentHash"] != approval["alignmentHash"] or len(inventory["scenes"]) != 7 or sum(len(s["shots"]) for s in inventory["scenes"]) != 113:
    raise SystemExit("The visual inventory no longer matches the approved isolated map")

def inline(value: str) -> str:
    links: list[str] = []
    def link(match: re.Match[str]) -> str:
        url = match.group(2)
        if not (url.startswith("http://127.0.0.1:4002/") or url.startswith("../../../output/")):
            raise ValueError("Unsupported editorial link")
        label = html.escape(match.group(1))
        links.append(f'<a href="{html.escape(url, quote=True)}">{label}</a>')
        return f"@@LINK{len(links)-1}@@"
    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, value)
    value = html.escape(value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)
    value = re.sub(r"`([^`]+)`", r"<code>\1</code>", value)
    for n, rendered in enumerate(links):
        value = value.replace(f"@@LINK{n}@@", rendered)
    return value

lines = source.read_text(encoding="utf8").splitlines()
parts: list[str] = []
i = 0
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    if line.startswith("# "):
        parts.append(f"<h1>{inline(line[2:])}</h1>")
        i += 1
        continue
    if line.startswith("## "):
        parts.append(f"<h2>{inline(line[3:])}</h2>")
        i += 1
        continue
    if line.startswith("|") and i+1 < len(lines) and re.match(r"\|[\s|:-]+\|$", lines[i+1].strip()):
        header = [cell.strip() for cell in line.strip("|").split("|")]
        i += 2
        rows = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
            if len(cells) != len(header):
                raise ValueError("Malformed editorial table")
            rows.append("<tr>" + "".join(f"<td>{inline(cell)}</td>" for cell in cells) + "</tr>")
            i += 1
        parts.append("<div class='table-wrap'><table><thead><tr>" + "".join(f"<th>{inline(cell)}</th>" for cell in header) + "</tr></thead><tbody>" + "".join(rows) + "</tbody></table></div>")
        continue
    if re.match(r"^\d+\. ", line):
        items = []
        while i < len(lines) and re.match(r"^\d+\. ", lines[i].strip()):
            items.append(inline(re.sub(r"^\d+\. ", "", lines[i].strip())))
            i += 1
            while i < len(lines) and lines[i].startswith("   "):
                items[-1] += " " + inline(lines[i].strip())
                i += 1
        parts.append("<ol>" + "".join(f"<li>{item}</li>" for item in items) + "</ol>")
        continue
    paragraph = [line]
    i += 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|")) and not re.match(r"^\d+\. ", lines[i].strip()):
        paragraph.append(lines[i].strip())
        i += 1
    parts.append(f"<p>{inline(' '.join(paragraph))}</p>")

title_path = "generated/editorial/language-editions/a5a40890-8bb0-4856-aacb-1dcad97074bb/title-9d7e2950-0100-42b9-879c-9b45e67680fc.mp4"
peter_path = "generated/keyframes/codex/meyah-mark4-peter-v38/peter-facing-sleeping-jesus-candidate-v3.png"
for path in (title_path, peter_path):
    if not (root / "assets" / path).is_file():
        raise SystemExit("A pinned review visual is missing")
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 shot-planning brief</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#e9e8e2;color:#1b3037;font:16px/1.55 system-ui,sans-serif}}header{{background:#173a43;color:white;padding:1.6rem max(1rem,calc((100vw - 1150px)/2))}}header h1{{margin:0}}nav a{{color:#b9eaf4;margin-right:1.2rem}}main{{max-width:1150px;margin:auto;padding:1.6rem}}h1{{font-size:2rem}}h2{{border-bottom:2px solid #b2bcb8;padding-bottom:.3rem;margin-top:2.3rem}}p{{max-width:85ch}}a{{color:#08647d}}.hero{{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.2rem 0}}.hero video,.hero img{{width:100%;aspect-ratio:16/9;object-fit:contain;background:#10232b;border-radius:5px}}.hero figcaption{{font-size:.9rem}}.hero figure{{margin:0}}.callout{{padding:1rem;background:#fff4d7;border-left:5px solid #bd7d1b}}.table-wrap{{overflow:auto}}table{{border-collapse:collapse;background:white;width:100%;min-width:720px}}th,td{{padding:.65rem;border-bottom:1px solid #d3d8d5;text-align:left;vertical-align:top}}th{{background:#e1eceb}}code{{overflow-wrap:anywhere}}ol li{{margin:.5rem 0}}@media(max-width:700px){{.hero{{grid-template-columns:1fr}}main{{padding:1rem}}}}
</style></head><body><header><h1>Markus 4 · Meyah shot planning</h1><nav><a href="/media/review/meyah-mark4-correspondence-20261025/index.html">Inspect all 113 donor placements</a><a href="/media/review/meyah-mark4-speech-binding-20261025/index.html">Hear the approved speaker map</a></nav></header><main><div class="callout"><b>Proposal for review.</b> The source map is approved for planning. Picture trims, omissions, new footage, title selection and voice work are still separate decisions.</div><div class="hero"><figure><video controls preload="metadata" src="/media/{title_path}"></video><figcaption>Existing localized title candidate. Wording is approved; visual selection remains open.</figcaption></figure><figure><img src="/media/{peter_path}" alt="Approved Peter close-up looking toward sleeping Jesus"><figcaption>Dan-approved Peter 4:38 keyframe reference for a future Meyah Avatar take.</figcaption></figure></div>{''.join(parts)}</main></body></html>'''
out = root / "assets" / "review" / "meyah-mark4-shot-plan-20261025" / "index.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page, encoding="utf8")
print(out)
print("SHA256", hashlib.sha256(out.read_bytes()).hexdigest())
