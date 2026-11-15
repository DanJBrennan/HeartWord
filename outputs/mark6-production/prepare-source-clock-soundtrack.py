"""Build a review-mix candidate on the complete native source clock.

This does not accept media, alter cast mappings, or bypass assembly/review gates.
"""
import hashlib,json,pathlib,subprocess,wave
import numpy as np
root=pathlib.Path('outputs/mark6-production');read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
data=pathlib.Path('C:/Users/danbr/HeartWordData/assets')
out=data/'generated/hatam/mark-6/source-clock-mix-candidates-20261102';out.mkdir(parents=True,exist_ok=True)
receipt=root/'source-clock-mix-candidates.json';assert not receipt.exists()
def ff(args):return subprocess.run(['ffmpeg','-v','error','-nostdin',*args],check=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
def wav(path):
 with wave.open(str(path),'rb') as w:
  assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(24000,2,2,19120320)
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).copy()
def write(path,array):
 assert not path.exists()
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(24000);w.writeframes(array.astype('<i2').tobytes())
approval=read(pathlib.Path('outputs/mark6-preparation/music-preview-v3/producer-level-approval.json'))
narrator=pathlib.Path('outputs/mark6-preparation/music-preview-v2/narrator-reference.wav')
assert sha(narrator)==approval['narratorReferenceSha256']
score=read(root/'approved-score-reference.json');assert sha(score['path'])==score['sha256']
base=wav(narrator);bed=wav(score['path'])
projection=read(root/'source-projection.json')['rows'];cast=read(root/'cast-master-import.json')['rows']
candidates=read(root/'level-matched-cast-candidates.json')['rows'];byid={r['id']:r for r in candidates}
original=base.copy();actorMask=np.zeros(len(base),dtype=np.bool_);placements=[];cursor=0
for source in projection:
 start=round(source['startMs']*24);end=round(source['endMs']*24)
 assert abs(start-source['startMs']*24)<1e-6 and abs(end-source['endMs']*24)<1e-6 and start==cursor;cursor=end
 if not source['characterId']:continue
 mapped=next(c for c in cast if c['originalSegmentId']==source['id'])
 q=pathlib.PureWindowsPath(mapped['sourcePath']).stem;candidate=byid[q]
 assert sha(candidate['path'])==candidate['sha256']
 pcm=ff(['-i',candidate['path'],'-ar','24000','-ac','2','-f','s16le','-acodec','pcm_s16le','-']).stdout
 samples=np.frombuffer(pcm,dtype='<i2').reshape(-1,2)
 assert len(samples)==end-start==candidate['sampleCount']//2
 base[start:end]=samples;actorMask[start:end]=True
 placements.append({'id':q,'sourceSegmentId':source['id'],'startSample':start,'endSample':end,'candidatePath':candidate['path'],'candidateSha256':candidate['sha256'],'sourceMs':[source['startMs'],source['endMs']],'speed':1})
assert cursor==19120320 and len(placements)==18
assert np.array_equal(base[~actorMask],original[~actorMask]),'Narrator/title samples changed'
basePath=out/'complete-source-clock-dialogue-candidate.wav';write(basePath,base)
mixed=base.astype(np.int32)+bed.astype(np.int32);peak=float(np.max(np.abs(mixed)))/32768
mixPath=out/'complete-source-clock-score-mix-candidate.wav';limiter=None
if peak<=.98:write(mixPath,mixed)
else:
 limiter='alimiter=limit=0.98:level=false:latency=true'
 raw=out/'mix-before-peak-protection.f32le';assert not raw.exists();raw.write_bytes((mixed.astype(np.float32)/32768).astype('<f4').tobytes())
 ff(['-n','-f','f32le','-ar','24000','-ac','2','-i',str(raw),'-af',limiter,'-c:a','pcm_s16le',str(mixPath)])
 rendered=wav(mixPath);assert len(rendered)==19120320
value={'status':'complete_source_clock_audio_candidate_AV_and_final_cut_pending','nativeStereoFrames':19120320,'sampleRate':24000,'durationSec':796.680,'actorPlacements':placements,'narratorIntervals':31,'narratorTitleAndAllNonActorSamplesExactToApprovedReference':True,'originalSourceUnchanged':True,'approvedNarratorReferenceSha256':sha(narrator),'approvedScoreSha256':score['sha256'],'scoreFurtherGainDb':0,'additionalDuckingDb':0,'dialoguePath':str(basePath),'dialogueSha256':sha(basePath),'mixPath':str(mixPath),'mixSha256':sha(mixPath),'preProtectionPeakLinear':peak,'peakProtectionFilter':limiter,'sourceClockSpeed':1,'liveMappingsChanged':False,'newProviderCalls':0,'limitations':'Engineering candidate, not accepted film soundtrack. Opening/closing/ambience and actual whole-cut AV review remain. LUFS matching is not native-language review.'}
receipt.write_text(json.dumps(value,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in value.items() if k!='actorPlacements'}))
