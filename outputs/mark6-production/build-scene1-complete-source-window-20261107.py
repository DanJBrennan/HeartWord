from pathlib import Path
import json,hashlib,wave,subprocess,datetime
root=Path(__file__).resolve().parent
assets=Path('C:/Users/danbr/HeartWordData/assets')
out=root/'scene1-complete-source-window-20261107'
out.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(a):return subprocess.check_output(a,stderr=subprocess.STDOUT,text=True,encoding='utf8')
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
summary=json.loads((root/'selected-shot-assembly-sixteen-clips-20261107/summary.json').read_text())
entries=[
 ('47f3e64b-4ab6-411a-aa5e-5ec138768b07',None,120),
 ('037047e0-1333-4b34-9cf9-062fcf03acad',None,48),
 ('72f96eff-3aab-4786-ba4d-89c03539e160','cc0b364a-d2ca-4f50-852f-b793618429df',48),
 ('72f96eff-3aab-4786-ba4d-89c03539e160','8a041f6b-a7b6-4b2e-82a3-279d348ea641',240),
 ('72f96eff-3aab-4786-ba4d-89c03539e160','7dcf06f6-b4dc-4189-8fbc-adcd1961696f',211),
 ('27762a0e-894c-4fa0-8726-fb1c5209fa53',None,72),
 ('1a3ecc10-00c7-4d1f-b0bc-0b276f4f1045',None,437),
 ('30837ce5-9556-4ca5-96f0-72bc1fd82b2c',None,292),
 ('07397434-9e52-4002-8f5f-1add4c5daed1',None,104),
 ('3fab03da-fa97-475c-bb32-d2d4c1f749ba',None,216),
 ('1de6f4d9-33ab-4bff-ac5f-c6d17f236612',None,168),
 ('02564f83-d065-49b9-a447-3c43a1caf8f1',None,168),
 ('1c917e59-a1c5-4d86-be75-9f3372103694',None,173),
 ('9b79d8e5-c8ec-402d-b54d-618133242db4',None,72)]
counts=[r[2] for r in entries];records=[];inputs=[]
for sid,attempt,count in entries:
 r=next(r for r in summary['results'] if r['assembled']['shotId']==sid and (attempt is None or r['rawAttemptId']==attempt))
 p=assets/r['assembled']['assembledVideoPath'];assert sha(p)==r['assembledSha256']
 v=next(s for s in probe(p)['streams'] if s['codec_type']=='video')
 assert v['r_frame_rate']=='24/1' and int(v['nb_frames'])>=count and (v['width'],v['height'])==(1280,720)
 inputs+=['-i',str(p)];records.append(dict(shotId=sid,rawAttemptId=r['rawAttemptId'],path=str(p),sha256=sha(p),frameStart=0,frameEndExclusive=count))
mix=Path(json.loads((root/'source-clock-mix-candidates.json').read_text())['mixPath'])
expected='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
assert sha(mix)==expected
with wave.open(str(mix),'rb') as w:
 assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(24000,2,2,19120320)
 params=w.getparams();start=0;end=2368296;w.setpos(start);pcm=w.readframes(end-start)
assert len(pcm)==(end-start)*4
wav=out/'approved-source-window.wav'
with wave.open(str(wav),'wb') as w:w.setparams(params);w.writeframes(pcm)
with wave.open(str(wav),'rb') as w:assert w.getnframes()==end-start and w.readframes(w.getnframes())==pcm
ref=out/'approved-source-window-aac.m4a'
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-map','0:a:0','-c:a','aac','-b:a','192k','-ar','24000','-movie_timescale','24000',str(ref)])
graph=';'.join(f'[{i}:v]trim=start_frame=0:end_frame={n},setpts=PTS-STARTPTS,setsar=1[v{i}]' for i,n in enumerate(counts))+';'+''.join(f'[v{i}]' for i in range(14))+'concat=n=14:v=1:a=0[v]'
video=out/'picture-only.mp4'
run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24',str(video)])
final=out/'mark6-scene1-complete-approved-music.mp4'
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video),'-i',str(ref),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(final)])
pr=probe(final);v=next(s for s in pr['streams'] if s['codec_type']=='video');a=next(s for s in pr['streams'] if s['codec_type']=='audio')
assert v['nb_frames']=='2369' and v['r_frame_rate']=='24/1'
assert a['sample_rate']=='24000' and a['duration_ts']==end-start and a['time_base']=='1/24000' and a['start_time']=='0.000000' and v['start_time']=='0.000000'
def packets(p):
 q=json.loads(run(['ffprobe','-v','error','-select_streams','a','-show_packets','-show_data_hash','sha256','-of','json',str(p)]))
 return [(x['pts'],x['duration'],x['size'],x['data_hash']) for x in q['packets']]
assert packets(ref)==packets(final) and sha(mix)==expected
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Review-only source excerpt, not full chapter or source placement approval',sourceStartMs=0,sourceEndMs=98679,sourceDurationMs=98679,sourceStartSample=start,sourceEndSample=end,sampleRate=24000,channels=2,pcmWidthBytes=2,sourceMixPath=str(mix),sourceMixSha256=expected,exactSubsetPcmSha256=hashlib.sha256(pcm).hexdigest(),noGainOrResampling=True,noAudioGapsOrAddedPauses=True,pictureFrames=2369,pictureFps=24,pictureDurationMs=2369/24*1000,endFrameSurplusMs=2369/24*1000-98679,cutAfterFrames=[120,168,216,456,667,739,1176,1468,1572,1788,1956,2124,2297],reactionRetainedFrames=104,reactionAvailableFrames=105,frameRoundingDoesNotChangeAudio=True,inputs=records,aacPacketsIdenticalToSingleReferenceEncode=True,output=str(final),outputSha256=sha(final),wholeFilmComplete=False,providerCalls=0,latePictureCutsAreEditorialIllustrationOnly=True,internalVerseTimingUnresolved=True,healingCyclesRetainedCompletely=True,soberResponseParentFrames=[48,120],openingSource0to30789Included=True,recordedTitleIncluded=True,sourceTitleMs=[567,3259],verse1StartMs=4823,entireFirstSceneIncluded=True,finalJoinedAVPending=True)
(out/'manifest.json').write_text(json.dumps(proof,indent=2),encoding='utf8');(out/'probe.json').write_text(json.dumps(pr,indent=2),encoding='utf8')
print(json.dumps(dict(output=str(final),frames=2369,exactSourceSamples=end-start,durationMs=98679,sourceMixUnchanged=True)))
