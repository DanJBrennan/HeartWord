"""Read-only extraction from the approved Mark 5 film and its retained cast line."""
from pathlib import Path
import json,hashlib,subprocess,sqlite3,wave
ROOT=Path(__file__).resolve().parent;ASSETS=ROOT/'assets';ASSETS.mkdir(exist_ok=False)
DATA=Path('C:/Users/danbr/HeartWordData');RID='f6709702-7e82-4a99-b072-7358d9e685a8'
film=DATA/'exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4'
source=json.loads(Path('scripts/experiments/ltx-mark5-jesus-long-source.json').read_text(encoding='utf-8'))
cast=DATA/'assets'/source['audio']['source_path'].replace('\\','/')
original=DATA/'assets'/source['original']['source_path']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def call(*a):return subprocess.check_output([str(x) for x in a],creationflags=subprocess.CREATE_NO_WINDOW)
def ff(*a):return call('ffmpeg','-v','error','-nostdin','-n',*a)
assert sha(film)=='286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b'
assert sha(cast)==source['audio']['sha256']
c=sqlite3.connect('file:C:/Users/danbr/HeartWordData/db/heartword.sqlite?mode=ro',uri=True)
timeline,audio=map(json.loads,c.execute('select timeline_json,source_audio_json from chapter_render_manifests where render_id=?',(RID,)).fetchone())
placement=next(x for x in audio if x['segmentId']==source['original']['id'])
assert placement['startMs']==248470 and placement['endMs']==256450 and placement['voice']=='cast'
canon=c.execute("select status,locked_visual_facts from character_versions where id=?",(source['portrait']['character_version_id'],)).fetchone();assert canon[0]=='approved';c.close()
# Start on the actual film picture frame. Its 11 2/3 ms pre-quote interval is
# retained REAL source quiet from the preceding approved source-map gap.
startFrame=5963;frames=192;sampleRate=48000;preSamples=560
quiet=ASSETS/'existing-prequote-quiet.wav';speech=ASSETS/'complete-cast-line.wav'
ff('-i',original,'-af','aresample=48000,atrim=start_sample=11350000:end_sample=11350560,asetpts=PTS-STARTPTS','-ac','2','-c:a','pcm_s16le',quiet)
ff('-i',cast,'-ar','48000','-ac','2','-c:a','pcm_s16le',speech)
with wave.open(str(quiet),'rb') as w:q=w.readframes(w.getnframes());assert w.getnframes()==preSamples
with wave.open(str(speech),'rb') as w:s=w.readframes(w.getnframes());n=w.getnframes();assert w.getframerate()==sampleRate
full=ASSETS/'full-line.wav'
with wave.open(str(full),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sampleRate);w.writeframes(q+s)
assert n==383408 and len(q+s)==383968*4
ff('-i',ROOT/'film-start-frame.png','-vf','scale=1280:704:force_original_aspect_ratio=decrease,pad=1280:704:(ow-iw)/2:(oh-ih)/2','-frames:v','1',ASSETS/'start.png')
# The film excerpt retains its actual mixed audio for standalone reference.
ff('-i',film,'-filter_complex','[0:v]trim=start_frame=5963:end_frame=6155,setpts=PTS-STARTPTS[v];[0:a]atrim=start_sample=11926000:end_sample=12310000,asetpts=PTS-STARTPTS[a]',
 '-map','[v]','-map','[a]','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',ROOT/'film-excerpt-original-mix.mp4')
ff('-i',ROOT/'film-excerpt-original-mix.mp4','-vf','scale=1280:704:force_original_aspect_ratio=decrease,pad=1280:704:(ow-iw)/2:(oh-ih)/2,crop=980:550:150:0,scale=1280:720','-an','-c:v','ffv1',ASSETS/'film-picture-matched-crop.mkv')
manifest={'status':'prepared_not_submitted','passage':'Hatam Mark 5:19 complete Jesus utterance','source':source,
 'approvedFilm':{'path':str(film),'sha256':sha(film),'renderId':RID,'sourceMap':placement,'startFrame':startFrame,'frames':frames,'startSample48k':11926000},
 'cast':{'path':str(cast),'sha256':sha(cast),'completeResampledSamples':n,'originalWordsAndSpeedUnchanged':True},
 'existingPrequoteQuiet':{'sourcePath':str(original),'sourceSha256':sha(original),'startSample48k':11350000,'endSample48k':11350560,'sourceMapGapMs':[235744,236470],'inventedSilence':False},
 'fullLine':{'path':str(full.resolve()),'sha256':sha(full),'sampleRate':sampleRate,'samples':383968,'durationSeconds':383968/sampleRate},
 'startingFrame':{'path':str((ASSETS/'start.png').resolve()),'sha256':sha(ASSETS/'start.png'),'origin':'Approved film frame 5963, fitted into native 1280x704 without clipping hair/face'},
 'canon':{'versionId':source['portrait']['character_version_id'],'characterId':'b78bed54-1d53-4b9f-9070-549dddb71b19','lockedVisualFacts':json.loads(canon[1])},
 'comparisonAudio':'One shared complete clean existing cast line with 11.667ms of real pre-quote quiet, aligned to the film frame boundary. Film original mix retained separately. Complete cast tail extends 7.664ms beyond the film source-map speech slot, within existing picture-frame rounding; no words/speed altered.',
 'fullProductionHold':True,'newVoiceCalls':0,'newImageCalls':0,'paidFallback':False}
(ROOT/'preparation.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print(json.dumps({'prepared':True,'fullLineSamples':383968,'durationSeconds':383968/48000,'filmFrames':192}))
