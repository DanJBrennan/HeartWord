"""Apply Dan's reviewed metadata correction to 34 isolated Meyah picture beats.

Dry-run by default. This never opens the live HeartWordData database.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import time
import uuid
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assert root.is_relative_to(checkout) and "heartworddata" not in str(root).lower()
db_path = root / "db" / "heartword.sqlite"
proposal_path = root / "assets" / "review" / "meyah-mark4-added-beat-metadata-review-20261026" / "proposal.json"
backup_path = root / "review" / "heartword.before-added-beat-metadata-correction-20261026.sqlite"
receipt_path = root / "review" / "meyah-mark4-added-beat-metadata-correction-20261026.json"
project = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
plan_hash = "34bdfedd82b4b7dead32019850877115e69a7935c578b42b988ec90d17c696e7"
prior_crew = "f88ea439-307c-4370-9d6d-dec4697d6e30"
key = "meyah-mark4-added-beat-metadata-correction-20261026"
apply = sys.argv[1:] == ["--apply"]
if sys.argv[1:] not in ([], ["--apply"]):
    raise SystemExit("Usage: python scripts/apply-isolated-mark4-meyah-added-beat-correction.py [--apply]")

proposal_bytes = proposal_path.read_bytes()
proposal = json.loads(proposal_bytes)
items = proposal["items"]
assert proposal["status"] == "proposal_only" and proposal["projectId"] == project
assert len(items) == 34 and len({item["targetShotId"] for item in items}) == 34
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    old = conn.execute("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?", (project, key)).fetchone()
    if old:
        print(json.dumps({"status": "already_applied", "receipt": str(receipt_path),
                          "changedShots": len(json.loads(old[0])["changes"])}, indent=2))
        raise SystemExit(0)
    current = conn.execute("SELECT id,status FROM production_runs WHERE project_id=? AND phase='planning' ORDER BY created_at DESC,rowid DESC LIMIT 1", (project,)).fetchone()
    assert current and (current["id"], current["status"]) == (prior_crew, "approved")
    mapping = json.loads(conn.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])
    assert mapping["planHash"] == plan_hash and len(mapping["shots"]) == 147
    reviewed = json.loads(conn.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='revise_language_edition' AND undone=0 ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])["correspondence"]
    assert len(reviewed) == 147 and sum(bool(item.get("addedForEdition")) for item in reviewed) == 34
    selected = {row["targetShotId"]: row for row in mapping["shots"] if row["targetShotId"]}
    changes = []
    for item in items:
        shot_id = item["targetShotId"]
        mapped = selected.get(shot_id)
        assert mapped and mapped["donorShotId"] == item["donorShotId"] and mapped["treatment"] == "needs_coverage"
        approved = reviewed[item["placement"] - 1]
        assert approved["addedForEdition"] and approved["donorShotId"] == mapped["donorShotId"]
        assert approved["addedAction"] == item["approvedAction"] and approved["addedVerseRef"] == item["verseRef"]
        shot = conn.execute("SELECT sh.* FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?", (shot_id, project)).fetchone()
        donor = conn.execute("SELECT * FROM shots WHERE id=?", (item["donorShotId"],)).fetchone()
        assert shot and shot["action"] == item["approvedAction"] and shot["verse_ref"] == item["verseRef"]
        assert donor and shot["crowd_density"] == donor["crowd_density"]
        assert shot["needs_lip_sync"] == 0 and shot["dialogue_character_id"] is None
        before = {name: shot[name] for name in ("framing", "camera_movement", "spatial_view", "continuity_notes", "crowd_density")}
        assert before == {"framing": item["framing"], "camera_movement": item["cameraMovement"],
                          "spatial_view": item["spatialView"], "continuity_notes": item["continuityNotes"],
                          "crowd_density": donor["crowd_density"]}
        cast = [row[0] for row in conn.execute("SELECT c.name FROM shot_characters sc JOIN characters c ON c.id=sc.character_id WHERE sc.shot_id=? ORDER BY c.name", (shot_id,))]
        assert cast == item["cast"]
        after = {"framing": None, "camera_movement": None, "spatial_view": None,
                 "continuity_notes": None, "crowd_density": "empty" if not cast else None}
        assert item["proposed"] == {"framing": None, "cameraMovement": None, "spatialView": None,
                                    "continuityNotes": None, "crowdDensity": after["crowd_density"]}
        changes.append({"placement": item["placement"], "shotId": shot_id, "donorShotId": item["donorShotId"],
                        "approvedAction": shot["action"], "verseRef": shot["verse_ref"], "cast": cast,
                        "before": before, "after": after})
    report = {"kind": "isolated_meyah_mark4_added_beat_metadata_correction", "projectId": project,
              "status": "ready_to_apply" if not apply else "applied", "producerDecision": "Dan: Correct the 34 shots and rerun the crew",
              "planHash": plan_hash, "priorCrewRunId": prior_crew,
              "proposalSha256": hashlib.sha256(proposal_bytes).hexdigest(), "changedShots": len(changes),
              "changes": changes, "liveDatabaseOpened": False}
    if not apply:
        print(json.dumps({k: v for k, v in report.items() if k != "changes"}, indent=2))
        raise SystemExit(0)
    if backup_path.exists():
        raise RuntimeError("Pre-correction backup already exists; inspect it before another apply")
    backup = sqlite3.connect(backup_path)
    try:
        conn.backup(backup)
    finally:
        backup.close()
    report["backup"] = str(backup_path.relative_to(root))
    report["backupSha256"] = hashlib.sha256(backup_path.read_bytes()).hexdigest()
    conn.execute("BEGIN IMMEDIATE")
    try:
        for change in changes:
            after = change["after"]
            conn.execute("UPDATE shots SET framing=?,camera_movement=?,spatial_view=?,continuity_notes=?,crowd_density=? WHERE id=?",
                         (after["framing"], after["camera_movement"], after["spatial_view"],
                          after["continuity_notes"], after["crowd_density"], change["shotId"]))
        sequence = conn.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM edit_commands WHERE project_id=?", (project,)).fetchone()[0]
        conn.execute("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,'correct_edition_added_beat_metadata',?,?,?)",
                     (str(uuid.uuid4()), project, sequence, json.dumps(report, ensure_ascii=False), key, int(time.time() * 1000)))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    assert conn.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    for change in changes:
        actual = conn.execute("SELECT framing,camera_movement,spatial_view,continuity_notes,crowd_density FROM shots WHERE id=?", (change["shotId"],)).fetchone()
        assert dict(actual) == change["after"]
    receipt_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(json.dumps({k: v for k, v in report.items() if k != "changes"}, indent=2))
finally:
    conn.close()
