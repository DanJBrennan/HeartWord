"""Sample retained donor picture where John is tagged in the Meyah shot map."""
import html
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / "output" / "mark4-donor-20261024"
assets = root / "assets"
audit = json.loads((root / "review/meyah-mark4-john-visual-continuity-20261026.json").read_text(encoding="utf8"))
proposal = []
for name in ("meyah-mark4-main-shot-review-20261025/proposal.json",
             "meyah-mark4-storm-shot-review-20261025/assembly-ready-proposal.json"):
    proposal.extend(json.loads((assets / "review" / name).read_text(encoding="utf8"))["rows"])
by_placement = dict(enumerate(proposal, 1))
out = assets / "review/meyah-mark4-john-retained-picture-20261026"
out.mkdir(parents=True, exist_ok=True)
samples = []
for appearance in audit["appearances"]:
    if appearance["treatment"] != "reuse_picture":
        continue
    placement = appearance["placement"]
    row = by_placement[placement]
    picture = row.get("picture", {})
    source = (assets / picture.get("path", "")).resolve()
    if not source.is_relative_to(assets.resolve()) or not source.is_file():
        raise SystemExit(f"Placement {placement} has no retained picture source")
    frames = []
    for label, fraction in (("early", 0.15), ("mid", 0.5), ("late", 0.85)):
        seconds = (picture["sourceStartMs"] + picture["durationMs"] * fraction) / 1000
        filename = f"placement-{placement:03d}-{label}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{seconds:.3f}", "-i", str(source),
                        "-frames:v", "1", "-vf", "scale=640:-2", "-y", str(out / filename)], check=True)
        frames.append({"label": label, "sourceSeconds": seconds, "file": filename})
    samples.append({"placement": placement, "verseRef": appearance["verseRef"],
                    "pictureKind": picture["kind"], "picturePath": picture["path"],
                    "frames": frames, "action": appearance["action"]})
font = ImageFont.load_default()
width, height, columns = 330, 214, 4
rows = (len(samples) + columns - 1) // columns
for phase in ("early", "mid", "late"):
    sheet = Image.new("RGB", (width * columns, height * rows), "#f2f4ef")
    draw = ImageDraw.Draw(sheet)
    for index, sample in enumerate(samples):
        x, y = (index % columns) * width, (index // columns) * height
        frame_info = next(item for item in sample["frames"] if item["label"] == phase)
        frame = Image.open(out / frame_info["file"]).convert("RGB")
        frame.thumbnail((320, 180))
        sheet.paste(frame, (x + 5, y + 5))
        draw.text((x + 6, y + 187), f"#{sample['placement']} {sample['verseRef']} @ {frame_info['sourceSeconds']:.2f}s", fill="#17313a", font=font)
    sheet.save(out / f"contact-sheet-{phase}.jpg", quality=90)
cards = "\n".join(f"<figure><div class='frames'>" + "".join(f"<img src='{frame['file']}' alt='{frame['label']} sample for placement {sample['placement']}'>" for frame in sample["frames"]) + f"</div><figcaption>#{sample['placement']} · {html.escape(sample['verseRef'] or '')} · {html.escape(sample['pictureKind'])}</figcaption><p>{html.escape(sample['action'])}</p></figure>" for sample in samples)
(out / "index.html").write_text("""<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>John retained-picture audit</title><style>body{font:15px/1.45 system-ui;background:#eff2ed;color:#1c343b;margin:0}main{max-width:1500px;margin:auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}figure{background:#fff;border:1px solid #ccd6d2;border-radius:8px;margin:0;padding:10px}.frames{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}img{width:100%;height:auto}figcaption{font-weight:700}p{margin:5px 0}</style><main><h1>John · retained Meyah picture</h1><p>Early, middle, and late frames from each frozen Hatam donor film slice or accepted handle for 24 Meyah placements tagged with John. A cast tag does not prove John is visible; inspect the pictures before deciding which retained clips need new clean-shaven coverage.</p><div class='grid'>""" + cards + "</div></main></html>", encoding="utf8")
(out / "samples.json").write_text(json.dumps(samples, indent=2) + "\n", encoding="utf8")
print(json.dumps({"samples": len(samples), "contactSheets": [str(out / f"contact-sheet-{phase}.jpg") for phase in ("early", "mid", "late")],
                  "url": "http://127.0.0.1:4002/media/review/meyah-mark4-john-retained-picture-20261026/index.html"}, indent=2))
