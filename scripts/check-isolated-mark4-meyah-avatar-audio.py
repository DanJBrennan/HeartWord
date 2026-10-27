"""Compare a held Avatar soundtrack to its exact submitted cast-audio bytes."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "output" / "mark4-donor-20261024"
PROJECT = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
parser = argparse.ArgumentParser()
parser.add_argument("shot_id")
parser.add_argument("--face", action="store_true", help="Compare a face-targeted result to its approved cast audio")
args = parser.parse_args()

with sqlite3.connect(f"file:{(ROOT / 'db/heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    row = db.execute(
        """SELECT ga.id,ga.result_asset_path FROM generation_attempts ga
           JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
           WHERE ga.shot_id=? AND sc.project_id=? AND ga.operation='lip_sync'
           AND ga.provider='kling' AND ga.status='hold_for_review'
           ORDER BY ga.created_at DESC LIMIT 1""",
        (args.shot_id, PROJECT),
    ).fetchone()
if not row:
    raise SystemExit("Held isolated Kling take not found")
attempt_id, rel_video = row
assets = (ROOT / "assets").resolve()
video = (assets / rel_video).resolve()
if not video.is_relative_to(assets) or not video.is_file():
    raise SystemExit("Retained video missing or outside isolated assets")
sidecar = json.loads(Path(f"{video}.json").read_text(encoding="utf-8"))
audio_info = sidecar["audio"]
submitted = (assets / audio_info["path" if args.face else "submittedPath"]).resolve()
if not submitted.is_relative_to(assets) or not submitted.is_file():
    raise SystemExit("Submitted cast audio missing or outside isolated assets")
sha = hashlib.sha256(submitted.read_bytes()).hexdigest()
if sha != audio_info["sha256" if args.face else "submittedSha256"]:
    raise SystemExit("Submitted cast audio hash changed")


def decoded(path: Path) -> np.ndarray:
    process = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
        capture_output=True,
        check=True,
    )
    return np.frombuffer(process.stdout, dtype="<f4").astype(np.float64)


source = decoded(submitted)
if args.face:
    source = source[audio_info["startMs"] * 16 : audio_info["endMs"] * 16]
returned = decoded(video)
# Positive delay means Kling's decoded audio starts later than the submitted sample.
best = (-1.0, 0)
for delay in range(-800, 1601):
    if delay >= 0:
        a, b = source[: min(len(source), len(returned) - delay)], returned[delay : delay + len(source)]
    else:
        a, b = source[-delay : -delay + len(returned)], returned[: len(source) + delay]
    n = min(len(a), len(b))
    if n < 16000:
        continue
    a, b = a[:n], b[:n]
    a = a - a.mean()
    b = b - b.mean()
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    corr = float(np.dot(a, b) / denom) if denom else 0.0
    if corr > best[0]:
        best = (corr, delay)

print(
    json.dumps(
        {
            "shotId": args.shot_id,
            "attemptId": attempt_id,
            "requestId": sidecar.get("requestId", sidecar.get("reservationId")),
            "submittedAudioSha256": sha,
            "submittedDurationMs": round(len(source) / 16),
            "returnedDurationMs": round(len(returned) / 16),
            "providerAudioDelayMs": best[1] / 16,
            "providerAudioAlignedCorrelation": best[0],
        },
        indent=2,
    )
)
