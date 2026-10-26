"""Read-only comparison of crew pause proposals with Dan's approved exact picture map."""
from __future__ import annotations

import html
import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
run_id = "f88ea439-307c-4370-9d6d-dec4697d6e30"
draft = json.loads((root / "review" / "meyah-mark4-full-correspondence-draft.json").read_text(encoding="utf8"))["correspondence"]
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    db.row_factory = sqlite3.Row
    run = db.execute("SELECT brief_json FROM production_runs WHERE id=? AND project_id=? AND phase='planning'", (run_id, project_id)).fetchone()
    event = db.execute("SELECT output_json FROM production_events WHERE run_id=? AND role='creative_director' AND error IS NULL ORDER BY sequence DESC LIMIT 1", (run_id,)).fetchone()
    record = db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' ORDER BY sequence DESC LIMIT 1", (project_id,)).fetchone()
    if not run or not event or not record:
        raise SystemExit("The isolated approved map or valid director treatment is missing")
    brief = json.loads(run[0])
    treatment = json.loads(event[0])["emotionalTreatment"]
    mapped = json.loads(record[0])["shots"]
    if len(brief["shots"]) != 145 or len(mapped) != len(draft) or len(draft) != 147:
        raise SystemExit("The approved source/picture map changed")
    shot_index = {item["targetShotId"]: i for i, item in enumerate(mapped) if item["targetShotId"]}
    audio = {item["id"]: item for item in brief["audio"]}
    shots = {item["id"]: item for item in brief["shots"]}
    rows = []
    for pause in treatment["pauses"]:
        source = audio.get(pause["afterSegmentId"])
        if not source or not pause["coverageShotIds"]:
            raise SystemExit("A proposed pause lacks current source or picture evidence")
        coverage = []
        for shot_id in pause["coverageShotIds"]:
            shot = shots.get(shot_id)
            index = shot_index.get(shot_id)
            if not shot or index is None or shot["needsLipSync"]:
                raise SystemExit("A proposed pause lacks a mapped wordless shot")
            if draft[index]["donorShotId"] != mapped[index]["donorShotId"]:
                raise SystemExit("The target shot differs from the reviewed correspondence")
            coverage.append({"shotId": shot_id, "verseRef": shot["verseRef"], "action": shot["action"]})
        rows.append({"afterSegmentId": source["id"], "afterVerse": source.get("verseRef"),
                     "sourceEndMs": source["endMs"], "durationMs": pause["durationMs"],
                     "purpose": pause["purpose"], "coverage": coverage})
out = root / "assets" / "review" / "meyah-mark4-crew-pause-review-20261025"
out.mkdir(parents=True, exist_ok=True)
report = {"kind": "read_only_crew_pause_vs_producer_picture_map", "projectId": project_id, "runId": run_id,
          "status": "proposal_only_not_applied", "proposedPauseCount": len(rows),
          "addedDurationMs": sum(row["durationMs"] for row in rows),
          "producerMap": "Dan-approved 147-row picture correspondence with exact target windows",
          "sourceOrPictureChanged": False, "providerRequests": 0, "rows": rows}
(out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
table = "".join("<tr><td>" + str(i) + "</td><td>" + html.escape(row["afterVerse"] or "Spoken heading") +
                f"<br>{row['sourceEndMs']/1000:.3f}s</td><td>+{row['durationMs']/1000:.3f}s</td><td>" +
                html.escape(row["purpose"]) + "</td><td>" + "<br>".join(
                    f"{html.escape(item['verseRef'] or '')}: {html.escape(item['action'])}"
                    for item in row["coverage"]) + "</td></tr>" for i, row in enumerate(rows, 1))
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 crew pause review</title><style>body{{font:16px/1.45 system-ui,sans-serif;color:#21353a;background:#eff2ef;margin:0}}main{{max-width:1250px;margin:auto;padding:2rem}}table{{width:100%;border-collapse:collapse;background:white}}th,td{{border:1px solid #cfd9d5;padding:.7rem;text-align:left;vertical-align:top}}th{{background:#dbece5}}small{{display:block;color:#556a68}}.notice{{background:#fff4df;border-left:5px solid #aa6b1a;padding:1rem;margin:1.5rem 0}}</style><main><h1>Meyah Mark 4 · crew pause proposal</h1><p class="notice">The approved 147-row picture map has exact target windows. The corrected crew's Creative Director proposed {len(rows)} extra wordless pauses totaling {report['addedDurationMs']/1000:.3f} seconds. These are planning suggestions only. No pause, source audio, picture placement, or media has changed.</p><p>Review whether the film should keep the approved exact timing or make room for additional pauses during final editing. The first proposal follows the spoken chapter heading; the other proposals are within the chapter.</p><table><thead><tr><th>#</th><th>After source row</th><th>Extra time</th><th>Crew purpose</th><th>Suggested wordless picture already in map</th></tr></thead><tbody>{table}</tbody></table></main></html>'''
(out / "index.html").write_text(page, encoding="utf8")
print(json.dumps({key: value for key, value in report.items() if key != "rows"} |
                 {"url": "http://127.0.0.1:4002/media/review/meyah-mark4-crew-pause-review-20261025/index.html"}, indent=2))
