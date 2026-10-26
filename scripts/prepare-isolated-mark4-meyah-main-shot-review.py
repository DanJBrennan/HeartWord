"""Build a read-only source-clock paper edit for Meyah Mark 4 scenes 1–6.

The donor placements are all retained once. The proposed editorial order may
change after stage 3 in the Picture Editor; this script does not write the DB.
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
review = assets / "review" / "meyah-mark4-main-shot-review-20261025"
inventory = json.loads((assets / "review" / "meyah-mark4-correspondence-20261025" / "inventory.json").read_text(encoding="utf8"))
source_approval = json.loads((root / "review" / "meyah-mark4-speaker-map-producer-approval.json").read_text(encoding="utf8"))
editorial_approval = json.loads((root / "review" / "meyah-mark4-editorial-direction-title-storm-approval.json").read_text(encoding="utf8"))
if inventory["sourceReviewId"] != source_approval["reviewId"] or inventory["alignmentHash"] != source_approval["alignmentHash"]:
    raise SystemExit("The inventory no longer matches Dan's approved Meyah source map")
if editorial_approval["editorialDirection"]["answer"] != "Approve the editorial direction":
    raise SystemExit("The scene direction has not been approved")
with sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    project = source_approval["projectId"]
    row = db.execute("SELECT source_hash,alignment_hash FROM source_alignment_reviews WHERE id=? AND project_id=?",
                     (source_approval["reviewId"], project)).fetchone()
    if row != (source_approval["sourceHash"], source_approval["alignmentHash"]):
        raise SystemExit("The isolated source review changed")
    count = db.execute("SELECT COUNT(*) FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)", (project,)).fetchone()[0]
    if count:
        raise SystemExit("Target shots now exist; refresh this planning-only proposal")

def shot(number: int, duration: int, kind: str, reason: str = "") -> dict:
    return {"placement": number, "durationMs": duration, "kind": kind, "reason": reason}

def new(duration: int, verse: str, action: str) -> dict:
    return {"placement": None, "durationMs": duration, "kind": "added_silent_coverage",
            "addedVerseRef": verse, "addedAction": action,
            "reason": "New silent picture grounded in the supplied Meyah passage; producer to review its visual treatment."}

# Deliberate editorial ordering, not stage-3 database order. All numbers are
# one-based donor placements within their scene. Added beats follow the prior
# donor anchor when the eventual stage-3 correspondence is sorted donor-first.
plans = [
    [
        shot(1,3500,"final","Preserve Dan's clean lake opening exactly."),
        shot(2,7000,"final","Preserve Dan's empty boat exactly."),
        shot(3,3875,"final","Preserve the first shore/crowd mood interval exactly."),
        shot(4,6125,"final","Preserve the second shore/crowd mood interval exactly."),
        shot(5,7792,"final"), shot(6,10417,"final"), shot(7,9608,"handle"),
        new(4094,"Mark 4:1-3","The gathered shore crowd listens as Jesus begins the recorded sower story; no readable mouth."),
        shot(8,6000,"avatar"), shot(9,8000,"handle"), shot(10,8000,"handle"),
        shot(11,8000,"handle"), shot(12,4500,"avatar"), shot(13,8000,"handle"),
        shot(14,7875,"final"), shot(15,8000,"handle"), shot(16,3125,"handle"),
        shot(17,4500,"avatar"), shot(18,4875,"handle"),
        shot(21,4500,"avatar","Move this 4:3–8 Jesus close-up before the 4:9 narrator lead-in."),
        shot(19,6917,"final","Good-soil picture bridges speech into the 4:9 narrator lead-in."),
        shot(20,8000,"handle","Wheat remains on screen while the 4:9 narrator introduces the closing quote."),
        shot(22,7004,"avatar","Start Jesus' 4:9 mouth exactly with his reviewed quote."),
        shot(23,2687,"avatar","End the visible Jesus mouth with the reviewed 4:9 quote."),
        new(980,"Mark 4:9","The shore crowd remains attentive after Jesus' recorded call; no readable mouth."),
    ],
    [
        shot(1,9000,"final"), shot(2,8000,"final"), shot(3,5042,"handle"),
        new(3250,"Mark 4:10-11","The disciples settle into a private group around Jesus after the crowd departs; no readable mouth."),
        shot(4,5000,"avatar"), shot(5,5000,"avatar"), shot(6,5000,"avatar"),
        new(7100,"Mark 4:11-12","Peter and John listen to Jesus in the small gathering; no readable mouth."),
        shot(7,5042,"handle"), shot(8,2500,"final"),
        new(7100,"Mark 4:12","A different quiet view of the disciples listening in the private group; no readable mouth."),
        shot(9,8000,"final"), shot(10,8000,"handle"),
        new(7050,"Mark 4:12","The private group remains attentive as Jesus finishes the recorded quotation; no readable mouth."),
    ],
    [
        shot(2,4170,"handle","Place the 4:13 narrator lead-in over listening disciples."),
        shot(3,6958,"avatar"), shot(13,4167,"final"), shot(7,4500,"avatar"),
        new(2343,"Mark 4:13","Peter and John listen while Jesus begins explaining the sower story; no readable mouth."),
        shot(4,5500,"handle"), shot(16,2500,"handle"), shot(10,4500,"avatar"),
        new(5419,"Mark 4:14","A sower's hand scatters seed into the same field already shown in the parable; no readable mouth."),
        shot(1,5042,"handle"), shot(11,5042,"handle"), shot(14,4500,"avatar"),
        new(4807,"Mark 4:15","The hard footpath beside the field holds scattered seed; no readable mouth."),
        new(4807,"Mark 4:15","A wider view keeps the footpath and attentive disciples in the same teaching setting; no readable mouth."),
        shot(15,8000,"handle"),
        new(7097,"Mark 4:16","Shallow sprouts rise among the rocky ground already established in the sower story; no readable mouth."),
        shot(5,5042,"handle"),
        new(8411,"Mark 4:17","The shallow sprouts face the heat on the rocky ground; no readable mouth."),
        new(8411,"Mark 4:17","The disciples listen beside the rocky outcrop as Jesus continues; no readable mouth."),
        shot(8,5042,"handle"), shot(12,8833,"final"), shot(18,5458,"avatar"),
        new(6392,"Mark 4:18-19","Thorns crowd the young growth in the established field; no readable mouth."),
        new(6392,"Mark 4:18-19","A second view of the thorn-choked plants shows the consequence Jesus describes; no readable mouth."),
        new(6393,"Mark 4:18-19","The disciples listen while the thorny patch remains visible nearby; no readable mouth."),
        shot(6,5042,"handle"), shot(9,12542,"final"), shot(17,5042,"handle"),
        new(2236,"Mark 4:20","Healthy grain grows in the good soil already shown in the story; no readable mouth."),
    ],
    [
        shot(1,5290,"handle","Keep the 4:21 narrator lead-in on a listening face."),
        shot(2,3708,"avatar"), shot(3,4708,"avatar"), shot(4,8000,"handle"),
        new(5594,"Mark 4:21","A lamp stands where its light can be seen, as the supplied verse describes; no readable mouth."),
        shot(5,7000,"final"), shot(8,7417,"final","Retain the donor's second crowd interval as a separate source slice."),
        shot(7,4458,"avatar"),
        new(3848,"Mark 4:22","A listener considers the teaching while the lamp remains in the setting; no readable mouth."),
        shot(9,4542,"avatar"), shot(12,2833,"final"),
        new(1439,"Mark 4:23","A brief listener reaction carries the end of Jesus' call to hear; no readable mouth."),
        shot(6,5042,"handle"), shot(10,3958,"handle"), shot(11,4500,"avatar"),
        new(5800,"Mark 4:24","Listeners attend closely to Jesus' recorded words; no readable mouth."),
        new(5775,"Mark 4:24","A second view keeps the same group and teaching setting; no readable mouth."),
        shot(13,4042,"handle"),
        new(8190,"Mark 4:25","A close view of attentive disciples accompanies Jesus' continuing recorded teaching; no readable mouth."),
        new(8190,"Mark 4:25","A wider view holds Jesus with the listening group without a readable mouth."),
        new(8181,"Mark 4:25","Listeners remain thoughtful as Jesus finishes the recorded saying; no readable mouth."),
    ],
    [
        shot(1,3630,"handle","Cover the 4:26 narrator lead-in before Jesus' quote."),
        shot(2,5708,"avatar"), shot(3,4370,"handle"),
        new(4916,"Mark 4:26","The farmer continues scattering seed across the established field; no readable mouth."),
        new(4917,"Mark 4:26","Seed settles into the freshly worked soil as the farmer's sowing ends; no readable mouth."),
        shot(4,7000,"handle"), shot(5,1000,"handle"), shot(6,4500,"avatar"),
        new(5060,"Mark 4:27","The field rests at night while the farmer does not tend the hidden growth; no readable mouth."),
        new(5061,"Mark 4:27","Morning light returns to the same field as the seedlings emerge; no readable mouth."),
        shot(7,8000,"handle"),
        new(4771,"Mark 4:28","The crop grows from green stalks toward fuller heads of grain; no readable mouth."),
        new(4772,"Mark 4:28","Full grain develops on the same mature stalks; no readable mouth."),
        shot(8,8000,"handle"), shot(9,4500,"avatar"), shot(10,1387,"handle"), shot(11,5708,"avatar"),
    ],
    [
        shot(1,5940,"handle","Keep the 4:30 narrator introduction on listening disciples."),
        shot(2,3583,"avatar"), shot(3,2060,"handle"), shot(4,3417,"final"),
        shot(5,7625,"final"), shot(6,4500,"avatar"), shot(7,2000,"final"),
        shot(8,4708,"final"), shot(9,3208,"handle"), shot(10,4542,"avatar"),
        shot(11,1064,"handle","End the branch/bird picture with the 4:32 quotation."),
        shot(12,6500,"final"), shot(13,4167,"final"), shot(14,5333,"final"),
        new(7385,"Mark 4:33-34","The disciples gather with Jesus in the quieter grove as narration describes his private explanation; no readable mouth."),
        shot(15,8000,"final"),
    ],
]

boundaries = [
    [(0,"spoken chapter heading"),(4094,"v1 starts"),(36313,"v3 lead-in"),(36603,"v3 Jesus"),
     (133783,"v9 lead-in"),(142703,"v9 Jesus"),(153374,"end")],
    [(153374,"scene"),(178666,"v11 Jesus"),(238458,"end")],
    [(238458,"scene"),(242628,"v13 Jesus"),(260596,"v14"),(278515,"v15"),(302713,"v16"),
     (317810,"v17"),(339674,"v18-19"),(378184,"v20"),(403046,"end")],
    [(403046,"scene"),(408336,"v21 Jesus"),(430346,"v22"),(453069,"v23"),(461883,"v24"),
     (486958,"v25"),(515561,"end")],
    [(515561,"scene"),(519191,"v26 Jesus"),(539102,"v27"),(561723,"v28"),(579266,"v29"),(598861,"end")],
    [(598861,"scene"),(604801,"v30 Jesus"),(641508,"v33 narrator"),(672893,"end")],
]
handle_starts = {(1,16):0,(1,18):3125,(3,4):0,(3,16):5500,
                 (4,10):0,(4,13):3958,(5,1):0,(5,3):3630,(5,4):0,(5,5):7000,
                 (6,1):0,(6,3):5940,(6,9):0,(6,11):3208}
asset_cache: dict[str,tuple[int,str]] = {}

def checked_asset(path: str) -> tuple[int,str]:
    if path not in asset_cache:
        file = assets / path
        if not file.is_file(): raise SystemExit(f"Missing isolated picture handle: {path}")
        ms = round(float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(file)]).decode().strip())*1000)
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        asset_cache[path] = (ms,digest)
    return asset_cache[path]

rows = []
for scene_index,(scene,entries,edges) in enumerate(zip(inventory["scenes"][:6],plans,boundaries),1):
    expected_start = 0 if scene_index == 1 else scene["targetStartMs"]
    if scene["sequence"] != scene_index or expected_start != edges[0][0] or scene["targetEndMs"] != edges[-1][0]:
        raise SystemExit(f"Scene {scene_index} changed")
    inherited = [item["placement"] for item in entries if item["placement"] is not None]
    if sorted(inherited) != list(range(1,len(scene["shots"])+1)):
        raise SystemExit(f"Scene {scene_index} does not cover every donor placement exactly once")
    clock = expected_start
    scene_rows = []
    anchor = None
    for entry in entries:
        number = entry["placement"]
        duration = entry["durationMs"]
        item = {**entry,"scene":scene_index,"targetStartMs":clock,"targetEndMs":clock+duration}
        if number is not None:
            donor = scene["shots"][number-1]
            anchor = donor["shotId"]
            item.update({"donorShotId":anchor,"donorStartFrame":donor["startFrame"],
                         "donorEndFrame":donor["endFrame"],"verseRef":donor["verse_ref"],
                         "action":donor["action"],"keyframe":donor["keyframe"]})
            if entry["kind"] == "avatar":
                if not donor["needs_lip_sync"]: raise SystemExit(f"Scene {scene_index} placement {number} has no donor mouth")
                hits = [turn for turn in inventory["turns"] if turn["speaker"] == "Jesus" and
                        min(clock+duration,turn["endMs"]) > max(clock,turn["startMs"])]
                if len(hits) != 1: raise SystemExit(f"Scene {scene_index} placement {number} crosses a speaker edge")
                turn = hits[0]
                item["targetSpeech"] = {"speaker":"Jesus","turnId":turn["id"],
                                        "startMs":max(clock,turn["startMs"]),
                                        "endMs":min(clock+duration,turn["endMs"])}
                if item["targetSpeech"]["endMs"]-item["targetSpeech"]["startMs"] != duration:
                    raise SystemExit(f"Scene {scene_index} placement {number} extends an Avatar mouth beyond reviewed speech")
                item["picture"] = {"kind":"donor_reference","path":inventory["donorVideo"],
                                   "sourceStartMs":round(donor["startFrame"]/24*1000),
                                   "durationMs":donor["durationMs"]}
                item["pipelineTreatment"] = "replace_avatar"
            elif entry["kind"] == "handle":
                if donor["needs_lip_sync"]: raise SystemExit(f"Scene {scene_index} placement {number} cannot reuse a mouth")
                candidates = donor["acceptedHandleCandidates"]
                candidate = next((c for c in candidates if checked_asset(c["path"])[0] >= duration+handle_starts.get((scene_index,number),0)-20),None)
                if not candidate: raise SystemExit(f"Scene {scene_index} placement {number} lacks a long enough accepted handle")
                length,digest = checked_asset(candidate["path"])
                if digest != candidate["sha256"]: raise SystemExit(f"Changed picture handle: {candidate['path']}")
                offset = handle_starts.get((scene_index,number),0)
                if offset+duration > length+20: raise SystemExit("Handle trim exceeds retained take")
                item["picture"] = {"kind":"accepted_handle","attemptId":candidate["attemptId"],
                                   "path":candidate["path"],"sha256":digest,
                                   "sourceStartMs":offset,"durationMs":duration}
                item["pipelineTreatment"] = "reuse_picture"
            elif entry["kind"] == "final":
                if donor["needs_lip_sync"] or duration > donor["durationMs"]:
                    raise SystemExit(f"Scene {scene_index} placement {number} exceeds silent donor slice")
                item["picture"] = {"kind":"donor_final_slice","path":inventory["donorVideo"],
                                   "sourceStartMs":round(donor["startFrame"]/24*1000),"durationMs":duration}
                item["pipelineTreatment"] = "reuse_picture"
            else: raise SystemExit("Unknown inherited treatment")
        else:
            if anchor is None: raise SystemExit("New coverage must follow a donor anchor")
            item.update({"donorShotId":anchor,"verseRef":entry["addedVerseRef"],
                         "action":entry["addedAction"],"addedForEdition":True,
                         "pipelineTreatment":"needs_coverage"})
        scene_rows.append(item)
        clock += duration
    if clock != scene["targetEndMs"]:
        raise SystemExit(f"Scene {scene_index} has source-clock drift: {clock}")
    for edge,label in edges[1:-1]:
        if not any(item["targetStartMs"] == edge or item["targetEndMs"] == edge for item in scene_rows):
            # Scene 1 v3 opening and v9 lead-in intentionally cross illustrative picture.
            if scene_index != 1 or edge not in (4094,36313,36603,133783):
                raise SystemExit(f"Scene {scene_index} misses reviewed boundary {label}: {edge}")
    if scene_index == 1:
        by_number = {item["placement"]:item for item in scene_rows if item["placement"]}
        if by_number[1]["targetStartMs"] != 0 or by_number[2]["targetStartMs"] != 3500 or by_number[21]["targetEndMs"] > 133783 or by_number[22]["targetStartMs"] != 142703:
            raise SystemExit("The 4:9 narrator lead-in must have no readable Jesus mouth")
    rows.extend(scene_rows)

storm = json.loads((assets / "review" / "meyah-mark4-storm-shot-review-20261025" / "proposal.json").read_text(encoding="utf8"))
if storm["sourceReviewId"] != source_approval["reviewId"] or storm["sceneStartMs"] != 672893 or storm["sceneEndMs"] != 805685:
    raise SystemExit("Approved storm plan changed")
if rows[-1]["targetEndMs"] != storm["sceneStartMs"]:
    raise SystemExit("Main map does not join approved storm")

review.mkdir(parents=True,exist_ok=True)
proposal = {"kind":"read_only_main_shot_proposal","status":"proposal_not_saved_to_database",
            "sourceReviewId":source_approval["reviewId"],"alignmentHash":source_approval["alignmentHash"],
            "targetProjectId":project,"donorRenderId":inventory["donorRenderId"],
            "targetAudio":inventory["targetAudio"],"donorVideo":inventory["donorVideo"],
            "sceneStartMs":0,"sceneEndMs":672893,"rows":rows,
            "notes":["All original Meyah samples remain at source speed and order.",
                     "This is a producer review proposal, not target-shot correspondence in the database.",
                     "Stage 3 requires inherited donor order; Picture Editor will apply the reviewed editorial order after materialization.",
                     "The approved four-second title is pre-source; the source's 4.094-second spoken chapter heading is covered by the clean lake and first 594 ms of the exact empty-boat interval."]}
(review / "proposal.json").write_text(json.dumps(proposal,indent=2,ensure_ascii=False)+"\n",encoding="utf8")

def tc(ms: int) -> str:
    m,s = divmod(ms/1000,60)
    return f"{int(m):02}:{s:06.3f}"

def media(path: str) -> str:
    if not (assets/path).is_file(): raise SystemExit(f"Missing review asset {path}")
    return "/media/"+path.replace("\\","/")

sections = []
for scene in inventory["scenes"][:6]:
    scene_rows = [item for item in rows if item["scene"] == scene["sequence"]]
    cells = []
    for item in scene_rows:
        picture = item.get("picture")
        picture_button = "" if not picture else (f'<button class="picture" data-path="{html.escape(media(picture["path"]),quote=True)}" '
            f'data-start="{picture["sourceStartMs"]}" data-end="{picture["sourceStartMs"]+picture["durationMs"]}">Play picture</button>')
        image = f'<img src="{html.escape(media(item["keyframe"]),quote=True)}" alt="Donor keyframe">' if item.get("keyframe") else "<span class=\"new\">New silent beat</span>"
        speech = item.get("targetSpeech")
        speech_label = "" if not speech else f'<br><b>Jesus</b> {tc(speech["startMs"])}–{tc(speech["endMs"])}'
        label = f'Donor {item["placement"]}' if item["placement"] is not None else 'Added'
        cells.append(f'<tr id="s{item["scene"]}-p{item["placement"] if item["placement"] is not None else item["targetStartMs"]}">'
            f'<td><b>{html.escape(label)}</b><br>{image}</td>'
            f'<td>{tc(item["targetStartMs"])}–{tc(item["targetEndMs"])}<br>{item["durationMs"]/1000:.3f}s'
            f'<br>{html.escape(item["kind"])}{speech_label}</td>'
            f'<td><b>{html.escape(item["verseRef"])}</b><br>{html.escape(item["action"])}'
            f'<br><small>{html.escape(item["reason"] or "Keep the donor story action in this Meyah source interval.")}</small></td>'
            f'<td><button class="listen" data-start="{item["targetStartMs"]}" data-end="{item["targetEndMs"]}">Hear Meyah</button>{picture_button}</td></tr>')
    displayed_start = 0 if scene["sequence"] == 1 else scene["targetStartMs"]
    sections.append(f'<section id="scene-{scene["sequence"]}"><h2>Scene {scene["sequence"]}: {html.escape(scene["verse_start"])}–{html.escape(scene["verse_end"])}'
                    f' · {tc(displayed_start)}–{tc(scene["targetEndMs"])}</h2>'
                    f'<p>{len(scene_rows)} proposed target picture intervals. Donor picture {scene["donorDurationMs"]/1000:.3f}s; '
                    f'Meyah {(scene["targetEndMs"]-displayed_start)/1000:.3f}s including spoken heading when present; new silent coverage '
                    f'{sum(x["durationMs"] for x in scene_rows if x["kind"]=="added_silent_coverage")/1000:.3f}s.</p>'
                    f'<table><thead><tr><th>Picture</th><th>Meyah clock</th><th>Story and reason</th><th>Inspect</th></tr></thead><tbody>{"".join(cells)}</tbody></table></section>')

page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meyah Mark 4 scenes 1–6 shot map</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#e9e8e2;color:#1b3037;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1280px;margin:auto;padding:1.3rem}}h1{{margin:.3rem 0}}p{{max-width:90ch}}a{{color:#075d7b}}.note{{background:#fff2cf;border-left:5px solid #a97419;padding:.8rem 1rem}}.player{{position:sticky;top:0;background:#173a43;color:#fff;z-index:2;display:flex;gap:1rem;align-items:center;padding:.6rem 1rem}}.player video{{width:260px;max-height:150px}}.player audio{{width:320px}}table{{border-collapse:collapse;background:#fff;width:100%}}th,td{{text-align:left;vertical-align:top;border-bottom:1px solid #ccd4d4;padding:.65rem}}th{{background:#d8e7e6}}td:first-child{{width:170px}}td img{{width:155px;max-height:100px;object-fit:contain;background:#10232b}}td:nth-child(2){{min-width:240px}}button{{background:#0c6882;color:white;border:0;border-radius:4px;padding:.35rem .6rem;margin:.2rem;cursor:pointer}}small{{color:#405660}}.new{{display:block;background:#d8b5a3;padding:.3rem}}section{{margin:2rem 0}}nav a{{margin-right:1rem}}@media(max-width:850px){{.player{{position:static;display:block}}.player video,.player audio{{width:100%}}table{{font-size:.82rem}}td img{{width:90px}}}}
</style><div class="player"><video id="picture" controls muted playsinline preload="metadata"></video><audio id="meyah" controls preload="metadata" src="{html.escape(media(inventory["targetAudio"]),quote=True)}"></audio><span>Picture preview is muted. Meyah source plays separately.</span></div>
<main><h1>Markus 4 · Meyah scenes 1–6 paper edit</h1><p class="note"><b>For detailed producer review.</b> The source-clock rows below are a proposal. No target shots, new keyframes, Avatar takes or media are saved. Dan has approved the overall editorial direction, four-second title visual, and separate storm ending plan. This page asks for the detailed picture and timing choices before target correspondence.</p>
<p>Every one of the 90 inherited donor placements in scenes 1–6 appears once. The approved four-second title plays before the complete Meyah source. Its 4.094-second spoken heading is covered by the exact clean lake and beginning of the exact empty boat; verse 1 starts during that empty-boat view. Reordered rows are explicitly shown in playback order; the pipeline will first materialize them in donor order, then the Picture Editor will arrange the approved cut. New beats show their verse and visual action. The original Meyah recording remains unchanged.</p>
<nav>{''.join(f'<a href="#scene-{i}">Scene {i}</a>' for i in range(1,7))}<a href="/media/review/meyah-mark4-storm-shot-review-20261025/index.html">Approved storm plan</a><a href="proposal.json">JSON</a></nav>
{''.join(sections)}<p>Accepted handle hashes and source durations, source-review identity, every donor placement, scene clocks, and speech/picture boundaries were checked while rendering this page. A producer review of the new-beat actions, selected motion and trims is still needed before a named target correspondence revision.</p></main>
<script>const video=document.getElementById('picture'),audio=document.getElementById('meyah');let timer;function stop(){{video.pause();audio.pause();if(timer)clearInterval(timer)}}function play(el,start,end,path){{stop();if(path&&el.src!==new URL(path,location.href).href)el.src=path;el.currentTime=start/1000;el.play();timer=setInterval(()=>{{if(el.currentTime>=end/1000){{el.pause();clearInterval(timer);timer=null}}}},20)}}document.querySelectorAll('button.listen').forEach(b=>b.onclick=()=>play(audio,+b.dataset.start,+b.dataset.end));document.querySelectorAll('button.picture').forEach(b=>b.onclick=()=>play(video,+b.dataset.start,+b.dataset.end,b.dataset.path));</script></html>'''
(review / "index.html").write_text(page,encoding="utf8")
print(json.dumps({"url":"http://127.0.0.1:4002/media/review/meyah-mark4-main-shot-review-20261025/index.html",
                  "rows":len(rows),"donorPlacements":sum(len(s["shots"]) for s in inventory["scenes"][:6]),
                  "addedSilentPictureMs":sum(x["durationMs"] for x in rows if x["kind"]=="added_silent_coverage"),
                  "targetShots":0},indent=2))
