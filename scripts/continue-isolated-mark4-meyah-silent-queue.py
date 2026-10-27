"""Wait for the in-flight local take, then queue remaining isolated silent takes.

Every returned take remains held for separate picture and ambience review.
An uncertain or failed current job stops the queue without another POST.
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

CHECKOUT = Path(__file__).resolve().parents[1]
ROOT = CHECKOUT / "output" / "mark4-donor-20261024"
PROJECT = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
CURRENT = "82d99b32-56cc-46eb-af8b-a447435433eb"
REVIEW = ROOT / "review"
STATE = REVIEW / "meyah-mark4-silent-queue-state-20261027.json"
LOG = REVIEW / "meyah-mark4-silent-queue-process-20261027.log"


def record(status: str, **detail: object) -> None:
    STATE.write_text(
        json.dumps({"at": datetime.now(timezone.utc).isoformat(), "status": status, **detail}, indent=2) + "\n",
        encoding="utf-8",
    )


record("waiting_for_current_ltx", shotId=CURRENT)
for _ in range(360):
    with sqlite3.connect(f"file:{(ROOT / 'db/heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
        job = db.execute(
            "SELECT status FROM video_generation_jobs WHERE project_id=? AND shot_id=? ORDER BY updated_at DESC LIMIT 1",
            (PROJECT, CURRENT),
        ).fetchone()
        attempt = db.execute(
            """SELECT status FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video'
               ORDER BY created_at DESC LIMIT 1""",
            (CURRENT,),
        ).fetchone()
        active = db.execute(
            "SELECT COUNT(*) FROM video_generation_jobs WHERE project_id=? AND backend='ltx' AND status='active'",
            (PROJECT,),
        ).fetchone()[0]
    if job and job[0] in {"error", "held"}:
        record("stopped_current_ltx_needs_reconciliation", jobStatus=job[0])
        raise SystemExit(2)
    if job and job[0] == "completed" and attempt and attempt[0] == "hold_for_review" and active == 0:
        break
    time.sleep(15)
else:
    record("stopped_wait_timeout", shotId=CURRENT)
    raise SystemExit(3)

record("running_remaining_local_queue", startPlacement=58)
command = ["pwsh", "-NoProfile", "-File", str(CHECKOUT / "scripts/run-isolated-mark4-meyah-silent-coverage-batch.ps1"),
           "-Take", "21", "-StartPlacement", "58"]
with LOG.open("w", encoding="utf-8") as output:
    result = subprocess.run(command, cwd=CHECKOUT, stdout=output, stderr=subprocess.STDOUT, check=False)
record("queue_finished" if result.returncode == 0 else "queue_stopped_for_review",
       returnCode=result.returncode, log=str(LOG.relative_to(ROOT)).replace("\\", "/"))
raise SystemExit(result.returncode)
