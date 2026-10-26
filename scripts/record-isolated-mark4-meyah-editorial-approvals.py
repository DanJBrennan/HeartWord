"""Pin Dan's three planning and title answers without selecting target shots.

This fixed-root receipt keeps the approvals reviewable while the normal title
selection waits for stage 3's chapter intro plan. SQLite is opened read-only.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assets = root / "assets"
review = root / "review"
project = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
source_approval = json.loads((review / "meyah-mark4-speaker-map-producer-approval.json").read_text(encoding="utf8"))
storm_path = assets / "review" / "meyah-mark4-storm-shot-review-20261025" / "proposal.json"
storm = json.loads(storm_path.read_text(encoding="utf8"))
brief_path = checkout / "docs" / "production" / "mark4-meyah-correspondence-2026-10-25" / "meyah-shot-plan-first-pass.md"

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

if storm["sourceReviewId"] != source_approval["reviewId"] or storm["alignmentHash"] != source_approval["alignmentHash"]:
    raise SystemExit("The storm paper edit no longer uses Dan's approved source map")
if storm["sceneStartMs"] != 672893 or storm["sceneEndMs"] != 805685 or len(storm["rows"]) != 25:
    raise SystemExit("The reviewed storm paper edit changed")
if sum(row["durationMs"] for row in storm["rows"]) != 132792:
    raise SystemExit("The storm edit no longer covers the complete Meyah scene")
by_placement = {row["placement"]: row for row in storm["rows"]}
if [n for n in (21, 22) if by_placement[n]["treatment"] == "omit_picture"] != [21, 22]:
    raise SystemExit("The two reviewed edition omissions changed")
if by_placement[23]["durationMs"] != 16000 or by_placement[23]["targetEndMs"] != 805685:
    raise SystemExit("The preserved final sea changed")

with sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    saved_source = db.execute("SELECT source_hash,alignment_hash FROM source_alignment_reviews WHERE id=? AND project_id=?",
                              (source_approval["reviewId"], project)).fetchone()
    if saved_source != (source_approval["sourceHash"], source_approval["alignmentHash"]):
        raise SystemExit("The isolated named source approval is unavailable")
    title_row = db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='build_edition_title_candidate' AND undone=0",
                           (project,)).fetchone()
    title = json.loads(title_row[0]) if title_row else None
    if not title or title["title"] != "Markus 4" or title["language"] != "Meyah" or title["durationMs"] != 4000:
        raise SystemExit("The approved title candidate is unavailable")
    if db.execute("SELECT COUNT(*) FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)", (project,)).fetchone()[0] != 0:
        raise SystemExit("Target shots exist; this planning-only receipt must not be applied after casting")
    if db.execute("SELECT COUNT(*) FROM edit_commands WHERE project_id=? AND command_type='revise_language_edition'", (project,)).fetchone()[0] != 0:
        raise SystemExit("A target correspondence revision already exists")
title_file = assets / title["path"]
if sha(title_file) != title["sha256"]:
    raise SystemExit("The reviewed title picture changed")

# Fingerprint the editorial timing, source selection and explicit treatments.
# Prose clarifications can change later without converting this approval into
# a blanket acceptance of a generated image or final target shot revision.
storm_choices = [{key: row.get(key) for key in ("placement", "donorShotId", "treatment", "targetStartMs",
                                               "targetEndMs", "durationMs", "picture", "targetSpeech")}
                 for row in storm["rows"]]
storm_fingerprint = hashlib.sha256(json.dumps(storm_choices, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
receipt = {
    "kind": "producer_editorial_review_receipt",
    "recordedDate": "2026-10-25",
    "projectId": project,
    "sourceReviewId": source_approval["reviewId"],
    "sourceAlignmentHash": source_approval["alignmentHash"],
    "editorialDirection": {
        "reviewer": "Dan", "answer": "Approve the editorial direction",
        "scope": "scene_by_scene_coverage_direction_for_detailed_shot_mapping",
        "briefPath": str(brief_path.relative_to(checkout)).replace("\\", "/"),
        "currentBriefSha256": sha(brief_path),
        "note": "The brief acquired a link to the storm paper edit after the question was sent; the approved scene direction itself did not change.",
    },
    "titleVisual": {
        "reviewer": "Dan", "answer": "Approve this title visual",
        "title": "Markus 4", "language": "Meyah", "durationMs": 4000,
        "candidatePath": title["path"], "candidateSha256": title["sha256"],
        "scope": "visual_selection_for_later_existing_opening_beat",
        "note": "The normal title selection waits for the stage-3 intro plan; no editorial beat is selected by this receipt.",
    },
    "stormShotPlan": {
        "reviewer": "Dan", "answer": "Approve storm shot plan",
        "scope": "detailed_ending_plan_for_complete_chapter_correspondence",
        "paperEditPath": str(storm_path.relative_to(root)).replace("\\", "/"),
        "currentPaperEditSha256": sha(storm_path),
        "editorialChoicesSha256": storm_fingerprint,
        "sourceStartMs": 672893, "sourceEndMs": 805685,
        "proposedOmissions": [21, 22], "preservedFinalSeaMs": 16000,
        "note": "Approval concerns the selected footage, three silent beats, actor timing, omissions and final sea. Exact new-beat action wording and the eventual full target correspondence remain subject to their own review.",
    },
    "excludes": ["target_shot_revision", "title_beat_selection", "voice_audition", "provider_request",
                 "generated_keyframe", "avatar_take", "finished_film"],
}
path = review / "meyah-mark4-editorial-direction-title-storm-approval.json"
rendered = json.dumps(receipt, indent=2, ensure_ascii=False) + "\n"
if path.exists() and path.read_text(encoding="utf8") != rendered:
    raise SystemExit("A different planning approval receipt already exists")
path.write_text(rendered, encoding="utf8")
print(json.dumps({"receipt": str(path), "titleSha256": title["sha256"],
                  "stormEditorialChoicesSha256": storm_fingerprint, "targetShots": 0}, indent=2))
