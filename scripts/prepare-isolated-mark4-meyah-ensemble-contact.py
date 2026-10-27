"""Read-only exact source-window contact for a held ensemble base or face sync."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assets = root / "assets"
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"

parser = argparse.ArgumentParser()
parser.add_argument("shot_id")
parser.add_argument("kind", choices=["base", "sync"])
args = parser.parse_args()
operation = "avatar_base" if args.kind == "base" else "lip_sync"
with sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    record = db.execute(
        """SELECT ga.id,ga.result_asset_path,b.source_end_ms-b.source_start_ms
           FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id
           JOIN scenes sc ON sc.id=sh.scene_id JOIN shot_utterance_bindings b ON b.shot_id=sh.id
           WHERE ga.shot_id=? AND sc.project_id=? AND sh.needs_lip_sync=1
             AND ga.operation=? AND ga.provider IN ('kling','local_timing_repair')
             AND ga.status IN ('hold_for_review','accepted')
           ORDER BY ga.created_at DESC LIMIT 1""",
        (args.shot_id, project_id, operation),
    ).fetchone()
if not record:
    raise SystemExit("The exact held ensemble media attempt is unavailable")
attempt_id, rel_path, window_ms = record
source = (assets / rel_path).resolve()
if not source.is_relative_to(assets.resolve()) or not source.is_file():
    raise SystemExit("The retained video is missing or outside isolated assets")
probe = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(source)],
    capture_output=True, text=True, check=True,
)
duration = float(probe.stdout.strip())
if duration * 1000 + 50 < window_ms:
    raise SystemExit("The returned video is too short for the approved speaking window")
out = root / "review" / "ensemble-contacts" / args.shot_id / args.kind / attempt_id
out.mkdir(parents=True, exist_ok=True)
thumbs = []
for index in range(8):
    second = (index + 0.5) * window_ms / 8000
    frame = out / f"frame-{index:02}.jpg"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", f"{second:.3f}", "-i", str(source),
         "-frames:v", "1", "-vf", "scale=480:-1", str(frame)], check=True,
    )
    with Image.open(frame) as image:
        thumbs.append((second, ImageOps.fit(image.convert("RGB"), (480, 270))))
sheet = Image.new("RGB", (1920, 600), "#edf1ee")
draw = ImageDraw.Draw(sheet)
for index, (second, picture) in enumerate(thumbs):
    x, y = (index % 4) * 480, (index // 4) * 300
    sheet.paste(picture, (x, y))
    draw.text((x + 8, y + 275), f"{args.kind}  |  {second:.3f}s", fill="#20343b")
contact = out / "contact.jpg"
sheet.save(contact, quality=90)
print(json.dumps({
    "shotId": args.shot_id, "kind": args.kind, "attemptId": attempt_id,
    "windowMs": window_ms, "videoDurationSeconds": duration,
    "videoSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "contact": str(contact.resolve()),
}, indent=2))
