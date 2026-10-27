"""Read-only picture contact for one retained isolated Meyah LTX final take."""
from __future__ import annotations

import argparse
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
parser.add_argument("attempt_id")
parser.add_argument("--draft", action="store_true", help="Inspect a held local draft instead of a final take")
parser.add_argument("--full", action="store_true", help="Show the entire retained take instead of only the approved placement")
args = parser.parse_args()
operation = "generate_draft" if args.draft else "generate_final_video"
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    record = db.execute(
        """SELECT ga.shot_id,ga.result_asset_path FROM generation_attempts ga
           JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
           WHERE ga.id=? AND ga.operation=? AND ga.provider='ltx_local'
             AND sc.project_id=?""", (args.attempt_id, operation, project_id)
    ).fetchone()
if not record or not record[1]:
    raise SystemExit("The exact retained local LTX final attempt is unavailable")
worklist = json.loads((assets / "review/meyah-mark4-media-worklist-20261026/worklist.json").read_text(encoding="utf8"))
placement = next((item for item in worklist["items"] if item["targetShotId"] == record[0] and item["treatment"] == "needs_coverage"), None)
if not placement:
    raise SystemExit("The attempt is outside the approved silent coverage map")
source = (assets / record[1]).resolve()
if not source.is_relative_to(assets.resolve()) or not source.is_file():
    raise SystemExit("The retained video is missing or outside isolated assets")
probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(source)], capture_output=True, text=True, check=True)
duration = float(probe.stdout.strip())
window = duration if args.full else min(duration, placement["durationMs"] / 1000)
if window <= 0:
    raise SystemExit("The approved picture window is empty")
out = root / "review" / ("ltx-draft-contacts" if args.draft else "ltx-contacts") / args.attempt_id
if args.draft or args.full:
    out /= "full" if args.full else "placement"
out.mkdir(parents=True, exist_ok=True)
thumbs = []
for index in range(8):
    second = (index + 0.5) * window / 8
    frame = out / f"frame-{index:02}.jpg"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{second:.3f}", "-i", str(source), "-frames:v", "1", "-vf", "scale=480:-1", str(frame)], check=True)
    with Image.open(frame) as image:
        thumbs.append((second, ImageOps.fit(image.convert("RGB"), (480, 270))))
sheet = Image.new("RGB", (1920, 600), "#edf1ee")
draw = ImageDraw.Draw(sheet)
for index, (second, image) in enumerate(thumbs):
    x, y = (index % 4) * 480, (index // 4) * 300
    sheet.paste(image, (x, y))
    draw.text((x + 8, y + 275), f"Placement {placement['placement']}  |  {second:.3f}s", fill="#20343b")
contact = out / "contact.jpg"
sheet.save(contact, quality=90)
print(json.dumps({"attemptId": args.attempt_id, "shotId": record[0], "placement": placement["placement"], "approvedWindowMs": placement["durationMs"], "inspectedWindowSeconds": window, "sourceDurationSeconds": duration, "contact": str(contact.resolve())}, indent=2))
