import pathlib,json,hashlib,subprocess,wave
import numpy as np
root=pathlib.Path('outputs/mark6-production');prep=pathlib.Path('outputs/mark6-preparation');read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
a=read(prep/'music-preview-v3/producer-level-approval.json');assert sha(pathlib.Path(a['referencePreview']))==a['referencePreviewSha256']
preview=prep/'music-preview-v3/mark6-music-preview-v3.wav';check=root/'approved-score-wav-encoding-check.mp3'
subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',str(preview),'-c:a','libmp3lame','-b:a','160k',str(check)],check=True,creationflags=subprocess.CREATE_NO_WINDOW)
assert sha(check)==a['referencePreviewSha256'],'Prepared WAV does not reproduce the exact approved MP3; no score derived.'
narrator=prep/'music-preview-v2/narrator-reference.wav';assert sha(narrator)==a['narratorReferenceSha256']
def load(p):
 with wave.open(str(p),'rb') as w:
  assert w.getframerate()==24000 and w.getnchannels()==2 and w.getsampwidth()==2 and w.getnframes()==19120320
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype(np.int32)
mix=load(preview);speech=load(narrator);score=mix-speech;assert np.max(np.abs(score))<32768 and np.array_equal(speech+score,mix)
out=pathlib.Path('C:/Users/danbr/HeartWordData/assets/generated/hatam/mark-6/approved-score-reference-v3.wav');assert not out.exists()
with wave.open(str(out),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(24000);w.writeframes(score.astype('<i2').tobytes())
v={'status':'exact_approved_score_stem_retained','path':str(out),'sha256':sha(out),'sampleRate':24000,'stereoFrames':19120320,'approvedPreviewSha256':a['referencePreviewSha256'],'wavReencodesToExactApprovedMp3':True,'narratorReferenceSha256':a['narratorReferenceSha256'],'integerRecombinationRecreatesEveryPreviewSample':True,'alreadyIncludesApprovedFadesAndDucking':True,'furtherGainDb':0,'noNewMusicOrProviderCalls':True}
(root/'approved-score-reference.json').write_text(json.dumps(v,indent=2),encoding='utf-8');print(json.dumps(v))
