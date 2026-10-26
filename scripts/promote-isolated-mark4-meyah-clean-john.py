"""Rehearse or apply Dan's isolated clean-shaven John canon revision.

The previous approved version and all existing picture stay in history. The
live HeartWordData database is outside this script's fixed data root.
"""
import hashlib
import json
import sqlite3
import sys
import time
import uuid
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = (checkout / "output/mark4-donor-20261024").resolve()
if not root.is_relative_to(checkout) or "heartworddata" in str(root).lower():
    raise SystemExit("Refusing a non-isolated HeartWord data root")
mode = sys.argv[1:] or ["--rehearse"]
if mode not in (["--rehearse"], ["--apply"]):
    raise SystemExit("Usage: promote-isolated-mark4-meyah-clean-john.py [--rehearse|--apply]")
apply = mode == ["--apply"]
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
john_id = "3179d3c7-201d-4365-9a41-0e7ef0c49257"
old_id = "f102a96e-54d0-42c7-ac44-7935e332f269"
version_label = "v5-meyah-clean"
assets = root / "assets"
review = root / "review"
candidate_rel = "characters/john-son-of-zebedee/motion/motion-neutral-standing-v5-meyah-candidate.png"
provenance = json.loads((assets / candidate_rel.replace(".png", ".json")).read_text(encoding="utf8"))
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
if provenance["status"] != "awaiting_visual_review" or provenance["output"]["sha256"] != digest(assets / candidate_rel):
    raise SystemExit("John candidate/provenance changed")
if provenance["output"]["sha256"] != "73e88c4a838cac680ec2b2d4e7de624e40fbde4ffc9a3eb23b8e323470b7c4e6":
    raise SystemExit("This is not Dan's reviewed standing candidate")
version_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"heartword:{project_id}:{john_id}:{version_label}:{provenance['output']['sha256']}"))
database = root / "db/heartword.sqlite"
rehearsal = review / "heartword.john-clean-canon-rehearsal-20261026.sqlite"
backup = review / "heartword.before-john-clean-canon-20261026.sqlite"
destination = backup if apply else rehearsal
if destination.exists():
    raise SystemExit(f"Backup/rehearsal destination already exists: {destination}")
with sqlite3.connect(database) as source, sqlite3.connect(destination) as target:
    source.backup(target)
work_db = database if apply else rehearsal
notes = ("Dan approved 2026-10-26: John son of Zebedee is clean-shaven throughout the isolated "
         "Meyah Mark 4 edition. Standing portrait revised from v4 with the already approved clean-shaven "
         "v3 headshot; the other three clean-shaven poses and headshot carry forward. Earlier version, "
         "donor film, live HeartWordData, and Mark 5 Prep are unchanged.")
facts = json.dumps({"description": "John son of Zebedee has a clean-shaven face, with no beard or mustache; retain his approved youthful Papuan face and teal-bordered cream robe.",
                    "prohibitedPromptPhrases": ["bearded John", "John's beard", "John with a beard", "John's mustache"]})
with sqlite3.connect(work_db) as db:
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("BEGIN IMMEDIATE")
    old = db.execute("SELECT character_id,version_label,status,voice_provider,voice_id FROM character_versions WHERE id=?", (old_id,)).fetchone()
    if old != (john_id, "v4", "approved", None, None):
        raise SystemExit(f"Expected approved John v4 with no voice mapping, got {old}")
    if db.execute("SELECT 1 FROM character_versions WHERE character_id=? AND version_label=?", (john_id, version_label)).fetchone():
        raise SystemExit("The isolated clean-shaven version already exists")
    prior = db.execute("SELECT id,category,path,content_hash,story_state,available_from_verse,available_through_verse,asset_role FROM character_assets WHERE character_version_id=?", (old_id,)).fetchall()
    if len(prior) != 5 or sum(item[1] == "body_pose" and "motion-neutral-standing" in item[2] for item in prior) != 1:
        raise SystemExit("Unexpected prior John reference package")
    now = int(time.time() * 1000)
    db.execute("INSERT INTO character_versions(id,character_id,version_label,status,voice_provider,voice_id,locked_visual_facts,notes,created_at) VALUES(?,?,?,'candidate',?,?,?,?,?)",
               (version_id, john_id, version_label, old[3], old[4], facts, notes, now))
    selected = []
    for asset_id, category, path, stored_hash, story_state, from_verse, through_verse, role in prior:
        revised = "motion-neutral-standing" in path
        chosen = candidate_rel if revised else path
        actual_hash = digest(assets / chosen)
        if not revised and stored_hash and stored_hash.lower() != actual_hash:
            raise SystemExit(f"Prior John asset changed: {path}")
        db.execute("INSERT INTO character_assets(id,character_version_id,category,path,content_hash,imported_from,story_state,available_from_verse,available_through_verse,asset_role,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                   (str(uuid.uuid4()), version_id, category, chosen, actual_hash,
                    "Dan-approved isolated clean-shaven Codex candidate, 2026-10-26" if revised else f"Carried forward from approved John v4 asset {asset_id}",
                    story_state, from_verse, through_verse, role, now))
        selected.append({"category": category, "path": chosen, "sha256": actual_hash})
    if sum(item["category"] == "headshot" for item in selected) != 1 or sum(item["category"] == "body_pose" for item in selected) != 4:
        raise SystemExit("John version package is incomplete")
    sequence = db.execute("SELECT COALESCE(MAX(sequence),0) FROM edit_commands WHERE project_id=?", (project_id,)).fetchone()[0]
    stage_payload = {"kind": "isolated_meyah_john_clean_shaven_candidate", "characterId": john_id,
                     "oldVersionId": old_id, "newVersionId": version_id, "assets": selected,
                     "producerReview": "Dan approved the exact standing candidate in chat on 2026-10-26."}
    db.execute("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,?,?,?,?)",
               (str(uuid.uuid4()), project_id, sequence + 1, "stage_isolated_character_version", json.dumps(stage_payload),
                f"meyah-mark4-john-clean-shaven:stage:{provenance['output']['sha256']}", now))
    db.execute("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?, 'character_version',?,'human',?,1,?)",
               (str(uuid.uuid4()), project_id, version_id, notes, now))
    db.execute("UPDATE character_versions SET status='superseded' WHERE id=? AND status='approved'", (old_id,))
    db.execute("UPDATE character_versions SET status='approved' WHERE id=? AND status='candidate'", (version_id,))
    db.execute("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,?,?,?,?)",
               (str(uuid.uuid4()), project_id, sequence + 2, "approve_isolated_character_version",
                json.dumps({"characterId": john_id, "oldVersionId": old_id, "newVersionId": version_id,
                            "scope": "isolated Meyah Mark 4 data only", "producerApproved": True}),
                f"meyah-mark4-john-clean-shaven:approve:{provenance['output']['sha256']}", now))
    db.commit()
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise SystemExit("SQLite quick_check failed")
    current = db.execute("SELECT id FROM character_versions WHERE character_id=? AND status='approved'", (john_id,)).fetchall()
    if current != [(version_id,)]:
        raise SystemExit(f"John approved-version invariant failed: {current}")
receipt = {"kind": "isolated_meyah_mark4_john_canon_revision", "status": "applied" if apply else "rehearsed",
           "projectId": project_id, "characterId": john_id, "oldVersionId": old_id,
           "newVersionId": version_id, "versionLabel": version_label, "sourceCandidateSha256": provenance["output"]["sha256"],
           "assets": selected, "backupPath": str(destination.relative_to(root)).replace("\\", "/"),
           "liveDatabaseOpened": False, "crewPlanNeedsFreshReview": True}
receipt_path = review / ("meyah-mark4-john-clean-canon-application-20261026.json" if apply else
                         "meyah-mark4-john-clean-canon-rehearsal-20261026.json")
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
print(json.dumps(receipt, indent=2))
