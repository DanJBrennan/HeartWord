"""Derive an assembly-valid storm timing refinement from Dan's approved plan.

Only 300 ms moves from the last Jesus Avatar picture to the next retained
non-speaking reaction. The approved proposal and receipt remain immutable.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
review = root / "assets" / "review" / "meyah-mark4-storm-shot-review-20261025"
original_path = review / "proposal.json"
original = json.loads(original_path.read_text(encoding="utf8"))
receipt = json.loads((root / "review" / "meyah-mark4-editorial-direction-title-storm-approval.json").read_text(encoding="utf8"))
digest = hashlib.sha256(original_path.read_bytes()).hexdigest()
if digest != receipt["stormShotPlan"]["currentPaperEditSha256"] or receipt["stormShotPlan"]["answer"] != "Approve storm shot plan":
    raise SystemExit("The originally approved storm plan changed")
rows = original["rows"]
by_number = {item["placement"]:item for item in rows}
last_mouth, reaction, final_sea = (by_number[n] for n in (19,20,23))
if (last_mouth["targetStartMs"],last_mouth["targetEndMs"],last_mouth["durationMs"],
    reaction["targetStartMs"],reaction["targetEndMs"],reaction["durationMs"],
    final_sea["targetStartMs"],final_sea["targetEndMs"]) != (784126,788436,4310,788436,789685,1249,789685,805685):
    raise SystemExit("The approved storm timing no longer has the reviewed 300 ms picture tail")
if last_mouth["targetSpeech"] != {"speaker":"Jesus","startMs":784126,"endMs":788136,
                                  "targetSegmentId":last_mouth["targetSpeech"]["targetSegmentId"],
                                  "review":"speech-jesus-v40","pictureTailMs":300}:
    raise SystemExit("The reviewed Jesus quote changed")
if reaction["picture"]["durationMs"] != 8000:
    raise SystemExit("The retained group reaction has no room for the refinement")

refined = copy.deepcopy(original)
r = {item["placement"]:item for item in refined["rows"]}
r[19]["durationMs"] = 4010
r[19]["targetEndMs"] = 788136
r[19]["targetSpeech"].pop("pictureTailMs")
r[19]["reason"] = "End the visible Jesus mouth exactly with the reviewed 4:40 quotation; the following retained group reaction takes the 300 ms transition."
r[20]["durationMs"] = 1549
r[20]["targetStartMs"] = 788136
r[20]["reason"] = "Use 1.549 seconds of the same retained group reaction, beginning immediately after Jesus' reviewed question; the final sea still starts at 789.685 seconds."
refined["kind"] = "read_only_storm_assembly_refinement"
refined["status"] = "technical_refinement_not_saved_to_database"
refined["parentApprovedProposalSha256"] = digest
refined["technicalChange"] = "Move 300 ms from Jesus Avatar picture tail to the immediately following retained silent group reaction; no media, story, omission or final-sea change."
for prior,current in zip(rows,refined["rows"]):
    if prior["placement"] not in (19,20) and prior != current:
        raise SystemExit("An unrelated storm row changed")
if sum(item["durationMs"] for item in refined["rows"]) != 132792 or r[23]["targetStartMs"] != 789685:
    raise SystemExit("The storm refinement shifted the total or final sea")
if r[19]["targetEndMs"] != r[20]["targetStartMs"] or r[20]["targetEndMs"] != r[23]["targetStartMs"]:
    raise SystemExit("The refined Jesus-to-reaction-to-sea cut has a gap")

path = review / "assembly-ready-proposal.json"
path.write_text(json.dumps(refined,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
print(json.dumps({"refinement":str(path),"approvedProposalSha256":digest,
                  "jesusPictureEndMs":788136,"reactionStartMs":788136,"finalSeaStartMs":789685},indent=2))
