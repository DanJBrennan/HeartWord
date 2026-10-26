"""Read-only audit of donor shot metadata inherited by approved new picture beats."""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assert root.is_relative_to(checkout) and "heartworddata" not in str(root).lower()
project = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
db = sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True)
db.row_factory = sqlite3.Row
saved = json.loads(db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])["shots"]
revision = json.loads(db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='revise_language_edition' ORDER BY sequence DESC LIMIT 1", (project,)).fetchone()[0])["correspondence"]
assert len(saved) == len(revision) == 147
fields = ("framing", "camera_movement", "crowd_density", "continuity_notes", "spatial_view")
rows = []
for position, (mapped, reviewed) in enumerate(zip(saved, revision), 1):
    if not reviewed.get("addedForEdition"):
        continue
    assert mapped["targetShotId"] and mapped["donorShotId"] == reviewed["donorShotId"]
    target = db.execute("SELECT * FROM shots WHERE id=?", (mapped["targetShotId"],)).fetchone()
    donor = db.execute("SELECT * FROM shots WHERE id=?", (mapped["donorShotId"],)).fetchone()
    copied = [name for name in fields if target[name] == donor[name] and target[name] is not None]
    old_speech_note = bool(re.search(r"speaker coverage|lip.?sync|speaking|mouth|dialogue", (target["continuity_notes"] or "") + " " + (target["spatial_view"] or ""), re.I))
    rows.append({"placement": position, "targetShotId": mapped["targetShotId"], "donorShotId": mapped["donorShotId"],
                 "verseRef": target["verse_ref"], "approvedAction": reviewed["addedAction"], "targetAction": target["action"],
                 "copiedDonorFields": copied, "inheritedSpeechNote": old_speech_note,
                 "framing": target["framing"], "cameraMovement": target["camera_movement"],
                 "spatialView": target["spatial_view"], "continuityNotes": target["continuity_notes"]})
assert len(rows) == 34
report = {"kind": "read_only_added_meyah_beat_inheritance_audit", "projectId": project,
          "newBeats": len(rows), "allHaveCopiedDonorSpecificMetadata": all(bool(row["copiedDonorFields"]) for row in rows),
          "inheritedSpeechNoteCount": sum(row["inheritedSpeechNote"] for row in rows),
          "rows": rows, "databaseWrites": 0, "liveDatabaseOpened": False}
out = root / "review" / "meyah-mark4-added-beat-inheritance-audit.json"
out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
print(json.dumps({key: value for key, value in report.items() if key != "rows"} | {
    "speechNoteExamples": [{key: row[key] for key in ("placement", "verseRef", "approvedAction", "spatialView", "continuityNotes")}
                           for row in rows if row["inheritedSpeechNote"]][:5]}, indent=2, ensure_ascii=False))
