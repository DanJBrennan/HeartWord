from pathlib import Path
import json,hashlib,wave,subprocess,datetime
root=Path(__file__).resolve().parent
assets=Path('C:/Users/danbr/HeartWordData/assets')
out=root/'question-reaction-reply-source-window-20261107'
out.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(a):return subprocess.check_output(a,stderr=subprocess.STDOUT,text=True,encoding='utf8')
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
summary=json.loads((root/'selected-shot-assembly-twelve-20261107/summary.json').read_text())
ids=['1a3ecc10-00c7-4d1f-b0bc-0b276f4f1045','30837ce5-9556-4ca5-96f0-72bc1fd82b2c','07397434-9e52-4002-8f5f-1add4c5daed1','3fab03da-fa97-475c-bb32-d2d4c1f749ba']
counts=[437,292,104,216];records=[];inputs=[]
for sid,count in zip(ids,counts):
 r=next(r for r in summary['results'] if r['assembled']['shotId']==sid)
 p=assets/r['assembled']['assembledVideoPath'];assert sha(p)==r['assembledSha256']
 v=next(s for s in probe(p)['streams'] if s['codec_type']=='video')
 assert v['r_frame_rate']=='24/1' and int(v['nb_frames'])>=count and (v['width'],v['height'])==(1280,720)
 inputs+=['-i',str(p)];records.append(dict(shotId=sid,rawAttemptId=r['rawAttemptId'],path=str(p),sha256=sha(p),frameStart=0,frameEndExclusive=count))
mix=Path(json.loads((root/'source-clock-mix-candidates.json').read_text())['mixPath'])
expected='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
assert sha(mix)==expected
with wave.open(str(mix),'rb') as w:
 assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(24000,2,2,19120320)
 params=w.getparams();start=738936;end=1787760;w.setpos(start);pcm=w.readframes(end-start)
assert len(pcm)==(end-start)*4
wav=out/'approved-source-window.wav'
with wave.open(str(wav),'wb') as w:w.setparams(params);w.writeframes(pcm)
with wave.open(str(wav),'rb') as w:assert w.getnframes()==end-start and w.readframes(w.getnframes())==pcm
ref=out/'approved-source-window-aac.m4a'
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-map','0:a:0','-c:a','aac','-b:a','192k','-ar','24000','-movie_timescale','24000',str(ref)])
graph=';'.join(f'[{i}:v]trim=start_frame=0:end_frame={n},setpts=PTS-STARTPTS,setsar=1[v{i}]' for i,n in enumerate(counts))+';[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]'
video=out/'picture-only.mp4'
run(['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',graph,'-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24',str(video)])
final=out/'question-reaction-reply-approved-music.mp4'
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video),'-i',str(ref),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(final)])
pr=probe(final);v=next(s for s in pr['streams'] if s['codec_type']=='video');a=next(s for s in pr['streams'] if s['codec_type']=='audio')
assert v['nb_frames']=='1049' and v['r_frame_rate']=='24/1'
assert a['sample_rate']=='24000' and a['duration_ts']==end-start and a['time_base']=='1/24000' and a['start_time']=='0.000000' and v['start_time']=='0.000000'
def packets(p):
 q=json.loads(run(['ffprobe','-v','error','-select_streams','a','-show_packets','-show_data_hash','sha256','-of','json',str(p)]))
 return [(x['pts'],x['duration'],x['size'],x['data_hash']) for x in q['packets']]
assert packets(ref)==packets(final) and sha(mix)==expected
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Review-only source excerpt, not full chapter or source placement approval',sourceStartMs=30789,sourceEndMs=74490,sourceDurationMs=43701,sourceStartSample=start,sourceEndSample=end,sampleRate=24000,channels=2,pcmWidthBytes=2,sourceMixPath=str(mix),sourceMixSha256=expected,exactSubsetPcmSha256=hashlib.sha256(pcm).hexdigest(),noGainOrResampling=True,noAudioGapsOrAddedPauses=True,pictureFrames=1049,pictureFps=24,pictureDurationMs=1049/24*1000,endFrameSurplusMs=1049/24*1000-43701,cutAfterFrames=[437,729,833],reactionRetainedFrames=104,reactionAvailableFrames=105,frameRoundingDoesNotChangeAudio=True,inputs=records,aacPacketsIdenticalToSingleReferenceEncode=True,output=str(final),outputSha256=sha(final),wholeFilmComplete=False,providerCalls=0)
(out/'manifest.json').write_text(json.dumps(proof,indent=2),encoding='utf8');(out/'probe.json').write_text(json.dumps(pr,indent=2),encoding='utf8')
print(json.dumps(dict(output=str(final),frames=1049,exactSourceSamples=end-start,durationMs=43701,sourceMixUnchanged=True)))
