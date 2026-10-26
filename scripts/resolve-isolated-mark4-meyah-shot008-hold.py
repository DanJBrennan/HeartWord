"""Close the isolated shot-8 transport hold after the completed draft was recovered."""
import hashlib
import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = (checkout / "output/mark4-donor-20261024").resolve()
if not root.is_relative_to(checkout) or "heartworddata" in str(root).lower():
    raise SystemExit("Refusing a non-isolated data root")
project = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
shot = "ae96ed8d-d4e7-457e-b309-3390d2a3b362"
attempt = "9f063998-520d-49c4-b595-94e987632267"
receipt = json.loads((root / "review/meyah-mark4-shot008-ltx-draft-recovery-20261026.json").read_text(encoding="utf8"))
if receipt["attemptId"] != attempt or receipt["outputSha256"] != "ef53d49251aeecd4be46c7600b9ba761273805eb248844b8965ddcf39b90272a":
    raise SystemExit("Recovered draft receipt changed")
with sqlite3.connect(root / "db/heartword.sqlite") as db:
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("BEGIN IMMEDIATE")
    candidate = db.execute("SELECT status,result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_draft'", (attempt, shot)).fetchone()
    if not candidate or candidate[0] != "accepted":
        raise SystemExit("The recovered draft is not selected")
    media = root / "assets" / candidate[1]
    if hashlib.sha256(media.read_bytes()).hexdigest() != receipt["outputSha256"]:
        raise SystemExit("Selected draft media changed")
    hold = db.execute("SELECT id,note FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND resolved=0 AND note LIKE 'Meyah Mark 4 shot 8 local LTX transport hold%'", (project, shot)).fetchone()
    if not hold:
        raise SystemExit("Expected unresolved transport hold not found")
    db.execute("UPDATE review_notes SET resolved=1 WHERE id=? AND resolved=0", (hold[0],))
    db.commit()
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
        raise SystemExit("SQLite quick_check failed")
out = {"kind": "isolated_meyah_mark4_shot008_transport_hold_resolution", "projectId": project,
       "shotId": shot, "selectedDraftAttemptId": attempt, "holdNoteId": hold[0],
       "reason": "Completed local LTX draft recovered, checked and selected; final video remains pending.",
       "liveDatabaseOpened": False}
(root / "review/meyah-mark4-shot008-transport-hold-resolved-20261026.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf8")
print(json.dumps(out, indent=2))
