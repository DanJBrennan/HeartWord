import json,pathlib,subprocess,re
root=pathlib.Path('outputs/mark6-production');prep=pathlib.Path('outputs/mark6-preparation');read=lambda p:json.loads(p.read_text(encoding='utf-8'))
fits=read(root/'fitted-cast-audio.json')['rows'];quotes=read(prep/'voice-queue-v1/manifest.json')['entries'];original=read(prep/'source-packet-v3/source-packet.json')['input']['audio']
def measure(path,filters=''):
 af=(filters+',' if filters else '')+'loudnorm=I=-16:TP=-4.5:LRA=7:print_format=json'
 r=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-i',str(path),'-af',af,'-f','null','-'],capture_output=True,text=True,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
 return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',r.stderr)[-1])
rows=[]
for f in fits:
 q=next(q for q in quotes if q['id']==f['id']);path=q.get('inputPath',original);filters='volume=-5.5dB'
 if 'inputPath' not in q:filters=f"atrim=start_sample={q['sourceWindow']['startSample']}:end_sample={q['sourceWindow']['endSample']},asetpts=PTS-STARTPTS,"+filters
 ref=measure(path,filters);cast=measure(f['path']);target=float(ref['input_i']);assert -40<target<-5
 rows.append({'id':f['id'],'originalNarratorReference':ref,'rawCastMeasurement':cast,'candidateTargetLufs':target,'candidateTruePeakCeilingDbfs':-4.5,'noProcessingApplied':True})
v={'status':'engineering_calibration_proposal_no_audio_changed','rows':rows,'preserveApprovedScore':'approved-score-reference.json','why':'Converted timbres have different loudness/crest factors. Calibrate speech to the approved narrator reference while keeping the approved score fixed; peak control must prevent clipping. Final perceived balance still requires actual mix/AV review.','newProviderCalls':0}
(root/'cast-loudness-calibration.json').write_text(json.dumps(v,indent=2),encoding='utf-8');print(json.dumps({'measuredTakes':len(rows),'targetLufsRange':[min(r['candidateTargetLufs'] for r in rows),max(r['candidateTargetLufs'] for r in rows)],'audioChanged':False,'newProviderCalls':0}))
