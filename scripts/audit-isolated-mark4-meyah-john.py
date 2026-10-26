"""Read-only audit of John's planned Meyah Mark 4 picture appearances."""
import json
import sqlite3
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "output" / "mark4-donor-20261024"
db_path = root / "db" / "heartword.sqlite"
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
john_id = "3179d3c7-201d-4365-9a41-0e7ef0c49257"
with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True) as db:
    row = db.execute("""SELECT payload FROM edit_commands WHERE project_id=?
        AND command_type='materialize_edition_shots' AND undone=0
        ORDER BY sequence DESC LIMIT 1""", (project_id,)).fetchone()
    if not row:
        raise SystemExit("No materialized Meyah edition map")
    mapping = json.loads(row[0])["shots"]
    appearances = []
    for placement, item in enumerate(mapping, 1):
        shot_id = item.get("targetShotId")
        if not shot_id:
            continue
        cast = db.execute("SELECT 1 FROM shot_characters WHERE shot_id=? AND character_id=?",
                          (shot_id, john_id)).fetchone()
        if not cast:
            continue
        shot = db.execute("SELECT verse_ref,action,needs_lip_sync,status FROM shots WHERE id=?", (shot_id,)).fetchone()
        appearances.append({"placement": placement, "targetShotId": shot_id,
                            "donorShotId": item.get("donorShotId"),
                            "treatment": item["treatment"], "verseRef": shot[0],
                            "action": shot[1], "needsLipSync": bool(shot[2]), "status": shot[3]})
    versions = [dict(zip(("id", "version", "status", "notes"), row)) for row in
                db.execute("SELECT id,version_label,status,notes FROM character_versions WHERE character_id=? ORDER BY created_at",
                           (john_id,))]
summary = {"kind": "isolated_meyah_mark4_john_visual_continuity_audit",
           "projectId": project_id, "characterId": john_id,
           "appearancesByTreatment": dict(Counter(item["treatment"] for item in appearances)),
           "versions": versions, "appearances": appearances,
           "scope": "metadata only; retained picture still requires frame-level visual verification"}
out = root / "review" / "meyah-mark4-john-visual-continuity-20261026.json"
out.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
print(json.dumps({k: v for k, v in summary.items() if k != "appearances"}, indent=2))
