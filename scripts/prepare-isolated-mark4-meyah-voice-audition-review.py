"""Render read-only source-versus-voice listening review for Meyah Mark 4:9."""
from __future__ import annotations

import hashlib
import html
import json
import sqlite3
import subprocess
from pathlib import Path

checkout=Path(__file__).resolve().parents[1]
root=checkout/"output"/"mark4-donor-20261024"
assets=root/"assets"
review=assets/"review"/"meyah-mark4-voice-audition-20261025"
source_candidate=json.loads((root/"review"/"meyah-mark4-v9-audition-source-candidate.json").read_text(encoding="utf8"))
cast_candidate=json.loads((root/"review"/"meyah-mark4-jesus-v9-voice-audition-candidate.json").read_text(encoding="utf8"))
plan=json.loads((root/"review"/"meyah-mark4-reviewed-correspondence-application.json").read_text(encoding="utf8"))
if source_candidate["sourceStartMs"]!=142703 or source_candidate["sourceEndMs"]!=152394 or cast_candidate["sourceSegmentId"]!="96ff1b8b-7b03-45fc-93d7-c6ee60d0f520":
    raise SystemExit("The reviewed 4:9 audition source changed")
source=assets/source_candidate["sourceClipPath"]
if hashlib.sha256(source.read_bytes()).hexdigest()!=source_candidate["sourceClipSha256"]:
    raise SystemExit("The reviewed source-listening clip changed")
cast_path=cast_candidate["castPath"].replace("\\","/")
cast=assets/cast_path
sidecar=json.loads(Path(str(cast)+".json").read_text(encoding="utf8"))
if sidecar.get("sourceStartMs")!=142703 or sidecar.get("sourceEndMs")!=152394 or sidecar.get("voiceId")!=source_candidate["approvedDonorVoiceId"] or sidecar.get("requestSettings")!=source_candidate["proposedCurrentSettings"]:
    raise SystemExit("The cast master does not preserve the approved voice, source window and current settings")
with sqlite3.connect(f"file:{(root/'db'/'heartword.sqlite').as_posix()}?mode=ro",uri=True) as db:
    row=db.execute("SELECT a.source_path,a.start_ms,a.end_ms FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id WHERE m.original_segment_id=? AND a.project_id=?",
                   (cast_candidate["sourceSegmentId"],cast_candidate["projectId"])).fetchone()
    if row!=(cast_candidate["castPath"],0,9706):raise SystemExit("The isolated audition mapping changed")
    approved=db.execute("SELECT COUNT(*) FROM edit_commands WHERE project_id=? AND command_type='approve_edition_voice_audition' AND undone=0",(cast_candidate["projectId"],)).fetchone()[0]
    if approved:raise SystemExit("The voice audition is already approved; this candidate review is stale")
    target_shots=db.execute("SELECT COUNT(*) FROM shots WHERE scene_id IN (SELECT id FROM scenes WHERE project_id=?)",(cast_candidate["projectId"],)).fetchone()[0]
    if target_shots!=145:raise SystemExit("The target correspondence changed")
def duration(path:Path)->float:
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(path)]).decode().strip())
source_s=duration(source);cast_s=duration(cast)
if abs(source_s-9.691)>.06 or abs(cast_s-9.706)>.06:raise SystemExit("The audition duration changed")
review.mkdir(parents=True,exist_ok=True)
source_url="/media/"+source_candidate["sourceClipPath"].replace("\\","/")
cast_url="/media/"+cast_path
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meyah Mark 4:9 Jesus voice audition</title><style>body{{margin:0;background:#e9e8e2;color:#1b3037;font:17px/1.5 system-ui,sans-serif}}main{{max-width:900px;margin:auto;padding:2rem}}article{{background:white;border:1px solid #cbd5d4;border-radius:.5rem;padding:1.2rem;margin:1rem 0}}audio{{width:100%}}.note{{background:#fff2cf;padding:1rem;border-left:5px solid #a97419}}code{{font-size:.8rem;overflow-wrap:anywhere}}a{{color:#075d7b}}</style><main><h1>Jesus · Meyah Mark 4:9 voice audition</h1><p class="note">Listen to the approved original Meyah source, then the same 9.691-second quotation mapped into the approved Jesus voice. This is one bounded ElevenLabs candidate and is not approved for chapter-wide voicing yet. The narration, original words and full source recording remain intact.</p><p><b>Source quotation:</b> {html.escape(source_candidate['quotedMeyahText'])}</p><article><h2>1. Original Meyah voice</h2><audio controls preload="metadata" src="{html.escape(source_url,quote=True)}"></audio><p>{source_s:.3f} seconds · reviewed source window 02:22.703–02:32.394</p></article><article><h2>2. Approved Jesus voice identity, Meyah words</h2><audio controls preload="metadata" src="{html.escape(cast_url,quote=True)}"></audio><p>{cast_s:.3f} seconds. Compare pronunciation, word order, emotional delivery, voice identity and beginning/end timing with the source above.</p></article><p>Current mapping settings are explicitly retained: multilingual speech-to-speech v2, background-noise removal, MP3 44.1 kHz/128 kb/s. Historical settings for the old Hatam cast master remain unknown. The source window, voice ID, sidecar, target database mapping and selected title/shot plan were rechecked while building this page.</p><p><a href="/media/review/meyah-mark4-new-beat-cast-review-20261025.html">Reviewed new-beat cast</a> · <a href="/media/review/meyah-mark4-main-shot-review-20261025/index.html">Approved picture map</a></p></main></html>'''
(review/"index.html").write_text(page,encoding="utf8")
receipt={"kind":"read_only_voice_audition_review","projectId":cast_candidate["projectId"],"sourceSegmentId":cast_candidate["sourceSegmentId"],
         "sourceStartMs":142703,"sourceEndMs":152394,"sourcePath":source_candidate["sourceClipPath"],"sourceSha256":source_candidate["sourceClipSha256"],
         "castPath":cast_path,"castSha256":hashlib.sha256(cast.read_bytes()).hexdigest(),"sidecarSha256":hashlib.sha256(Path(str(cast)+".json").read_bytes()).hexdigest(),
         "sourceDurationMs":round(source_s*1000),"castDurationMs":round(cast_s*1000),"planHash":plan["planHash"],"approval":"pending_Dan_listening_review"}
(review/"evidence.json").write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
print(json.dumps({"url":"http://127.0.0.1:4002/media/review/meyah-mark4-voice-audition-20261025/index.html","sourceDurationMs":receipt["sourceDurationMs"],"castDurationMs":receipt["castDurationMs"],"approval":receipt["approval"]},indent=2))
