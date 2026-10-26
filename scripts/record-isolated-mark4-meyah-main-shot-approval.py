"""Pin Dan's approval of the exact, read-only 4:1–34 paper edit."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
review = root / "review"
path = root / "assets" / "review" / "meyah-mark4-main-shot-review-20261025" / "proposal.json"
proposal = json.loads(path.read_text(encoding="utf8"))
source = json.loads((review / "meyah-mark4-speaker-map-producer-approval.json").read_text(encoding="utf8"))
if proposal["sourceReviewId"] != source["reviewId"] or proposal["alignmentHash"] != source["alignmentHash"]:
    raise SystemExit("The approved source map changed")
rows = proposal["rows"]
if len(rows) != 122 or proposal["sceneStartMs"] != 0 or proposal["sceneEndMs"] != 672893:
    raise SystemExit("The reviewed main shot proposal changed")
if sum(bool(x.get("addedForEdition")) for x in rows) != 32 or sum(x["durationMs"] for x in rows if x.get("addedForEdition")) != 176181:
    raise SystemExit("The reviewed new picture plan changed")
if rows[0]["targetStartMs"] != 0 or rows[-1]["targetEndMs"] != 672893 or any(a["targetEndMs"] != b["targetStartMs"] for a,b in zip(rows,rows[1:])):
    raise SystemExit("The reviewed source clock has a gap")
with sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro",uri=True) as db:
    current = db.execute("SELECT source_hash,alignment_hash FROM source_alignment_reviews WHERE id=? AND project_id=?",
                         (source["reviewId"],source["projectId"])).fetchone()
    if current != (source["sourceHash"],source["alignmentHash"]):
        raise SystemExit("The named source review changed")
    count = db.execute("SELECT COUNT(*) FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)",(source["projectId"],)).fetchone()[0]
    if count: raise SystemExit("Target shots already exist; this approval receipt is for the proposal before stage 3")
receipt = {"kind":"producer_main_shot_plan_approval","recordedDate":"2026-10-25",
           "projectId":source["projectId"],"sourceReviewId":source["reviewId"],
           "sourceAlignmentHash":source["alignmentHash"],"reviewer":"Dan",
           "answer":"Approve the detailed map",
           "scope":"source_clock_picture_order_and_verse_grounded_new_coverage_for_mark_4_1_through_34",
           "proposalPath":str(path.relative_to(root)).replace("\\","/"),
           "proposalSha256":hashlib.sha256(path.read_bytes()).hexdigest(),
           "rows":122,"donorPlacements":90,"newSilentBeats":32,"newSilentPictureMs":176181,
           "note":"Dan approved the detailed planning proposal, including the reordered 4:13–20 explanation and silent 4:9 transition. The separate storm approval and its 300 ms technical refinement complete the full-chapter picture draft.",
           "excludes":["provider_request","voice_conversion","avatar_take","generated_picture","finished_film"]}
out = review / "meyah-mark4-main-shot-plan-producer-approval.json"
rendered = json.dumps(receipt,indent=2,ensure_ascii=False)+"\n"
if out.exists() and out.read_text(encoding="utf8") != rendered:
    raise SystemExit("A different main shot approval receipt already exists")
out.write_text(rendered,encoding="utf8")
print(json.dumps({"receipt":str(out),"proposalSha256":receipt["proposalSha256"],"targetShots":0},indent=2))
