"""Read-only production evidence for Mark 6 preparation. No model/provider calls.

Run with --data-root C:/Users/danbr/HeartWordData --output <report.json>.
Only the explicit report destination is written; production SQLite uses mode=ro.
"""
import argparse
import hashlib
import json
import shutil
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def inspect(data_root):
    db = data_root / "db/heartword.sqlite"
    with sqlite3.connect(db.as_uri() + "?mode=ro", uri=True) as c:
        c.row_factory = sqlite3.Row
        c.execute("BEGIN")  # one consistent read snapshot, never a copied/live writer
        query = lambda sql, args=(): [dict(r) for r in c.execute(sql, args)]
        mark5 = query("SELECT id FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=5")
        if len(mark5) != 1:
            raise ValueError("Expected exactly one current Hatam Mark 5 project")
        project = mark5[0]["id"]
        calls = query("""SELECT r.phase,e.role,e.round,length(e.prompt) AS promptCharacters,
            e.cost_usd AS recordedCostUsd,e.error,e.model,e.prompt
            FROM production_events e JOIN production_runs r ON r.id=e.run_id
            WHERE r.project_id=? ORDER BY e.created_at,e.rowid""", (project,))
        summary = {}
        for event in calls:
            phase = summary.setdefault(event["phase"], {"events": 0, "promptCharacters": 0,
                "maxPromptCharacters": 0, "reportedCostUsd": 0, "unreportedCostEvents": 0, "errorEvents": 0})
            phase["events"] += 1
            phase["promptCharacters"] += event["promptCharacters"] or 0
            phase["maxPromptCharacters"] = max(phase["maxPromptCharacters"], event["promptCharacters"] or 0)
            phase["errorEvents"] += bool(event["error"])
            if event["recordedCostUsd"] is None:
                phase["unreportedCostEvents"] += 1
            else:
                phase["reportedCostUsd"] += event["recordedCostUsd"]
            event["promptSha256"] = hashlib.sha256((event.pop("prompt") or "").encode()).hexdigest()
        bindings = query("SELECT * FROM project_source_bindings WHERE project_id=?", (project,))
        cast = query("""SELECT c.id,c.name,c.scope_kind,c.scope_book,c.scope_chapter,
            v.id AS approvedVersionId,v.version_label,v.voice_provider,
            CASE WHEN v.voice_id IS NOT NULL THEN 1 ELSE 0 END AS hasVoice
            FROM characters c LEFT JOIN character_versions v ON v.character_id=c.id AND v.status='approved'
            WHERE c.region='Papuan' ORDER BY c.name""")
        report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "readOnly": True,
            "database": str(db), "mark5ProjectId": project,
            "mark6Projects": query("SELECT * FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=6"),
            "mark5Bindings": bindings, "mark5CrewByPhase": summary, "mark5CrewEvents": calls,
            "mark5KnownLedgerUsd": query("SELECT sum(amount_usd) AS value FROM cost_ledger_entries WHERE project_id=?", (project,))[0]["value"],
            "approvedPapuanCanonInventory": cast,
            "limits": ["Character counts are not token measurements.",
                "Saved cost estimates are not invoice reconciliation; unknown charges are not zero.",
                "Canon inventory is not Mark 6 casting or source approval.",
                "No model calls, source alignment, generation or human review were performed."]}
        c.rollback()
    report["sources"] = []
    root = data_root / "assets/source/hatam"
    paths = [root / "text/Mark/Mark 6.docx", *sorted((root / "audio").glob("*/B02___06_*.mp3"))]
    for path in paths:
        evidence = {"path": str(path), "exists": path.is_file()}
        if path.is_file():
            evidence.update(bytes=path.stat().st_size, sha256=digest(path))
            if path.suffix == ".mp3":
                probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "json", str(path)], check=True, capture_output=True, text=True)
                evidence["durationSeconds"] = float(json.loads(probe.stdout)["format"]["duration"])
        report["sources"].append(evidence)
    report["storage"] = {"path": str(data_root), "freeBytes": shutil.disk_usage(data_root).free,
        "chapterMediaCapacityVerified": False}
    return report


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data-root", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    result = inspect(a.data_root.resolve())
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("x", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(json.dumps({"report": str(a.output.resolve()), "crewEvents": len(result["mark5CrewEvents"]),
        "sourceFiles": len(result["sources"]), "freeBytes": result["storage"]["freeBytes"]}))
