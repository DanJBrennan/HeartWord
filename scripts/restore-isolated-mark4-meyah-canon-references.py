"""Copy missing approved cast references into the worktree; live data is read-only."""
from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
isolated_assets = (root / "assets").resolve()
live_assets = Path(r"C:\Users\danbr\HeartWordData\assets").resolve()
if not root.resolve().is_relative_to(checkout.resolve()) or "heartworddata" in str(root).lower():
    raise SystemExit("The target data root is not inside the isolated worktree")
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
query = """SELECT DISTINCT ca.path,ca.content_hash FROM character_assets ca
JOIN character_versions cv ON cv.id=ca.character_version_id
JOIN shot_characters sc ON sc.character_id=cv.character_id
JOIN shots sh ON sh.id=sc.shot_id JOIN scenes s ON s.id=sh.scene_id
WHERE s.project_id=? AND cv.status='approved' ORDER BY ca.path"""
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    rows = db.execute(query, (project_id,)).fetchall()

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

report = []
for path, expected in rows:
    normalized = path.replace("\\", "/")
    if normalized.startswith("/") or ".." in Path(normalized).parts:
        raise SystemExit("An approved asset path escapes its data root")
    source = (live_assets / normalized).resolve()
    target = (isolated_assets / normalized).resolve()
    if not source.is_relative_to(live_assets) or not target.is_relative_to(isolated_assets):
        raise SystemExit("An approved asset path escapes its data root")
    if not source.is_file():
        raise SystemExit(f"Missing approved reference in live asset folder: {normalized}")
    source_hash = digest(source)
    if expected and source_hash.lower() != expected.lower():
        raise SystemExit(f"Recorded approved reference hash differs from source: {normalized}")
    if target.exists():
        if digest(target) != source_hash:
            raise SystemExit(f"Isolated reference differs from approved source: {normalized}")
        action = "already_present"
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if digest(target) != source_hash:
            raise SystemExit(f"Copied reference failed byte verification: {normalized}")
        action = "copied_to_isolated"
    report.append({"path": normalized, "sha256": source_hash, "recordedHashPresent": expected is not None,
                   "action": action})

receipt = {"kind": "isolated_meyah_mark4_approved_canon_dependency_restore", "projectId": project_id,
           "approvedAssetReferences": len(report), "copied": sum(x["action"] == "copied_to_isolated" for x in report),
           "liveDatabaseOpened": False, "liveAssetWrites": 0, "isolatedDatabaseWrites": 0, "assets": report}
out = root / "review" / "meyah-mark4-approved-canon-reference-restore.json"
out.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
print(json.dumps({"approvedAssetReferences": receipt["approvedAssetReferences"], "copied": receipt["copied"],
                  "receipt": str(out), "liveAssetWrites": 0}, indent=2))
