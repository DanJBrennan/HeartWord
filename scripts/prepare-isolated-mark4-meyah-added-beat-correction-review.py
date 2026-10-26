"""Read-only comparison of approved new beats and donor-specific inherited fields."""
from __future__ import annotations

import html
import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assert root.is_relative_to(checkout) and "heartworddata" not in str(root).lower()
audit = json.loads((root / "review" / "meyah-mark4-added-beat-inheritance-audit.json").read_text(encoding="utf8"))
db = sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True)
items = []
for row in audit["rows"]:
    cast = [value[0] for value in db.execute("SELECT c.name FROM shot_characters sc JOIN characters c ON c.id=sc.character_id WHERE sc.shot_id=? ORDER BY c.name", (row["targetShotId"],))]
    proposed = {"framing": None, "cameraMovement": None, "spatialView": None,
                "continuityNotes": None, "crowdDensity": "empty" if not cast else None}
    items.append({**row, "cast": cast, "proposed": proposed})
assert len(items) == 34
out = root / "assets" / "review" / "meyah-mark4-added-beat-metadata-review-20261026"
out.mkdir(parents=True, exist_ok=True)
data = {"kind": "read_only_meyah_added_beat_metadata_proposal", "projectId": audit["projectId"],
        "status": "proposal_only", "scope": "34 producer-approved new picture beats; donor and retained picture unchanged",
        "proposalRule": "Clear copied donor-specific camera, spatial and continuity fields. Leave approved action, verse, cast, timing and scene lighting intact. Set crowd density empty only for an approved empty cast; otherwise leave unassigned for crew review.",
        "items": items}
(out / "proposal.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf8")

def esc(value: object) -> str:
    return html.escape("" if value is None else str(value))

rows = []
for row in items:
    current = (f"<b>{esc(row['framing'])}</b> / {esc(row['cameraMovement'])}<br>"
               f"<b>Spatial:</b> {esc(row['spatialView'])}<br>"
               f"<b>Continuity:</b> {esc(row['continuityNotes'])}")
    flag = "<span class=flag>old speech note</span>" if row["inheritedSpeechNote"] else ""
    proposed = "Camera and spatial view to be directed by the fresh crew review; old shot-specific continuity cleared. "
    proposed += "No on-screen people (empty cast)." if not row["cast"] else "Named cast remains exact; crowd density to be reviewed."
    rows.append(f"<tr id='p{row['placement']}'><td>{row['placement']}</td><td>{esc(row['verseRef'])}</td>"
                f"<td>{esc(row['approvedAction'])}<br><small>Cast: {esc(', '.join(row['cast']) or 'none')}</small></td>"
                f"<td>{flag}{current}</td><td>{esc(proposed)}</td></tr>")
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 added-beat metadata</title><style>body{{margin:0;background:#eef2ef;color:#17323a;font:15px/1.45 system-ui,sans-serif}}main{{max-width:1550px;margin:auto;padding:2rem}}.summary{{background:white;border:1px solid #ced7d3;border-radius:10px;padding:1rem}}.scroll{{overflow:auto}}table{{border-collapse:collapse;width:100%;background:white}}th,td{{padding:.6rem;border:1px solid #d3dcd8;text-align:left;vertical-align:top}}th{{background:#dfece8;position:sticky;top:0}}td:nth-child(3){{min-width:18rem}}td:nth-child(4){{min-width:28rem;white-space:pre-wrap}}td:nth-child(5){{min-width:19rem}}small{{color:#54676a}}.flag{{display:inline-block;color:#842f1c;background:#fff0e9;padding:.15rem .35rem;border-radius:4px;margin-bottom:.3rem}}</style><main><h1>Meyah Mark 4 · new-beat metadata review</h1><div class="summary"><p>This is a read-only proposal. The 34 approved new picture actions, verses, cast, exact timing, donor picture and scene lighting remain as Dan approved. Their materialized target shots copied camera, spatial and continuity fields from different Hatam donor actions. Fourteen inherited old speaking notes, including silent field and plant cutaways.</p><p>Proposed correction: clear those five copied shot-specific fields; mark crowd density <em>empty</em> only where the approved cast is empty. A new standard whole-chapter crew would then plan fresh camera and continuity direction from the approved Meyah actions. The previous crew and costs remain in history. No database change or paid call has occurred from this page.</p></div><div class="scroll"><table><thead><tr><th>#</th><th>Verse</th><th>Approved new beat</th><th>Currently inherited donor fields</th><th>Proposed target state before crew</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div></main></html>'''
(out / "index.html").write_text(page, encoding="utf8")
print(json.dumps({"items": len(items), "staleSpeechNotes": sum(row["inheritedSpeechNote"] for row in items),
                  "url": "http://127.0.0.1:4002/media/review/meyah-mark4-added-beat-metadata-review-20261026/index.html"}, indent=2))
