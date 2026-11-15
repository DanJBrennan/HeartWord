from pathlib import Path
import json,hashlib,wave,subprocess,datetime
import numpy as np
p=Path('outputs/mark6-production');read=lambda x:json.loads(Path(x).read_text(encoding='utf8'));h=lambda x:hashlib.sha256(Path(x).read_bytes()).hexdigest()
f=p/'performance-waveform-revalidation-20261112';f.mkdir(exist_ok=True);assert not (f/'proof.json').exists()
m=read(p/'source-clock-mix-candidates.json');approval=read('outputs/mark6-preparation/music-preview-v3/producer-level-approval.json');narrator=Path('outputs/mark6-preparation/music-preview-v2/narrator-reference.wav');score=read(p/'approved-score-reference.json');assert h(narrator)==approval['narratorReferenceSha256']==m['approvedNarratorReferenceSha256'];assert h(score['path'])==score['sha256']==m['approvedScoreSha256'];assert h(m['dialoguePath'])==m['dialogueSha256'] and h(m['mixPath'])==m['mixSha256']
def pcm(path):
 with wave.open(str(path),'rb') as w:
  assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(24000,2,2,19120320)
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).copy()
base=pcm(narrator);cursor=0;placements=0;projection=read(p/'source-projection.json')['rows'];by={x['sourceSegmentId']:x for x in m['actorPlacements']}
for a in projection:
 start=round(a['startMs']*24);end=round(a['endMs']*24);assert cursor==start and abs(start-a['startMs']*24)<1e-6 and abs(end-a['endMs']*24)<1e-6;cursor=end
 if not a['characterId']:continue
 q=by[a['id']];assert q['startSample']==start and q['endSample']==end and q['speed']==1 and h(q['candidatePath'])==q['candidateSha256'];b=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',q['candidatePath'],'-ar','24000','-ac','2','-f','s16le','-acodec','pcm_s16le','-']);samples=np.frombuffer(b,dtype='<i2').reshape(-1,2);assert len(samples)==end-start;base[start:end]=samples;placements+=1
assert cursor==19120320 and placements==18 and len(projection)==49;expected=pcm(m['dialoguePath']);assert np.array_equal(base,expected)
out=f/'same-approved-score-recombined.wav';assert not out.exists();flt='[0:a]anull[speech];[1:a]volume=0dB,apad[processed];[speech][processed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true[sound]'
subprocess.check_call(['ffmpeg','-v','error','-nostdin','-n','-i',m['dialoguePath'],'-i',score['path'],'-filter_complex',flt,'-map','[sound]','-ar','24000','-ac','2','-c:a','pcm_s16le',str(out)])
actual=pcm(out);approved=pcm(m['mixPath']);assert np.array_equal(actual,approved)
r=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Fresh sample-for-sample reconstruction from same approved narrator and all18 exact actor candidates; same separate approvedscore recombined at0relativegain/limiter/no extra duck',sourceIntervals=49,sourceSamples24k=19120320,actorPlacements=18,narratorReferenceSha256=h(narrator),masterSha256=m['dialogueSha256'],approvedMixSha256=m['mixSha256'],scoreSha256=score['sha256'],dialoguePcmExactlyEqual=True,approvedScorePcmExactlyEqual=True,approvedPcmSha256=hashlib.sha256(approved.tobytes()).hexdigest(),maximumPcmUnitDifference=0,relativeMusicGainDb=0,additionalDucking=False,providerCalls=0,databaseWrites=0,wholeFilmReady=False)
(f/'proof.json').write_text(json.dumps(r,indent=2),encoding='utf8');print(json.dumps(r))
