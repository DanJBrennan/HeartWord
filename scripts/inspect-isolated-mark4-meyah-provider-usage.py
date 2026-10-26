"""Audit metered voice headers and the target film budget before further spend."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    paths = [row[0] for row in db.execute("""SELECT DISTINCT a.source_path FROM audio_segments a
        JOIN composite_audio_source_map m ON m.composite_segment_id=a.id
        WHERE a.project_id=? AND a.layer='composite_cast_master' AND a.speaker_character_id IS NOT NULL""", (project_id,))]
    ledger = db.execute("SELECT COALESCE(SUM(amount_usd),0) FROM cost_ledger_entries WHERE project_id=?", (project_id,)).fetchone()[0]
    reconciliation = db.execute("SELECT COUNT(*) FROM edit_commands WHERE project_id=? AND command_type='reconcile_avatar_budget' AND undone=0", (project_id,)).fetchone()[0]
    pending = db.execute("SELECT COUNT(*) FROM edit_commands WHERE project_id=? AND command_type IN ('reserve_crew_spend','reserve_avatar_spend') AND undone=0", (project_id,)).fetchone()[0]
if len(paths) != 10:
    raise SystemExit("Expected ten unique reviewed character cast masters")
masters = []
for path in sorted(paths):
    sidecar = json.loads((root / "assets" / (path + ".json")).read_text(encoding="utf8"))
    usage = sidecar.get("providerUsage") or {}
    if sidecar.get("provider") != "elevenlabs" or not usage.get("characterCost"):
        raise SystemExit(f"Missing ElevenLabs usage header for {path}")
    masters.append({"path": path.replace("\\", "/"), "headerCharacterCost": int(usage["characterCost"]),
                    "requestIdRecorded": bool(usage.get("requestId")), "historyItemIdRecorded": bool(usage.get("historyItemId")),
                    "directUsd": None})
report = {"kind": "read_only_isolated_meyah_mark4_provider_usage", "projectId": project_id,
          "elevenLabsSpeechToSpeechRequests": 10, "reportedCharacterCostUnits": sum(m["headerCharacterCost"] for m in masters),
          "directVoiceUsd": None, "recordedFilmLedgerUsd": ledger, "budgetReconciliationCount": reconciliation,
          "spendReservationsRecorded": pending,
          "nextPaidGate": "Reconcile the cumulative per-film $200 budget, including conservative unreported voice liability, before Gemini crew or Kling Avatar requests.",
          "liveDatabaseOpened": False, "masters": masters}
out = root / "review" / "meyah-mark4-provider-usage-preflight.json"
out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
print(json.dumps({key:value for key,value in report.items() if key != "masters"} | {"receipt":str(out)}, indent=2))
