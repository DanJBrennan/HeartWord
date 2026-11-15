"""Rebuild local score from retained cues at explicit native sample positions."""
import json,pathlib,subprocess,hashlib,wave,math,shutil
import numpy as np
root=pathlib.Path(__file__).resolve().parents[3];base=root/'outputs/mark6-preparation';previous=base/'production-proposal-v1';out=base/'music-preview-v2';out.mkdir(exist_ok=True)
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def ff(args):return subprocess.run(['ffmpeg','-v','error','-nostdin',*args],capture_output=True,check=True).stdout
def wav(path,data):
 with wave.open(str(path),'wb') as w:
  w.setnchannels(2);w.setsampwidth(2);w.setframerate(24000);w.writeframes(np.clip(np.rint(data*32768),-32768,32767).astype('<i2').tobytes())
packet=read(base/'source-packet-v3/source-packet.json');schedule=read(previous/'music-cues.json');source_sha=sha(packet['input']['audio']);assert source_sha==read(previous/'speaking-estimate.json')['sourceHashes']['audio']
raw=ff(['-i',packet['input']['audio'],'-f','s16le','-']);original=np.frombuffer(raw,dtype='<i2').reshape(-1,2).astype(np.float32)/32768
rate=24000;count=len(original);assert count==19120320
speech=original*np.float32(10**(-5.5/20));score=np.zeros_like(speech)
for c in schedule['cues']:
 assert sha(c['assetPath'])==c['assetSha256']
 duration=(c['sourceEndMs']-c['sourceStartMs'])/1000
 af=f'atrim=start={c["assetInMs"]/1000}:end={c["assetOutMs"]/1000},asetpts=PTS-STARTPTS,loudnorm=I=-23:TP=-7:LRA=7,aresample=24000'
 b=ff(['-i',c['assetPath'],'-af',af,'-ar','24000','-ac','2','-f','f32le','-']);x=np.frombuffer(b,dtype='<f4').reshape(-1,2).copy();wanted=round(duration*rate);assert abs(len(x)-wanted)<=1
 if len(x)<wanted:x=np.pad(x,((0,wanted-len(x)),(0,0)))
 x=x[:wanted];fadein=round(c['fadeInMs']*rate/1000);fadeout=round(c['fadeOutMs']*rate/1000);x[:fadein]*=np.linspace(0,1,fadein,dtype=np.float32)[:,None];x[-fadeout:]*=np.linspace(1,0,fadeout,dtype=np.float32)[:,None]
 start=c['sourceStartMs']*rate//1000;end=start+wanted;assert end<=count;score[start:end]+=x
 wav(out/(c['id']+'-normalized-faded.wav'),x)
 print(c['id'],'nativeFrames',len(x),'peak',round(float(np.max(np.abs(x))),4),flush=True)
# Sidechain gain envelope cannot suppress the score by more than 3dB.
# Ten-ms measurements; interpolated envelope has no source shift or lookahead.
block=240;blocks=math.ceil(count/block);pad=np.pad(speech,((0,blocks*block-count),(0,0)));levels=np.sqrt(np.mean(pad.reshape(blocks,block,2)**2,axis=(1,2)));target=-3*np.clip((levels-.008)/.020,0,1)
envelope=np.empty(blocks,dtype=np.float32);current=0.
for i,t in enumerate(target):
 coefficient=math.exp(-.01/(.04 if t<current else .35));current=coefficient*current+(1-coefficient)*float(t);envelope[i]=current
sample_gains=np.interp(np.arange(count,dtype=np.float64),np.arange(blocks,dtype=np.float64)*block+block/2,envelope).astype(np.float32);score*=np.power(10,sample_gains/20)[:,None]
mixed=speech+score;peak=float(np.max(np.abs(mixed)));master=min(1.,.94/peak);mixed*=master;speech*=master;score*=master
assert np.max(np.abs(mixed))<=.940001
wav(out/'narrator-reference.wav',speech);wav(out/'music-stem.wav',score);wav(out/'mark6-music-preview-v2.wav',mixed)
ff(['-i',str(out/'mark6-music-preview-v2.wav'),'-c:a','libmp3lame','-b:a','160k',str(out/'mark6-music-preview-v2.mp3')])
wav(out/'balance-sample-90s-to-150s.wav',mixed[90*rate:150*rate]);ff(['-i',str(out/'balance-sample-90s-to-150s.wav'),'-c:a','libmp3lame','-b:a','160k',str(out/'mark6-music-balance-60s-v2.mp3')])
with wave.open(str(out/'mark6-music-preview-v2.wav'),'rb') as w:
 assert w.getnframes()==count;actual=np.frombuffer(w.readframes(count),dtype='<i2').reshape(-1,2).astype(np.float32)/32768
residual=actual-speech;measurements=[]
for c in schedule['cues']:
 start=c['sourceStartMs']*24+3*rate;end=c['sourceEndMs']*24-3*rate
 m=residual[start:end];v=speech[start:end];music_rms=20*math.log10(float(np.sqrt(np.mean(m*m)))+1e-20);voice_rms=20*math.log10(float(np.sqrt(np.mean(v*v)))+1e-20)
 assert music_rms>-40,'Music lane absent or too quiet in rendered cue'
 assert float(np.corrcoef(m.ravel(),score[start:end].ravel())[0,1])>.9999
 measurements.append({'cue':c['id'],'musicRmsDbfs':round(music_rms,2),'speechRmsDbfs':round(voice_rms,2),'musicBelowSpeechDb':round(voice_rms-music_rms,2)})
for start,end in [(.5,4.5),(64,88),(145,160),(229,239),(402,441),(719,723),(794,796.4)]:
 a=round(start*rate);b=round(end*rate);assert float(np.corrcoef(actual[a:b,0],speech[a:b,0])[0,1])>.99999
assert len(ff(['-i',str(out/'mark6-music-preview-v2.mp3'),'-f','s16le','-']))==len(raw)
verification={'status':'passed_rendered_music_and_source_clock_checks_user_listening_pending','producerFeedback':'The music is inaudible. I only hear narrator.','previousPreview':'Retained; superseded. Residual analysis found effectively no score (-96 to -101 dBFS) in scheduled cue windows. Prior validation failed to test score presence.','causeEvidence':'Individual cue processing was nonzero; combined graph score-only output contained five seconds of zeros. This revision avoids the failing multi-input combination by placing separately rendered excerpts at explicit source sample indices.','sourceSha256':source_sha,'sourceUnchanged':sha(packet['input']['audio'])==source_sha,'sourceSampleCount':count,'previewSampleCount':len(actual),'sourceClockOffsetSamples':0,'speechGainDb':-5.5,'scoreLoudnessTargetLufs':-23,'maximumScoreDuckingDb':3,'masterGainDb':round(20*math.log10(master),6),'renderPeakLinear':float(np.max(np.abs(actual))),'cueMeasurementsFromFinalWavAfterSubtractingKnownNarration':measurements,'all13CuesNonzeroInFinalMix':True,'renderedScoreMatchesRetainedStem':True,'mp3DecodedSampleCountMatchesSource':True,'previewSha256':sha(out/'mark6-music-preview-v2.mp3'),'fullProductionHold':True,'newExternalCalls':0,'listeningVerdict':'Pending producer listening; energy checks do not establish creative fit or intelligibility.'}
write(out/'verification.json',verification);write(out/'music-cues.json',schedule)
stable=pathlib.Path('C:/Users/danbr/OneDrive/Documents/HeartWord Review Samples/Mark 6 preparation - 2026-11-01')
for name in ['mark6-music-preview-v2.mp3','mark6-music-balance-60s-v2.mp3']:
 target=stable/name;assert not target.exists();shutil.copy2(out/name,target);assert sha(target)==sha(out/name)
write(stable/'music-preview-v2-verification.json',verification)
note='''# Music preview v2

The first preview rendered effectively no score. It is retained but superseded. This corrected local mix places 13 separately rendered existing instrumental excerpts at exact source sample positions, keeps the original narration at -5.5 dB, and limits score ducking to 3 dB. Final WAV residual/stem checks confirm all 13 music cues are present. The 60-second balance sample is source 1:30–2:30; the full preview retains every native source sample position, title and quiet. Original sources and all approved takes are unchanged. These are original-narrator music previews, not final character voices or listening approval. Full production remains held. No paid call or new music generation.
'''
(out/'README.md').write_text(note,encoding='utf-8');(stable/'Music preview v2.txt').write_text(note,encoding='utf-8')
status=read(base/'continuation-status.json');status.update(status='music_preview_corrected_after_missing_score_feedback',musicPreview=str(stable/'mark6-music-preview-v2.mp3'),musicBalanceSample=str(stable/'mark6-music-balance-60s-v2.mp3'),musicPreviewVerification='music-preview-v2/verification.json');write(base/'continuation-status.json',status)
log='''### Latest: corrected missing score in Mark 6 listening preview

Dan reported “The music is inaudible. I only hear narrator.” Residual checks confirmed the first preview contained effectively no score, despite valid nonzero individual cue audio. The combined graph score lane rendered only five seconds of zeros; the precise FFmpeg multi-input failure was not established. The earlier verification checked source timing but omitted score presence, so its implied score delivery was invalid. Original v1 audio/report retained and superseded.

Corrected locally in outputs/mark6-preparation/music-preview-v2/ using independently rendered/hash-pinned existing cue excerpts placed at explicit native source samples, 1.5/2s fades and bounded maximum 3dB score ducking. Original narrator remains at -5.5dB; full source clock, chapter title and quiet are preserved. Final rendered WAV subtraction and retained-stem correlation now verify nonzero music in all 13 cue windows, alongside source sample counts, seven music-free timing checks, unclipped output and MP3 sample count. Includes a 60-second source 90–150s balance excerpt and full preview, hash-matched into the same OneDrive review folder with v2 filenames. No API, generation or new music cost.

Dedicated Goal Guardian pass: correct the promised audible-score preparation artifact using existing material; preserve source words/timing, exact accepted assets and producer review. No new narrative, product stage, app implementation, native/listening acceptance or production authority. Full production stays held; app source unchanged since r13 916/133. Actual music level/clarity still awaits producer listening.
'''
for path in [root/'docs/plans/CURRENT_GOAL.md',root/'docs/plans/MARK6_PREPARATION.md',base/'MARK6_PRODUCTION_READINESS.md']:
 if path.name=='CURRENT_GOAL.md':path.write_text(path.read_text(encoding='utf-8').replace('# Current Goal\n','# Current Goal\n\n'+log,1),encoding='utf-8')
 else:
  with path.open('a',encoding='utf-8') as f:f.write('\n\n'+log)
write(out/'goal-guardian-review.json',{'status':'passed','scope':'Restore audible score in local preview, no product/app changes.','sourceWordsAndClockPreserved':True,'noNewGenerationOrSpend':True,'noProductionAuthority':True,'earlierScoreValidationErrorRecorded':True,'userListeningPending':True})
print(json.dumps(verification,ensure_ascii=False))
