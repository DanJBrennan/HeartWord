"""Read-only comparison of Dan's approved source-clock map and saved stage-3 order."""
from __future__ import annotations

import hashlib
import html
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assert root.is_relative_to(checkout) and "heartworddata" not in str(root).lower()
review = root / "assets" / "review"
main_path = review / "meyah-mark4-main-shot-review-20261025" / "proposal.json"
storm_path = review / "meyah-mark4-storm-shot-review-20261025" / "assembly-ready-proposal.json"
approved = json.loads(main_path.read_text(encoding="utf8"))["rows"] + json.loads(storm_path.read_text(encoding="utf8"))["rows"]
project = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
conn = sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
saved = json.loads(conn.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])
revision = json.loads(conn.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='revise_language_edition' AND undone=0 ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])
assert len(approved) == len(saved["shots"]) == len(revision["correspondence"]) == 147
approval = json.loads((root / "review" / "meyah-mark4-main-shot-plan-producer-approval.json").read_text())
assert approval["answer"] == "Approve the detailed map" and approval["proposalSha256"] == hashlib.sha256(main_path.read_bytes()).hexdigest()
assert approval["scope"] == "source_clock_picture_order_and_verse_grounded_new_coverage_for_mark_4_1_through_34"
assert saved["planHash"] == "34bdfedd82b4b7dead32019850877115e69a7935c578b42b988ec90d17c696e7"

differences = []
misplaced_speech = []
for position, (planned, materialized, direction) in enumerate(zip(approved, saved["shots"], revision["correspondence"]), 1):
    assert materialized["donorShotId"] == direction["donorShotId"]
    current = conn.execute("SELECT action,verse_ref,needs_lip_sync FROM shots WHERE id=?", (materialized["targetShotId"],)).fetchone() if materialized["targetShotId"] else None
    if planned["donorShotId"] != materialized["donorShotId"]:
        differences.append({"placement": position, "sourceWindowMs": [planned["targetStartMs"], planned["targetEndMs"]],
                            "approvedDonorShotId": planned["donorShotId"], "approvedAction": planned["action"],
                            "currentDonorShotId": materialized["donorShotId"], "currentTargetShotId": materialized["targetShotId"],
                            "currentAction": current["action"] if current else "Omitted picture",
                            "currentTreatment": materialized["treatment"]})
    if current and current["needs_lip_sync"] and direction["targetStartMs"] is not None:
        if (planned["targetStartMs"], planned["targetEndMs"]) != (direction["targetStartMs"], direction["targetEndMs"]):
            misplaced_speech.append({"placement": position, "currentTargetShotId": materialized["targetShotId"],
                                     "approvedPictureWindowMs": [planned["targetStartMs"], planned["targetEndMs"]],
                                     "boundSpeechWindowMs": [direction["targetStartMs"], direction["targetEndMs"]],
                                     "currentAction": current["action"]})
spans = []
for item in differences:
    if not spans or item["placement"] > spans[-1][-1] + 1:
        spans.append([item["placement"]])
    else:
        spans[-1].append(item["placement"])
planned_groups = defaultdict(list)
saved_groups = defaultdict(list)
for index, row in enumerate(approved):
    planned_groups[(row["donorShotId"], row["pipelineTreatment"])].append(index)
for index, row in enumerate(revision["correspondence"]):
    saved_groups[(row["donorShotId"], row["treatment"])].append(index)
assert set(planned_groups) == set(saved_groups)
permutation = [None] * len(approved)
ambiguous = []
for key, planned_positions in planned_groups.items():
    current_positions = saved_groups[key]
    assert len(planned_positions) == len(current_positions)
    for planned_index, current_index in zip(planned_positions, current_positions):
        planned, direction = approved[planned_index], revision["correspondence"][current_index]
        if direction.get("addedForEdition") and planned["action"] != direction.get("addedAction"):
            ambiguous.append({"plannedPlacement": planned_index + 1, "currentPlacement": current_index + 1,
                              "reason": "New-beat action differs within a repeated donor group"})
        source_speech = planned.get("targetSpeech")
        if source_speech and (source_speech["startMs"], source_speech["endMs"]) != (direction.get("targetStartMs"), direction.get("targetEndMs")):
            ambiguous.append({"plannedPlacement": planned_index + 1, "currentPlacement": current_index + 1,
                              "reason": "Bound speech differs within a repeated donor group"})
        picture = planned.get("picture") or {}
        if picture.get("kind") == "accepted_handle" and picture.get("attemptId") != (direction.get("pictureReuse") or {}).get("attemptId"):
            ambiguous.append({"plannedPlacement": planned_index + 1, "currentPlacement": current_index + 1,
                              "reason": "Retained handle differs within a repeated donor group"})
        permutation[planned_index] = current_index + 1
assert all(position is not None for position in permutation)
origin = json.loads(conn.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='derive_language_edition' ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])
render_id = origin["preflight"]["donor"]["renderId"]
donor_timeline = json.loads(conn.execute("SELECT timeline_json FROM chapter_render_manifests WHERE render_id=?", (render_id,)).fetchone()[0])
original_frames = defaultdict(list)
approved_frames = defaultdict(list)
for clip in donor_timeline:
    if clip.get("shotId"):
        original_frames[clip["shotId"]].append((round(clip["startMs"] * 24 / 1000), round(clip["endMs"] * 24 / 1000) - 1))
for row in approved:
    if not row.get("addedForEdition"):
        approved_frames[row["donorShotId"]].append((row.get("donorStartFrame"), row.get("donorEndFrame")))
assert dict(original_frames) == dict(approved_frames)
report = {"kind": "read_only_meyah_mark4_approved_picture_order_audit", "projectId": project,
          "status": "production_hold", "approvedMainProposalSha256": approval["proposalSha256"],
          "savedPlanHash": saved["planHash"], "positions": len(approved),
          "differentDonorPositions": len(differences), "differentPositionSpans": [[span[0], span[-1]] for span in spans],
          "speakingShotsAtDifferentSourceWindows": len(misplaced_speech),
          "approvedToCurrentPlacement": permutation, "ambiguousRepeatedDonorMatches": ambiguous,
          "perDonorOriginalFrameOrderPreserved": True,
          "differences": differences, "misplacedSpeech": misplaced_speech,
          "databaseWrites": 0, "providerRequests": 0, "liveDatabaseOpened": False}
out = review / "meyah-mark4-approved-order-audit-20261026"
out.mkdir(parents=True, exist_ok=True)
(out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")

def fmt(ms: int) -> str:
    return f"{ms // 60000:02}:{(ms % 60000) / 1000:06.3f}"

table = "".join(f"<tr><td>{row['placement']}</td><td>{fmt(row['sourceWindowMs'][0])}–{fmt(row['sourceWindowMs'][1])}</td>"
                f"<td>{html.escape(row['approvedAction'])}</td><td>{html.escape(row['currentAction'])}</td></tr>" for row in differences)
speech = "".join(f"<li>#{row['placement']}: picture {fmt(row['approvedPictureWindowMs'][0])}–{fmt(row['approvedPictureWindowMs'][1])}, speech {fmt(row['boundSpeechWindowMs'][0])}–{fmt(row['boundSpeechWindowMs'][1])}</li>" for row in misplaced_speech)
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 approved-order audit</title><style>body{{margin:0;background:#eef2ef;color:#193339;font:15px/1.45 system-ui,sans-serif}}main{{max-width:1450px;margin:auto;padding:2rem}}.notice{{background:#fff1dc;border-left:5px solid #a45a18;padding:1rem}}table{{border-collapse:collapse;width:100%;background:white}}td,th{{border:1px solid #d0dcd6;padding:.55rem;vertical-align:top;text-align:left}}th{{background:#dcece5}}td:nth-child(3),td:nth-child(4){{min-width:24rem}}.scroll{{overflow:auto}}</style><main><h1>Meyah Mark 4 · approved picture order audit</h1><div class="notice"><p>Dan approved the exact 122-row source-clock map for 4:1–34. The current isolated stage-3 shot order differs in {len(differences)} of 147 positions. {len(misplaced_speech)} visibly speaking shots now sit at a different source window from their saved speech binding. This is a production hold; no film has been assembled.</p><p>The previous crew review is preserved. The new rerun was stopped after four metered calls, before any production video request. The accepted first keyframe and cast audio remain retained. No database row was changed by this audit.</p></div><h2>Speaking-window examples</h2><ul>{speech}</ul><h2>Ordered picture differences</h2><div class="scroll"><table><thead><tr><th>Placement</th><th>Approved source clock</th><th>Dan-approved action</th><th>Current target action at this position</th></tr></thead><tbody>{table}</tbody></table></div><p><a href="report.json">Machine-readable evidence</a></p></main>'''
(out / "index.html").write_text(page, encoding="utf8")
conn.close()
print(json.dumps({"differentDonorPositions": len(differences), "speakingShotsAtDifferentSourceWindows": len(misplaced_speech),
                  "spans": report["differentPositionSpans"],
                  "url": "http://127.0.0.1:4002/media/review/meyah-mark4-approved-order-audit-20261026/index.html"}, indent=2))
