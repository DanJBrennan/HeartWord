import json,pathlib,subprocess,math
import numpy as np
root=pathlib.Path('outputs/mark6-production');prep=pathlib.Path('outputs/mark6-preparation');read=lambda p:json.loads(p.read_text(encoding='utf-8'))
fit=read(root/'fitted-cast-audio.json');manifest=read(prep/'voice-queue-v1/manifest.json');source=read(prep/'source-packet-v3/source-packet.json')['input']['audio']
def decode(path,rate):
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',str(path),'-ar',str(rate),'-ac','1','-f','f32le','-'],creationflags=subprocess.CREATE_NO_WINDOW),dtype='<f4')
def stats(x):
 rms=float(np.sqrt(np.mean(x.astype(np.float64)**2)));peak=float(np.max(np.abs(x)));return {'rmsDbfs':20*math.log10(max(rms,1e-12)),'peakDbfs':20*math.log10(max(peak,1e-12))}
native=decode(source,24000);assert len(native)==19120320
rows=[]
for f in fit['rows']:
 q=next(q for q in manifest['entries'] if q['id']==f['id']);a=stats(native[q['sourceWindow']['startSample']:q['sourceWindow']['endSample']]);b=stats(decode(f['path'],48000));rows.append({'id':f['id'],'voiceCharacterId':f['characterId'],'originalSource':a,'candidateCast':b,'castGainDbToMatchOriginalRms':a['rmsDbfs']-b['rmsDbfs']})
result={'status':'local_level_measurements_only_no_gain_or_audio_change','rows':rows,'approvedNarratorGainDb':-5.5,'approvedScoreReference':'approved-score-reference.json','noNewModelOrProviderRequests':True,'limitation':'RMS comparison is engineering evidence, not perceived loudness or listening acceptance. Apply any final cast balance only with actual final mix/AV review; approved score level remains fixed.'}
(root/'cast-level-measurements.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({'takes':len(rows),'rmsCorrectionRangeDb':[round(min(r['castGainDbToMatchOriginalRms'] for r in rows),2),round(max(r['castGainDbToMatchOriginalRms'] for r in rows),2)],'audioChanged':False}))
