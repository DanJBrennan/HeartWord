"""Render read-only source-versus-cast listening cards for every reviewed run."""
from __future__ import annotations

import hashlib
import html
import json
import sqlite3
import subprocess
import wave
from array import array
from pathlib import Path

checkout = Path(__file__).resolve().parents[1]
root = checkout / "output" / "mark4-donor-20261024"
assets = root / "assets"
out = assets / "review" / "meyah-mark4-bulk-voice-review-20261025"
source_dir = out / "source-clips"
project_id = "a5a40890-8bb0-4856-aacb-1dcad97074bb"
full = json.loads((root / "review" / "meyah-mark4-full-cast-master.json").read_text(encoding="utf8"))
approved = json.loads((root / "review" / "meyah-mark4-jesus-v9-voice-audition-producer-approval.json").read_text(encoding="utf8"))
if full["mappedRows"] != 54 or full["characterRows"] != 30 or approved["planHash"] != full["planHash"]:
    raise SystemExit("The reviewed full cast master changed")

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def duration(path: Path) -> float:
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode().strip())

def amplitudes(path: Path, count: int = 480) -> list[int]:
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"])
    pcm = array("h")
    pcm.frombytes(raw)
    step = max(1, (len(pcm) + count - 1) // count)
    return [min(255, round(max((abs(sample) for sample in pcm[i:i+step: max(1, step//24)]), default=0) * 255 / 32768)) for i in range(0, len(pcm), step)][:count]

with sqlite3.connect(f"file:{(root / 'db' / 'heartword.sqlite').as_posix()}?mode=ro", uri=True) as db:
    runs = [json.loads(row[0])["run"] for row in db.execute("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='confirm_continuous_speech' AND undone=0 ORDER BY sequence", (project_id,))]
    rows = db.execute("SELECT id,source_path,start_ms,end_ms,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id", (project_id,)).fetchall()
    if len(rows) != 54:
        raise SystemExit("The source row count changed")
    cards = []
    source_dir.mkdir(parents=True, exist_ok=True)
    for run in runs:
        members = run["members"]
        if not run["characterId"]:
            continue
        mapped = db.execute("SELECT a.source_path,m.voice_version_id FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id WHERE m.original_segment_id=? AND a.project_id=?", (members[0]["id"], project_id)).fetchone()
        if not mapped:
            raise SystemExit(f"Unmapped reviewed speech: {run['verseRef']}")
        cast_path = mapped[0].replace("\\", "/")
        for member in members:
            match = db.execute("SELECT a.source_path,m.voice_version_id FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id WHERE m.original_segment_id=? AND a.project_id=?", (member["id"], project_id)).fetchone()
            if match != mapped:
                raise SystemExit(f"Cast master varies within {run['verseRef']}")
        cast = assets / cast_path
        sidecar = json.loads(Path(str(cast) + ".json").read_text(encoding="utf8"))
        if sidecar.get("sourceStartMs") != run["startMs"] or sidecar.get("sourceEndMs") != run["endMs"] or sidecar.get("voiceVersionId") != mapped[1] or sidecar.get("requestSettings") != approved["requestSettings"]:
            raise SystemExit(f"Source timing, voice or current settings changed for {run['verseRef']}")
        source = assets / run["sourcePath"].replace("\\", "/")
        clip = source_dir / f"{run['startMs']}-{run['endMs']}.wav"
        if not clip.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-n", "-i", str(source), "-ss", str(run["startMs"] / 1000),
                            "-t", str((run["endMs"] - run["startMs"]) / 1000), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(clip)], check=True)
        source_s, cast_s = duration(clip), duration(cast)
        expected = (run["endMs"] - run["startMs"]) / 1000
        if abs(source_s - expected) > .05 or abs(cast_s - expected) > .11:
            raise SystemExit(f"Retained cast/source duration differs from reviewed clock for {run['verseRef']}")
        cards.append({"verseRef": run["verseRef"], "speaker": "Peter" if run["characterId"] == "9cbc4222-b194-4db4-baa9-2ba7083e31f3" else "Jesus",
                      "startMs": run["startMs"], "endMs": run["endMs"], "sourceMs": round(source_s * 1000), "castMs": round(cast_s * 1000),
                      "sourceUrl": f"/media/review/meyah-mark4-bulk-voice-review-20261025/source-clips/{clip.name}",
                      "castUrl": "/media/" + cast_path, "sourceWave": amplitudes(clip), "castWave": amplitudes(cast),
                      "sourceSha256": sha(clip), "castSha256": sha(cast), "sidecarSha256": sha(Path(str(cast) + ".json")),
                      "memberCount": len(members), "auditionAlreadyApproved": run["verseRef"] == "Mark 4:9"})

if len(cards) != 10:
    raise SystemExit("Expected ten reviewed character-speech runs")
out.mkdir(parents=True, exist_ok=True)
evidence = {"kind": "read_only_full_cast_listening_review", "projectId": project_id, "planHash": full["planHash"],
            "auditionApproval": "Dan: Approve this audition", "cards": [{k:v for k,v in card.items() if not k.endswith("Wave")} for card in cards],
            "bulkAudioReview": "pending_Dan", "avatarOrFilmApproval": False}
(out / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf8")
js_cards = json.dumps(cards, ensure_ascii=False).replace("<", "\\u003c")
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4 cast listening review</title>
<style>body{{margin:0;background:#edf0ed;color:#18323c;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1080px;margin:auto;padding:2rem 1.1rem}}article{{background:white;border:1px solid #ced7d6;border-radius:12px;padding:1.2rem;margin:1.2rem 0;box-shadow:0 2px 10px #0001}}h1,h2{{line-height:1.2}}h2{{margin-top:0}}.tag{{display:inline-block;background:#dcece7;padding:.15rem .55rem;border-radius:20px;font-size:.85rem}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:1rem}}.player{{min-width:0;background:#f5f8f7;padding:.8rem;border-radius:8px}}audio,canvas{{width:100%}}canvas{{height:72px;background:#e5eceb;border-radius:4px;cursor:pointer}}.note{{background:#fff0cc;border-left:5px solid #b98011;padding:1rem}}small{{color:#4c626a}}@media(max-width:700px){{.pair{{grid-template-columns:1fr}}}}</style>
<main><h1>Meyah Mark 4 · character voice review</h1><p class="note">The first player in each card is the exact reviewed Meyah source window; the second is its ElevenLabs cast master. Check words, pronunciation, timing, voice and delivery. Click either waveform to seek within that player. The Mark 4:9 Jesus audition is already approved; these other outputs and every future Avatar take remain separately reviewable.</p><div id="cards"></div></main>
<script>const cards={js_cards}; const host=document.querySelector('#cards');
function wave(canvas,values,color){{let ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.fillStyle='#e5eceb';ctx.fillRect(0,0,w,h);ctx.fillStyle=color;let step=w/values.length;values.forEach((a,i)=>{{let v=Math.max(2,a/255*(h-12));ctx.fillRect(i*step,(h-v)/2,Math.max(1,step-.3),v)}})}}
cards.forEach((c,i)=>{{let a=document.createElement('article');a.innerHTML=`<h2>${{c.verseRef}} <span class="tag">${{c.speaker}}</span> ${{c.auditionAlreadyApproved?'<span class="tag">audition approved</span>':''}}</h2><p><small>Source ${{(c.startMs/1000).toFixed(3)}}–${{(c.endMs/1000).toFixed(3)}} s · ${{c.memberCount}} source row${{c.memberCount===1?'':'s'}} · source ${{(c.sourceMs/1000).toFixed(3)}} s · cast ${{(c.castMs/1000).toFixed(3)}} s</small></p><div class="pair"><div class="player"><b>Original Meyah</b><canvas aria-label="source waveform"></canvas><audio controls preload="none" src="${{c.sourceUrl}}"></audio></div><div class="player"><b>Mapped ${{c.speaker}} voice</b><canvas aria-label="cast waveform"></canvas><audio controls preload="none" src="${{c.castUrl}}"></audio></div></div>`;host.append(a);[[0,c.sourceWave,'#4a7280'],[1,c.castWave,'#a66548']].forEach(([n,v,color])=>{{let p=a.querySelectorAll('.player')[n],cv=p.querySelector('canvas'),audio=p.querySelector('audio');wave(cv,v,color);cv.onclick=e=>{{if(Number.isFinite(audio.duration))audio.currentTime=(e.offsetX/cv.clientWidth)*audio.duration;audio.play()}}}})}});
addEventListener('resize',()=>document.querySelectorAll('article').forEach((a,i)=>{{wave(a.querySelectorAll('canvas')[0],cards[i].sourceWave,'#4a7280');wave(a.querySelectorAll('canvas')[1],cards[i].castWave,'#a66548')}}));</script></html>'''
(out / "index.html").write_text(page, encoding="utf8")
print(json.dumps({"url":"http://127.0.0.1:4002/media/review/meyah-mark4-bulk-voice-review-20261025/index.html",
                  "cards":len(cards),"totalSpeechSeconds":round(sum(c["endMs"]-c["startMs"] for c in cards)/1000,3),
                  "review":evidence["bulkAudioReview"]},indent=2))
