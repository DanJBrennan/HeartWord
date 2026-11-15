"""Inspect the actual complete encoded film, not a recipe or partial reel."""
from pathlib import Path
import argparse, datetime, hashlib, json, sqlite3, subprocess
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('--data-root',default='C:/Users/danbr/HeartWordData')
parser.add_argument('--restored-result')
args=parser.parse_args()
top = Path('outputs/mark6-production')
folder = Path(args.restored_result).parent if args.restored_result else top/'complete-film-20261112'
assets = Path(args.data_root)/'assets'
read = lambda p: json.loads(Path(p).read_text(encoding='utf8'))
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
if args.restored_result:
    restored=read(args.restored_result)
    base,final=dict(restored['picture']),dict(restored['result'])
    base['sha256']=sha(assets/base['path'])
    final['sha256']=restored['sha256']
else:
    base, final = read(folder/'picture-render-result.json'), read(folder/'finished-render-result.json')
assert not (folder/'actual-source-and-mix-qc.json').exists()
base_path, final_path = assets/base['path'], assets/final['path']
assert sha(base_path) == base['sha256'] and sha(final_path) == final['sha256']
probe = lambda p: json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(p)]))
details = probe(final_path)
video = next(s for s in details['streams'] if s['codec_type']=='video')
audio = next(s for s in details['streams'] if s['codec_type']=='audio')
assert int(video['nb_read_frames']) == 19612 and video['r_frame_rate']=='24/1'
assert (video['width'],video['height']) == (1280,720)
assert audio['sample_rate']=='48000' and audio['channels']==2
assert abs(float(details['format']['duration'])*1000-817180) <= 2
db = sqlite3.connect((Path(args.data_root)/'db/heartword.sqlite').resolve().as_uri()+'?mode=ro',uri=True)
rows = [db.execute('SELECT timeline_json,source_audio_json FROM chapter_render_manifests WHERE render_id=?',(r['renderId'],)).fetchone() for r in [base,final]]
assert rows[0] and rows[0] == rows[1]
timeline, mapping = map(json.loads, rows[1])
assert len(mapping)==49 and mapping[0]['startMs']==6500 and mapping[-1]['endMs']==803180
assert all(m['sourceStartMs']==m['startMs']-6500 and m['sourceEndMs']==m['endMs']-6500 for m in mapping)
assert all(a['sourceEndMs']==b['sourceStartMs'] for a,b in zip(mapping,mapping[1:]))
assert all(m['performance']['sha256']=='e48634f5f60d96ad2e5aa57e6d1b73edc29c378318c081b9787493c4879f0724' for m in mapping)
assert sum(m['sourceEndMs']-m['sourceStartMs'] for m in mapping)==796680
db.close()

def mono(path):
    raw=subprocess.check_output(['ffmpeg','-v','error','-nostdin','-i',str(path),'-map','0:a:0','-ar','24000','-ac','1','-f','f32le','-'])
    return np.frombuffer(raw,dtype='<f4')

dialogue=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-dialogue-candidate.wav'
scored=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav'
assert sha(dialogue)=='e48634f5f60d96ad2e5aa57e6d1b73edc29c378318c081b9787493c4879f0724'
assert sha(scored)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
d, expected = mono(dialogue), mono(scored)
base_pcm, final_pcm = mono(base_path), mono(final_path)
start, end = 6500*24, 803180*24
assert len(d)==len(expected)==19120320 and len(base_pcm)>=end and len(final_pcm)>=end
b,y=base_pcm[start:end],final_pcm[start:end]
dot=lambda a,b:float(np.dot(a.astype(np.float64),b.astype(np.float64)))
corr=lambda a,b:dot(a,b)/np.sqrt(dot(a,a)*dot(b,b))
dialogue_corr, mixed_corr = corr(b,d), corr(y,expected)
assert dialogue_corr>=.995 and mixed_corr>=.995, (dialogue_corr,mixed_corr)
music_effect=expected-d
dd,dm,mm=dot(d,d),dot(d,music_effect),dot(music_effect,music_effect)
voice_gain,music_gain=np.linalg.solve(np.array([[dd,dm],[dm,mm]]),np.array([dot(d,y),dot(music_effect,y)]))
assert abs(voice_gain-1)<=.01 and abs(music_gain-1)<=.05, (voice_gain,music_gain)
source_error=float(np.sqrt(np.mean((y.astype(np.float64)-expected)**2)))
assert source_error<=.008, source_error
lags=[]
for second in [30,120,240,360,480,600,720]:
    i=second*8000;reference=expected[::3][i:i+16000]
    values=final_pcm[start:end:3]
    if float(np.mean(reference**2))<1e-7:continue
    candidates=[(float(np.dot(reference,values[i+lag:i+lag+16000])),lag) for lag in range(-16,17)]
    lag=max(candidates)[1];lags.append(dict(sourceSecond=second,lagSamplesAt8k=lag));assert abs(lag)<=1,lags[-1]
title_corr=corr(b[567*24:3259*24],d[567*24:3259*24]);assert title_corr>=.99
quiet_rms={name:float(np.sqrt(np.mean(samples.astype(np.float64)**2))) for name,samples in [('opening',final_pcm[:start]),('credits',final_pcm[end:817180*24])]}
assert all(v<=.001 for v in quiet_rms.values()),quiet_rms
intervals=[]
for m in mapping:
    a,z=round(m['sourceStartMs']*24),round(m['sourceEndMs']*24)
    assert z>a
    reference,actual=d[a:z],b[a:z]
    energy=dot(reference,reference)
    intervals.append(dict(segmentId=m['segmentId'],sourceMs=[m['sourceStartMs'],m['sourceEndMs']],samples24k=z-a,voice=m['voice'],gain=dot(reference,actual)/energy if energy>1e-8 else None,rmse=float(np.sqrt(np.mean((reference.astype(np.float64)-actual)**2)))))
assert sum(x['samples24k'] for x in intervals)==19120320
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='actual_complete_encoded_film_source_and_approved_mix_technical_checks_pass',finalPath=str(final_path),finalSha256=final['sha256'],baseSha256=base['sha256'],sourceMs=796680,sourceStereoSamples24k=19120320,sourceIntervals=49,openingMs=6500,creditsMs=14000,totalDurationMs=817180,actualVideoFrames=19612,fps=24,dialogueCorrelation=dialogue_corr,approvedMixCorrelation=mixed_corr,estimatedVoiceGain=float(voice_gain),estimatedApprovedMusicEffectGain=float(music_gain),relativeMusicRecipeGainDb=0,additionalDucking=False,codecWaveformRmse=source_error,clockChecks=lags,spokenChapterTitlePreservedCorrelation=title_corr,editorialQuietRms=quiet_rms,intervals=intervals,sourceAndTimelineMapsUnchangedByFinishing=True,nativeLanguageAccuracyCertified=False,fullVisualAndAVReviewStillRequired=True,actualCompleteFilmPortableProofStillRequired=True,providerCalls=0,wholeFilmReady=False)
(folder/'actual-source-and-mix-qc.json').write_text(json.dumps(proof,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in proof.items() if k!='intervals'}))
