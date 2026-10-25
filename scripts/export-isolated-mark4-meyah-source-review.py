"""Export the provisional Meyah timing rows for native listening review.

The isolated database is opened read-only. The TSV is a review aid, never a
source approval, speaker assignment, or exact mouth-timing decision.
"""
import csv
import hashlib
import html
import json
import sqlite3
import sys
from pathlib import Path

CHECKOUT = Path(__file__).resolve().parent.parent
ROOT = CHECKOUT / "output" / "mark4-donor-20261024"
DB_PATH = ROOT / "db" / "heartword.sqlite"
PACK = CHECKOUT / "docs" / "production" / "mark4-meyah-source-review-2026-10-25"
PROJECT = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
AUDIO = "source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3"

def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def clock(ms: int) -> str:
    seconds = ms // 1000
    return f"{seconds // 60:02d}:{seconds % 60:02d}.{ms % 1000:03d}"

def main() -> None:
    if sys.argv[1:] != ["--apply"]:
        raise SystemExit("Use exactly --apply")
    if ROOT.is_symlink() or DB_PATH.is_symlink() or not DB_PATH.is_file():
        raise ValueError("Expected the fixed isolated database")
    audio = (ROOT / "assets" / AUDIO).resolve()
    if not audio.is_relative_to((ROOT / "assets").resolve()) or not audio.is_file():
        raise ValueError("Expected the staged Meyah recording")
    db = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    try:
        project = db.execute("SELECT language,book,chapter FROM projects WHERE id=?", (PROJECT,)).fetchone()
        if project != ("meyah", "mark", 4):
            raise ValueError("Expected the isolated Meyah Mark 4 project")
        rows = db.execute("""SELECT id,verse_ref,start_ms,end_ms,confidence,speaker_character_id,source_path
            FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms""", (PROJECT,)).fetchall()
        if len(rows) != 40 or rows[0][1] is not None or rows[0][2:4] != (0, 4094) or any(row[6] != AUDIO or row[5] is not None for row in rows):
            raise ValueError("Expected a provisional spoken heading and 39 unassigned verse intervals")
        if rows[0][2] != 0 or any(rows[i][3] != rows[i + 1][2] for i in range(len(rows) - 1)):
            raise ValueError("Draft source coverage has a gap or overlap")
        PACK.mkdir(parents=True, exist_ok=True)
        output = PACK / "provisional-verse-timing.tsv"
        with output.open("w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file, delimiter="\t")
            writer.writerow(["sequence", "segmentId", "verseRef", "start", "end", "startMs", "endMs",
                "durationMs", "automatedConfidence", "speaker", "reviewStatus"])
            for index, (segment, verse, start, end, confidence, speaker, _) in enumerate(rows, 1):
                writer.writerow([index, segment, verse or "Spoken chapter heading (provisional)", clock(start), clock(end), start, end, end - start,
                    confidence, speaker or "unassigned", "needs_native_source_review"])
        table = "\n".join(
            f'<tr><td>{index}</td><td>{html.escape(verse or "Spoken chapter heading (provisional)")}</td><td>'
            f'<button type="button" data-start="{start}">{clock(start)}</button></td>'
            f'<td>{clock(end)}</td><td>{confidence}</td><td>Unassigned</td></tr>'
            for index, (_, verse, start, end, confidence, _, _) in enumerate(rows, 1)
        )
        relative_audio = f"../../../output/mark4-donor-20261024/assets/{AUDIO}"
        page = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meyah Mark 4 source review</title>
<style>
body{{font:16px/1.5 system-ui,sans-serif;max-width:1080px;margin:2rem auto;padding:0 1rem;color:#19292a;background:#f7f4ec}}
h1{{line-height:1.2}}.note{{background:#fff0c4;padding:1rem;border-left:5px solid #a97900}}
audio{{width:100%;position:sticky;top:0;background:#f7f4ec;padding:.5rem 0}}
table{{border-collapse:collapse;width:100%;background:white}}th,td{{border-bottom:1px solid #d6d6d0;padding:.55rem;text-align:left}}
th{{position:sticky;top:4.5rem;background:#e9eee8}}button{{font:inherit;padding:.2rem .5rem;cursor:pointer}}
</style>
<main><h1>Meyah Mark 4: listen and check</h1>
<p class="note">The spoken chapter heading is separated provisionally at 4.094 seconds, the midpoint of a measured 3.327–4.861 second pause. The 39 verse boundaries remain silence-based estimates, not confirmed word alignment. The current verse 1 estimate is over a minute and verse 41 is about one second: check both closely. Click a start time to hear from there; keep listening past the proposed end before correcting a boundary. No speaker or Scripture review has been approved.</p>
<p>Compare the full recording with the staged <a href="../../../output/mark4-donor-20261024/assets/source/meyah/text/Mark/Mark%204.docx">Meyah Mark 4 document</a>. Check whether the preceding words and recording cover reference-only entries <strong>6 (4:5)</strong> and <strong>19 (4:18)</strong>. Record uncertainty without adding missing words.</p>
<audio id="recording" controls preload="metadata" src="{html.escape(relative_audio, quote=True)}"></audio>
<table><thead><tr><th>#</th><th>Reference</th><th>Play from</th><th>Estimated end</th><th>Confidence</th><th>Speaker</th></tr></thead>
<tbody>{table}</tbody></table>
<p>Review evidence and exact corrections should be entered through HeartWord's source review workflow; this page does not write to the project.</p>
</main><script>document.querySelectorAll('button[data-start]').forEach(button=>button.addEventListener('click',()=>{{
const audio=document.getElementById('recording');audio.currentTime=Number(button.dataset.start)/1000;audio.play();
}}));</script></html>"""
        (PACK / "listen.html").write_text(page, encoding="utf-8")
        print(json.dumps({"intervals": len(rows), "coverageMs": rows[-1][3], "audioSha256": sha(audio),
            "speakerAssignments": 0, "sourceApprovals": 0, "output": str(output),
            "listeningPage": str(PACK / "listen.html")}, indent=2))
    finally:
        db.close()

if __name__ == "__main__":
    main()
