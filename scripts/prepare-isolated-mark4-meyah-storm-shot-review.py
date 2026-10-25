"""Render a read-only source-clock paper edit for the isolated Mark 4 storm.

The proposed trims are editorial evidence, not a saved correspondence revision.
This script reads the isolated database in SQLite read-only mode plus pinned
inventory and copied donor media. It writes review HTML/JSON under the isolated
worktree asset root and never changes the database.
"""
from __future__ import annotations

import hashlib
import html
import json
import sqlite3
import subprocess
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assets = root / "assets"
review = assets / "review" / "meyah-mark4-storm-shot-review-20261025"
inventory = json.loads((assets / "review" / "meyah-mark4-correspondence-20261025" / "inventory.json").read_text(encoding="utf8"))
approval = json.loads((root / "review" / "meyah-mark4-speaker-map-producer-approval.json").read_text(encoding="utf8"))
if inventory["sourceReviewId"] != approval["reviewId"] or inventory["alignmentHash"] != approval["alignmentHash"]:
    raise SystemExit("The storm review no longer matches Dan's approved source map")
scene = inventory["scenes"][6]
if scene["sequence"] != 7 or len(scene["shots"]) != 23 or scene["targetStartMs"] != 672893 or scene["targetEndMs"] != 805685:
    raise SystemExit("The isolated storm source or donor picture changed")
with sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    current_review = db.execute("SELECT source_hash,alignment_hash FROM source_alignment_reviews WHERE id=? AND project_id=?",
                                (approval["reviewId"], approval["projectId"])).fetchone()
    if current_review != (approval["sourceHash"], approval["alignmentHash"]):
        raise SystemExit("The named isolated source review changed")
    segments = {tuple(row[:2]): row[2] for row in db.execute(
        "SELECT start_ms,end_ms,id FROM audio_segments WHERE project_id=? AND layer='original_reading'",
        (approval["projectId"],))}
    if len(segments) != 54:
        raise SystemExit("The current isolated speaker map changed")
    peter_segment = segments[(746695, 754976)]
    jesus_segment = segments[(780426, 788136)]

# Source-clock durations. Every inherited donor placement is represented once;
# two reviewed omissions remain at zero duration. New silent beats are explicit.
durations = {
    1: 5000, 2: 5000, 3: 8000, 4: 8000, 5: 7500, 6: 2250,
    7: 5950, 8: 4708, 9: 958, 10: 8000, 11: 8000, 12: 2050,
    13: 8281, 14: 8000, 15: 2950, 16: 8000, 17: 6500,
    18: 3700, 19: 4310, 20: 1249, 21: 0, 22: 0, 23: 16000,
}
handle_starts = {3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 2250,
                 9: 6958, 10: 0, 11: 0, 12: 5950, 17: 0}
inserts = {
    2: (3517, "Mark 4:35-36", "At dusk, Jesus and the disciples prepare to cross the lake; no readable mouth."),
    12: (4869, "Mark 4:38", "The disciples turn toward the stern where Jesus sleeps outside this frame; no readable mouth or new dialogue."),
}
omission_reasons = {
    21: "The 4:41 question remains in the original Meyah group performance over the exact final sea; the whisper reaction no longer fits its clock.",
    22: "A late repeat of the first 4:40 Jesus close-up would interrupt the 4:41 group question after the reaction.",
}
if sorted(durations) != list(range(1, 24)) or sorted(omission_reasons) != [21, 22]:
    raise SystemExit("Storm proposal is incomplete")

def media(path: str) -> str:
    if not path or not (assets / path).is_file():
        raise ValueError(f"Missing isolated review media: {path}")
    return "/media/" + path.replace("\\", "/")

def probe_ms(path: Path) -> int:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                             "-of", "csv=p=0", str(path)], check=True, capture_output=True, text=True)
    return round(float(result.stdout.strip()) * 1000)

rows: list[dict] = []
clock = scene["targetStartMs"]
for number, donor in enumerate(scene["shots"], 1):
    duration = durations[number]
    if number in omission_reasons:
        treatment = "omit_picture"
    elif number == 15:
        treatment = "narrator_only_silent_coverage"
    elif donor["needs_lip_sync"]:
        treatment = "replace_avatar"
    elif number in handle_starts:
        treatment = "reuse_accepted_handle"
    else:
        treatment = "reuse_final_picture"
    item = {
        "placement": number, "donorShotId": donor["shotId"],
        "donorStartFrame": donor["startFrame"], "donorEndFrame": donor["endFrame"],
        "verseRef": donor["verse_ref"], "action": donor["action"],
        "treatment": treatment, "targetStartMs": clock, "targetEndMs": clock + duration,
        "durationMs": duration, "reason": omission_reasons.get(number, "Proposed source-clock treatment; review picture and narration together."),
        "keyframe": donor["keyframe"],
        "pipelineTreatment": ("omit_picture" if treatment == "omit_picture" else
                              "needs_coverage" if treatment in ("narrator_only_silent_coverage", "added_silent_coverage") else
                              "replace_avatar" if treatment == "replace_avatar" else "reuse_picture"),
    }
    if treatment == "reuse_accepted_handle":
        candidates = donor["acceptedHandleCandidates"]
        if len(candidates) != 1:
            raise SystemExit(f"Storm placement {number} needs one exact retained take")
        candidate = candidates[0]
        path = assets / candidate["path"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != candidate["sha256"]:
            raise SystemExit(f"Retained take changed for placement {number}")
        start = handle_starts[number]
        if start + duration > probe_ms(path) + 20:
            raise SystemExit(f"Retained take is too short for placement {number}")
        item["picture"] = {"kind": "accepted_handle", "attemptId": candidate["attemptId"],
                           "path": candidate["path"], "sha256": candidate["sha256"],
                           "sourceStartMs": start, "durationMs": duration}
    elif treatment in ("reuse_final_picture", "replace_avatar", "omit_picture"):
        item["picture"] = {"kind": "donor_reference", "path": inventory["donorVideo"],
                           "sourceStartMs": round(donor["startFrame"] / 24 * 1000),
                           "durationMs": donor["durationMs"]}
    if number == 13:
        item["targetSpeech"] = {"speaker": "Peter", "startMs": 746695, "endMs": 754976,
                                "targetSegmentId": peter_segment, "review": "speech-disciples-v38"}
        item["keyframe"] = "generated/keyframes/codex/meyah-mark4-peter-v38/peter-facing-sleeping-jesus-candidate-v3.png"
    elif number == 18:
        item["targetSpeech"] = {"speaker": "Jesus", "startMs": 780426, "endMs": 784126,
                                "targetSegmentId": jesus_segment, "review": "speech-jesus-v40"}
    elif number == 19:
        item["targetSpeech"] = {"speaker": "Jesus", "startMs": 784126, "endMs": 788136,
                                "targetSegmentId": jesus_segment, "review": "speech-jesus-v40", "pictureTailMs": 300}
    if number == 15:
        item["reason"] = "Meyah 4:39 narrates Jesus' action without quoting his words; replace the old readable mouth insert with silent Jesus/sea action."
        item["narratorOnlyAction"] = "Jesus stands in the boat as the wind and sea become still; his mouth is not visibly speaking."
    if number == 20:
        item["reason"] = "Use 1.249 seconds of the retained group reaction, then enter the exact sixteen-second final sea."
    if number == 23:
        item["reason"] = "Preserve the approved final night-sea pullout exactly; original Meyah 4:41 group speech plays over it."
    rows.append(item)
    clock += duration
    if number in inserts:
        extra_ms, verse, action = inserts[number]
        rows.append({"placement": f"after-{number}", "donorShotId": donor["shotId"],
                     "verseRef": verse, "action": action, "treatment": "added_silent_coverage",
                     "pipelineTreatment": "needs_coverage", "addedAction": action, "addedVerseRef": verse,
                     "targetStartMs": clock, "targetEndMs": clock + extra_ms, "durationMs": extra_ms,
                     "reason": "Source-grounded coverage needed after inspecting retained accepted take lengths.",
                     "addedForEdition": True})
        clock += extra_ms

if clock != 805685 or sum(row["durationMs"] for row in rows) != 132792:
    raise SystemExit(f"Storm source-clock proposal drifts: {clock}")
by_number = {row["placement"]: row for row in rows}
anchors = {3: 686410, 5: 702410, 10: 723776, 13: 746695, 14: 754976,
           18: 780426, 20: 788436, 23: 789685}
if any(by_number[number]["targetStartMs"] != time for number, time in anchors.items()):
    raise SystemExit("A verified verse or speech anchor moved")
if by_number[23]["durationMs"] != 16000 or by_number[21]["durationMs"] or by_number[22]["durationMs"]:
    raise SystemExit("Approved ending picture preservation changed")

review.mkdir(parents=True, exist_ok=True)
proposal = {"kind": "read_only_storm_shot_proposal", "sourceReviewId": approval["reviewId"],
            "alignmentHash": approval["alignmentHash"], "donorRenderId": inventory["donorRenderId"],
            "targetProjectId": approval["projectId"], "sceneStartMs": 672893, "sceneEndMs": 805685,
            "status": "proposal_not_saved_to_database", "targetAudio": inventory["targetAudio"],
            "donorVideo": inventory["donorVideo"], "rows": rows,
            "notes": ["All original Meyah recording samples remain at original speed and order.",
                      "New silent beats and Avatar picture need separate keyframe, motion and provider reviews.",
                      "Accepted handle trims are verified against retained files but still need producer visual review."]}
(review / "proposal.json").write_text(json.dumps(proposal, indent=2, ensure_ascii=False) + "\n", encoding="utf8")

def timecode(ms: int) -> str:
    minute, second = divmod(ms / 1000, 60)
    return f"{int(minute):02}:{second:06.3f}"

table_rows = []
for row in rows:
    label = str(row["placement"])
    start, end = row["targetStartMs"], row["targetEndMs"]
    picture = row.get("picture")
    picture_button = ""
    if picture:
        picture_button = (f'<button class="picture" data-path="{html.escape(media(picture["path"]), quote=True)}" '
                          f'data-start="{picture["sourceStartMs"]}" data-end="{picture["sourceStartMs"]+min(picture["durationMs"],row["durationMs"] or picture["durationMs"])}">'
                          f'Play {"handle" if picture["kind"] == "accepted_handle" else "donor reference"}</button>')
    speech = row.get("targetSpeech")
    speech_text = "" if not speech else f'<br><b>{speech["speaker"]}</b> {timecode(speech["startMs"])}–{timecode(speech["endMs"])}'
    image = f'<img src="{html.escape(media(row["keyframe"]), quote=True)}" alt="Donor scene keyframe">' if row.get("keyframe") else ""
    table_rows.append(f'<tr id="p-{label}"><td><b>{html.escape(label)}</b><br>{image}</td>'
                      f'<td>{timecode(start)}–{timecode(end)}<br>{row["durationMs"]/1000:.3f}s<br>'
                      f'{html.escape(row["treatment"])}{speech_text}</td>'
                      f'<td>{html.escape(row["verseRef"])}<br>{html.escape(row["action"])}<br><small>{html.escape(row["reason"])}</small></td>'
                      f'<td><button class="listen" data-start="{start}" data-end="{end}">Hear Meyah</button> {picture_button}</td></tr>')

page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mark 4 Meyah storm shot map proposal</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#e9e8e2;color:#1b3037;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1280px;margin:auto;padding:1.3rem}}h1{{margin:.3rem 0}}p{{max-width:85ch}}a{{color:#075d7b}}.note{{background:#fff2cf;border-left:5px solid #a97419;padding:.8rem 1rem}}.player{{position:sticky;top:0;background:#173a43;color:#fff;z-index:2;display:flex;gap:1rem;align-items:center;padding:.6rem 1rem}}.player video{{width:260px;max-height:150px}}.player audio{{width:320px}}table{{border-collapse:collapse;background:#fff;width:100%}}th,td{{text-align:left;vertical-align:top;border-bottom:1px solid #ccd4d4;padding:.65rem}}th{{background:#d8e7e6}}td:first-child{{width:170px}}td img{{width:155px;max-height:100px;object-fit:contain;background:#10232b}}td:nth-child(2){{min-width:240px}}button{{background:#0c6882;color:white;border:0;border-radius:4px;padding:.35rem .6rem;margin:.2rem;cursor:pointer}}small{{color:#405660}}.timeline{{display:flex;height:28px;width:100%;margin:1rem 0;background:#fff}}.timeline a{{height:100%;min-width:3px;border-right:1px solid #fff;background:#327e90}}.timeline a.avatar{{background:#d18b3e}}.timeline a.new{{background:#a35b63}}.timeline a.omit{{background:#666}}@media(max-width:850px){{.player{{position:static;display:block}}.player video,.player audio{{width:100%}}table{{font-size:.82rem}}td img{{width:90px}}}}
</style><div class="player"><video id="picture" controls muted playsinline preload="metadata"></video><audio id="meyah" controls preload="metadata" src="{html.escape(media(inventory["targetAudio"]), quote=True)}"></audio><span>Picture preview is muted. Meyah source plays separately.</span></div>
<main><h1>Markus 4 · Meyah storm paper edit</h1><p class="note"><b>Proposal for review.</b> This is not saved in the project database. It maps the approved 4:35–41 source clock to existing donor picture, retained accepted handles, and three proposed silent beats. Peter and Jesus Avatar takes do not exist yet. The final sea stays exactly sixteen seconds; two late donor placements are proposed omissions.</p>
<p><a href="/media/review/meyah-mark4-shot-plan-20261025/index.html">Whole-chapter brief</a> · <a href="/media/review/meyah-mark4-correspondence-20261025/index.html#scene-7">All donor placements</a> · <a href="proposal.json">Machine-readable proposal</a>. Existing 4:35 Jesus speech remains mapped voice-over on wide picture; the 4:41 group question remains original Meyah over the final sea.</p>
<div class="timeline">{''.join(f'<a href="#p-{row["placement"]}" class="{"omit" if row["treatment"]=="omit_picture" else "avatar" if row["treatment"]=="replace_avatar" else "new" if "coverage" in row["treatment"] else ""}" style="width:{max(row["durationMs"]/132792*100,0.4):.3f}%" title="{html.escape(str(row["placement"])+" "+row["treatment"],quote=True)}"></a>' for row in rows)}</div>
<p><b>Timing:</b> 11:12.893–13:25.685, 132.792 seconds. The 4:38 Peter quote occupies 12:26.695–12:34.976. Meyah 4:39 narrates Jesus' action. The 4:40 Jesus quote occupies 13:00.426–13:08.136. A 0.300-second picture tail follows that quote before 4:41 starts.</p>
<table><thead><tr><th>Donor placement</th><th>Proposed Meyah clock</th><th>Passage-grounded picture</th><th>Inspect</th></tr></thead><tbody>{''.join(table_rows)}</tbody></table>
<p>Retained take hashes, lengths, 4:38/4:40 speech edges, source approval, final sea duration and total scene clock were checked while rendering this page. A producer review of selected motion and trims is still required before a named target correspondence revision.</p></main>
<script>const video=document.getElementById('picture'),audio=document.getElementById('meyah');let timer;function stop(){{video.pause();audio.pause();if(timer)clearInterval(timer)}}function play(el,start,end,path){{stop();if(path&&el.src!==new URL(path,location.href).href)el.src=path;el.currentTime=start/1000;el.play();timer=setInterval(()=>{{if(el.currentTime>=end/1000){{el.pause();clearInterval(timer);timer=null}}}},20)}}document.querySelectorAll('button.listen').forEach(b=>b.onclick=()=>play(audio,+b.dataset.start,+b.dataset.end));document.querySelectorAll('button.picture').forEach(b=>b.onclick=()=>play(video,+b.dataset.start,+b.dataset.end,b.dataset.path));</script></html>'''
(review / "index.html").write_text(page, encoding="utf8")
print(json.dumps({"url": "http://127.0.0.1:4002/media/review/meyah-mark4-storm-shot-review-20261025/index.html",
                  "rows": len(rows), "sourceStartMs": scene["targetStartMs"], "sourceEndMs": clock,
                  "proposedOmissions": [21, 22], "newSilentPictureMs": 3517 + 4869 + 2950}, indent=2))
