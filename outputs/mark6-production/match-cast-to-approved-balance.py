"""Retain level-matched mix candidates; never alter approved performances/maps."""
import hashlib,json,pathlib,re,subprocess,wave
import numpy as np
root=pathlib.Path('outputs/mark6-production')
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
previous=read(root/'mastered-cast-candidates.json')
fits={r['id']:r for r in read(root/'fitted-cast-audio.json')['rows']}
out=pathlib.Path('C:/Users/danbr/HeartWordData/assets/generated/hatam/mark-6/level-matched-cast-candidates-20261102')
out.mkdir(parents=True,exist_ok=True)
ledger=root/'level-matched-cast-candidates.json'
assert not ledger.exists(),'Reconcile existing ledger before repeating'
def ff(args):
 return subprocess.run(['ffmpeg','-hide_banner','-nostdin',*args],capture_output=True,text=True,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
def pcm(path):
 with wave.open(str(path),'rb') as w:
  assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(48000,1,2)
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)
rows=[]
for old in previous['rows']:
 assert sha(old['candidatePath'])==old['candidateSha256']
 fit=fits[old['id']];assert sha(fit['path'])==fit['sha256']
 gain=round(old['targetLufs']-old['actualLufs'],6)
 path=out/(old['id']+'.wav');assert not path.exists()
 # Only volume and latency-compensated transient protection: no resampling,
 # tempo, silence trimming or new performance. Retain original candidate.
 filt=f'volume={gain}dB,alimiter=limit=0.841395:level=false:latency=true'
 ff(['-n','-i',old['candidatePath'],'-af',filt,'-c:a','pcm_s16le',str(path)])
 a=pcm(fit['path']);b=pcm(path);assert len(a)==len(b)==fit['sampleCount']
 probes=[]
 for frac in [.2,.5,.8]:
  width=min(24000,len(a));start=max(0,min(len(a)-width,int(len(a)*frac)-width//2));x=a[start:start+width];y=b[start:start+width]
  if np.sqrt(np.mean(x*x))<20:continue
  scores=[]
  for lag in range(-48,49):
   xx=x[max(0,-lag):width-max(0,lag)];yy=y[max(0,lag):width-max(0,-lag)];den=np.linalg.norm(xx)*np.linalg.norm(yy)
   scores.append((float(np.dot(xx,yy)/den) if den else 0,lag))
  corr,lag=max(scores);assert abs(lag)<=1 and corr>.9
  probes.append({'relativePosition':frac,'lagSamples':lag,'correlation':corr})
 assert probes
 measured=ff(['-i',str(path),'-af',f"loudnorm=I={old['targetLufs']}:TP=-1.5:LRA=7:print_format=json",'-f','null','-'])
 m=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',measured.stderr)[-1])
 deviation=float(m['input_i'])-old['targetLufs']
 assert abs(deviation)<=.5 and float(m['input_tp'])<=-1.1
 rows.append({'id':old['id'],'path':str(path),'sha256':sha(path),'previousMasterPath':old['candidatePath'],'previousMasterSha256':old['candidateSha256'],'rawFittedPath':fit['path'],'rawFittedSha256':fit['sha256'],'sampleRate':48000,'sampleCount':len(b),'gainDb':gain,'filter':filt,'targetLufs':old['targetLufs'],'actualLufs':float(m['input_i']),'deviationLu':round(deviation,3),'truePeakDbfs':float(m['input_tp']),'timingProbes':probes})
 ledger.write_text(json.dumps({'status':'building','rows':rows},indent=2),encoding='utf-8')
 print(json.dumps({'id':old['id'],'actualLufs':m['input_i'],'deviationLu':round(deviation,3),'peak':m['input_tp']}),flush=True)
score=read(root/'approved-score-reference.json');assert sha(score['path'])==score['sha256']
ledger.write_text(json.dumps({'status':'18_level_matched_candidates_full_mix_review_pending','rows':rows,'approvedScoreSha256':score['sha256'],'approvedScoreFurtherGainDb':0,'noAdditionalDucking':True,'liveCastMappingsUnchanged':True,'rawFittedTakesUnchanged':True,'newProviderCalls':0},indent=2),encoding='utf-8')
