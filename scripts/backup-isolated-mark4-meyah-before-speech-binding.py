"""Two SQLite-consistent snapshots inside the isolated checkout only."""
from pathlib import Path
import sqlite3
import hashlib

root = Path(__file__).resolve().parents[1] / "output" / "mark4-donor-20261024"
source = root / "db" / "heartword.sqlite"
targets = [root / "review" / "heartword.before-speech-binding.sqlite",
           root / "review" / "heartword.speech-binding-dry-run.sqlite"]
for target in targets:
    if target.exists():
        raise SystemExit(f"Refusing to overwrite retained snapshot: {target}")
with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as live:
    for target in targets:
        with sqlite3.connect(target) as snapshot:
            live.backup(snapshot)
            result = snapshot.execute("PRAGMA quick_check").fetchone()[0]
            if result != "ok":
                raise SystemExit(f"Backup quick_check failed: {result}")
        h = hashlib.sha256(target.read_bytes()).hexdigest()
        print(f"{target} SHA256 {h}")
