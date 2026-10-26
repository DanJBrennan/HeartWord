"""Pin Dan's exact approval of the 34 target-only beat cast selections."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

checkout=Path(__file__).resolve().parents[1]
root=checkout/"output"/"mark4-donor-20261024"
review=root/"review"
draft_path=review/"meyah-mark4-full-correspondence-draft.json"
page_path=root/"assets"/"review"/"meyah-mark4-new-beat-cast-review-20261025.html"
draft=json.loads(draft_path.read_text(encoding="utf8"))
main=json.loads((review/"meyah-mark4-main-shot-plan-producer-approval.json").read_text(encoding="utf8"))
storm=json.loads((review/"meyah-mark4-editorial-direction-title-storm-approval.json").read_text(encoding="utf8"))
if draft["projectId"]!="a5a40890-8bb0-4856-aacb-1dcad97074bb" or draft["mainApprovalSha256"]!=main["proposalSha256"]:
    raise SystemExit("The full correspondence is outside Dan's approved main map")
if draft["stormApprovedSha256"]!=storm["stormShotPlan"]["currentPaperEditSha256"] or len(draft["castReview"])!=34 or len(draft["correspondence"])!=147:
    raise SystemExit("The cast list or approved storm map changed")
if sum(not item["castNames"] for item in draft["castReview"])!=14:
    raise SystemExit("The no-named-character choices changed")
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro",uri=True) as db:
    count=db.execute("SELECT COUNT(*) FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)",(draft["projectId"],)).fetchone()[0]
    if count!=0:raise SystemExit("Target shots already exist; this approval belongs to the pre-stage-3 cast list")
def sha(path:Path)->str:return hashlib.sha256(path.read_bytes()).hexdigest()
receipt={"kind":"producer_new_beat_cast_approval","recordedDate":"2026-10-25","reviewer":"Dan",
         "answer":"Approve the cast list","projectId":draft["projectId"],
         "scope":"exact_named_character_subsets_for_34_new_meyah_mark4_picture_beats",
         "draftPath":str(draft_path.relative_to(root)).replace("\\","/"),"draftSha256":sha(draft_path),
         "castReviewPagePath":str(page_path.relative_to(root)).replace("\\","/"),"castReviewPageSha256":sha(page_path),
         "newBeats":34,"noNamedCharacterBeats":14,
         "note":"Dan approved all proposed named cast subsets and empty sets for environmental/anonymous cutaways. The original donor cast remains unchanged; this authorizes the reviewed isolated target correspondence, not media generation or a finished film.",
         "excludes":["provider_request","generated_picture","voice_conversion","avatar_take","finished_film"]}
out=review/"meyah-mark4-new-beat-cast-producer-approval.json"
rendered=json.dumps(receipt,indent=2,ensure_ascii=False)+"\n"
if out.exists() and out.read_text(encoding="utf8")!=rendered:raise SystemExit("A different cast approval receipt already exists")
out.write_text(rendered,encoding="utf8")
print(json.dumps({"receipt":str(out),"draftSha256":receipt["draftSha256"],"newBeats":34,"targetShots":0},indent=2))
