from pathlib import Path
import json,wave,hashlib,subprocess,datetime
import numpy as np
root=Path(__file__).resolve().parent
receipt=json.loads((root/'source-clock-mix-candidates.json').read_text())
score=json.loads((root/'approved-score-reference.json').read_text())
folder=root/'processed-score-full-source-rehearsal-20261107';folder.mkdir(exist_ok=True)
output=folder/'recombined-diagnostic.wav'
assert not output.exists(),'Retain prior diagnostic; do not overwrite.'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
for p,h in [(receipt['dialoguePath'],receipt['dialogueSha256']),(score['path'],score['sha256']),(receipt['mixPath'],receipt['mixSha256'])]:assert sha(p)==h
# Audio-only rehearsal of the tested processed-only finishing graph. This is
# not a fabricated picture cut or a registered chapter/finishing approval.
graph='[0:a]anull[speech];[1:a]volume=0dB,apad[processed];[speech][processed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true[sound]'
subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',receipt['dialoguePath'],'-i',score['path'],'-filter_complex',graph,'-map','[sound]','-c:a','pcm_s16le','-ar','24000',str(output)],check=True)
def samples(p):
 with wave.open(str(p),'rb') as w:
  assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(24000,2,2,19120320)
  b=w.readframes(w.getnframes())
 return np.frombuffer(b,dtype='<i2'),hashlib.sha256(b).hexdigest()
actual,actual_hash=samples(output);expected,expected_hash=samples(receipt['mixPath']);delta=actual.astype(np.int32)-expected.astype(np.int32)
maximum=int(np.max(np.abs(delta)));rms=float(np.sqrt(np.mean(delta.astype(np.float64)**2)))
assert maximum<=1,'Processing changed approved full-source audio beyond one PCM quantization unit.'
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Actual796.680-second AUDIO-ONLY processing rehearsal; not full picture/source-map render or completed film',dialoguePath=receipt['dialoguePath'],dialogueSha256=receipt['dialogueSha256'],scorePath=score['path'],scoreSha256=score['sha256'],approvedMixPath=receipt['mixPath'],approvedMixSha256=receipt['mixSha256'],output=str(output),outputSha256=sha(output),audioFilter=graph,sampleRate=24000,channels=2,stereoFrames=19120320,actualPcmSha256=actual_hash,approvedPcmSha256=expected_hash,pcmExactlyEqual=actual_hash==expected_hash,maximumPcmUnitDifference=maximum,rmsPcmUnitDifference=rms,relativeMusicGainDb=0,additionalDucking=False,normalization=False,sourceFilesUnchanged=all(sha(p)==h for p,h in [(receipt['dialoguePath'],receipt['dialogueSha256']),(score['path'],score['sha256']),(receipt['mixPath'],receipt['mixSha256'])]),providerCalls=0,databaseWrites=0,remaining='Actual normal editorial renderer dialogue must match approved e486 master before final finishing; do not assume raw source/cast mappings carry the approved narrator/cast level matching. Final full-cut audio/source/AV and independent real-film restored rerender remain required.')
(folder/'proof.json').write_text(json.dumps(proof,indent=2),encoding='utf8')
print(json.dumps(dict(pcmExactlyEqual=proof['pcmExactlyEqual'],maximumPcmUnitDifference=maximum,rmsPcmUnitDifference=rms,sourceFrames=19120320,providerCalls=0)))
