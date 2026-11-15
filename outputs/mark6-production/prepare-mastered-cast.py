import json,pathlib,subprocess,re,wave,hashlib
import numpy as np
root=pathlib.Path('outputs/mark6-production');read=lambda p:json.loads(p.read_text(encoding='utf-8'));cal=read(root/'cast-loudness-calibration.json');fits=read(root/'fitted-cast-audio.json')['rows'];out=pathlib.Path('C:/Users/danbr/HeartWordData/assets/generated/hatam/mark-6/mastered-cast-candidates-20261102');out.mkdir(parents=True,exist_ok=True)
ledger=root/'mastered-cast-candidates.json';retained=read(ledger)['rows'] if ledger.exists() else []
def run(args):return subprocess.run(['ffmpeg','-hide_banner','-nostdin',*args],capture_output=True,text=True,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
def measure(path,target):
 r=run(['-i',str(path),'-af',f'loudnorm=I={target}:TP=-4.5:LRA=7:print_format=json','-f','null','-']);return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',r.stderr)[-1])
def pcm(path):
 with wave.open(str(path),'rb') as w:
  assert w.getframerate()==48000 and w.getnchannels()==1 and w.getsampwidth()==2
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)
rows=[]
for item in cal['rows']:
 if any(r['id']==item['id'] for r in retained):
  r=next(r for r in retained if r['id']==item['id']);assert hashlib.sha256(pathlib.Path(r['candidatePath']).read_bytes()).hexdigest()==r['candidateSha256'];rows.append(r);continue
 f=next(f for f in fits if f['id']==item['id']);target=item['candidateTargetLufs'];first=measure(f['path'],target);path=out/(f['id']+'.wav')
 af=f"loudnorm=I={target}:TP=-4.5:LRA=7:measured_I={first['input_i']}:measured_LRA={first['input_lra']}:measured_TP={first['input_tp']}:measured_thresh={first['input_thresh']}:offset={first['target_offset']}:linear=true:print_format=json,aresample=48000,alimiter=limit=0.562341:level=false:latency=true"
 if path.exists():
  # Reconcile the retained q01 from the interrupted, peak-safe second attempt.
  assert f['id'] in ['quote-01','quote-03'], 'Unexpected existing candidate; stop for reconciliation'
 else:run(['-n','-i',f['path'],'-af',af,'-ar','48000','-ac','1','-c:a','pcm_s16le',str(path)])
 a=pcm(f['path']);b=pcm(path);assert len(a)==len(b)==f['sampleCount'],'Mastering changed sample duration'
 after=measure(path,target);probes=[]
 for frac in [.2,.5,.8]:
  width=min(24000,len(a));start=max(0,min(len(a)-width,int(len(a)*frac)-width//2));x=a[start:start+width];y=b[start:start+width]
  if np.sqrt(np.mean(x*x))<20:continue
  matches=[]
  for lag in range(-48,49):
   xx=x[max(0,-lag):width-max(0,lag)];yy=y[max(0,lag):width-max(0,-lag)];den=np.linalg.norm(xx)*np.linalg.norm(yy);matches.append((float(np.dot(xx,yy)/den) if den else 0,lag))
  best=max(matches);assert abs(best[1])<=1 and best[0]>.9,'Mastering introduced measurable speech shift or excessive distortion';probes.append({'relativePosition':frac,'bestLagSamples':best[1],'correlation':best[0]})
 # Peak protection can prevent the requested integrated loudness. Retain
 # measured deviations for mix review rather than claiming level approval.
 assert probes and float(after['input_tp'])<=-4.25,'Peak/timing safety not met'
 rows.append({'id':f['id'],'rawFittedPath':f['path'],'rawFittedSha256':f['sha256'],'candidatePath':str(path),'candidateSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sampleRate':48000,'sampleCount':len(a),'targetLufs':target,'actualLufs':float(after['input_i']),'actualTruePeakDbfs':float(after['input_tp']),'filter':af,'timingProbes':probes,'speed':1,'status':'mastering_candidate_full_mix_AV_pending'})
 ledger.write_text(json.dumps({'status':'building_candidates','rows':rows,'rawTakesUnchanged':True,'approvedScoreUnchanged':True,'newProviderCalls':0},indent=2),encoding='utf-8')
 print(json.dumps({'id':f['id'],'lufs':after['input_i'],'peak':after['input_tp'],'samples':len(a)}),flush=True)
ledger.write_text(json.dumps({'status':'18_peak_safe_candidates_ready_for_final_mix_review','rows':rows,'rawTakesUnchanged':True,'approvedScoreUnchanged':True,'noSourceSpeedOrSampleCountChange':True,'liveCastMappingsUnchanged':True,'newProviderCalls':0},indent=2),encoding='utf-8')
