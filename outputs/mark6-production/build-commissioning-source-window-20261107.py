from pathlib import Path
import json,hashlib,wave,subprocess,datetime
root=Path(__file__).resolve().parent;assets=Path('C:/Users/danbr/HeartWordData/assets');out=root/'commissioning-source-window-20261107';out.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(a):return subprocess.check_output(a,stderr=subprocess.STDOUT,text=True,encoding='utf8')
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
summary=json.loads((root/'selected-shot-assembly-nineteen-clips-20261107/summary.json').read_text());assert summary['selectedMovingClips']==19
selected=[('4586bbd6-4ef0-41d4-ae06-66163302494f',72),('a9098941-7d3b-4520-acb8-a1dd832a7793',120),('ca57383b-8aaf-4c30-8974-82c0c94d255e',229)]
inputs=[];records=[]
for aid,n in selected:
 r=next(r for r in summary['results'] if r['rawAttemptId']==aid);p=assets/r['assembled']['assembledVideoPath'];assert sha(p)==r['assembledSha256'];v=next(s for s in probe(p)['streams'] if s['codec_type']=='video');assert (v['width'],v['height'],v['r_frame_rate'])==(1280,720,'24/1') and int(v['nb_frames'])>=n
 inputs+=['-i',str(p)];records.append(dict(shotId=r['assembled']['shotId'],rawAttemptId=aid,path=str(p),sha256=sha(p),frameStart=0,frameEndExclusive=n))
mix=json.loads((root/'source-clock-mix-candidates.json').read_text());master=Path(mix['mixPath']);assert sha(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
start=2368296;end=2788536
with wave.open(str(master),'rb') as w:
 assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(24000,2,2,19120320);params=w.getparams();w.setpos(start);pcm=w.readframes(end-start)
assert len(pcm)==420240*4
wav=out/'approved-source-window.wav'
with wave.open(str(wav),'wb') as w:w.setparams(params);w.writeframes(pcm)
aac=out/'approved-source-window-aac.m4a';run(['ffmpeg','-hide_banner','-loglevel','error','-n','-i',str(wav),'-map','0:a:0','-c:a','aac','-b:a','192k','-ar','24000','-movie_timescale','24000',str(aac)])
graph=';'.join(f'[{i}:v]trim=start_frame=0:end_frame={n},setpts=PTS-STARTPTS,setsar=1[v{i}]' for i,(_,n) in enumerate(selected))+';[v0][v1][v2]concat=n=3:v=1:a=0[v]'
picture=out/'picture-only.mp4';run(['ffmpeg','-hide_banner','-loglevel','error','-n',*inputs,'-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24',str(picture)])
video=out/'mark6-commissioning-approved-music.mp4';run(['ffmpeg','-hide_banner','-loglevel','error','-n','-i',str(picture),'-i',str(aac),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(video)])
p=probe(video);v=next(s for s in p['streams'] if s['codec_type']=='video');a=next(s for s in p['streams'] if s['codec_type']=='audio');assert v['nb_frames']=='421' and v['r_frame_rate']=='24/1' and a['duration_ts']==420240 and a['sample_rate']=='24000' and a['start_time']=='0.000000' and v['start_time']=='0.000000'
def packets(p):
 d=json.loads(run(['ffprobe','-v','error','-select_streams','a','-show_packets','-show_data_hash','sha256','-of','json',str(p)]));return [(r['pts'],r['duration'],r['size'],r['data_hash']) for r in d['packets']]
assert packets(aac)==packets(video) and sha(master)==mix['mixSha256']
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Actual complete source98.679–116.189s commissioning excerpt for joined review, NOT full chapter/editor approval',sourceStartMs=98679,sourceEndMs=116189,sourceDurationMs=17510,sourceStartSample=start,sourceEndSample=end,sourceSampleRate=24000,sourceMixPath=str(master),sourceMixSha256=mix['mixSha256'],exactPcmSubsetSha256=hashlib.sha256(pcm).hexdigest(),noGainOrResampling=True,noAudioGapsOrAddedPauses=True,aacPacketsIdenticalToSingleReferenceEncode=True,pictureFrames=421,pictureFps=24,pictureDurationMs=421/24*1000,endPictureSurplusMs=421/24*1000-17510,cutAfterFrames=[72,192],inputs=records,output=str(video),outputSha256=sha(video),allMotionReal=True,noBowFootageUsed=True,nativeAudioExcluded=True,internalVerseWordTimingUnresolved=True,sourceAction='The twelve receive authority; no supernatural effect/ritual/new spoken words.',wholeFilmComplete=False,joinedAVPending=True,providerCalls=0)
(out/'manifest.json').write_text(json.dumps(proof,indent=2));(out/'probe.json').write_text(json.dumps(p,indent=2));print(json.dumps(dict(output=str(video),frames=421,sourceMs=17510,sourceSamples=420240)))
