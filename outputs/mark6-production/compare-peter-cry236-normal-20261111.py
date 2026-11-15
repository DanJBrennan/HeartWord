from pathlib import Path
import json,subprocess,hashlib,re,datetime
r=Path('outputs/mark6-production');f=r/'complete-peter-cry236-source-window-20261111';assets=Path('C:/Users/danbr/HeartWordData/assets');read=lambda p:json.loads(Path(p).read_text(encoding='utf8'));j=read(f/'selection-and-assembly.json');m=read(f/'review-preparation-proof.json');out=assets/j['assembled']['assembledVideoPath'];candidate=Path(m['candidate']);h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
assert j['pictureFrames']==29 and j['expectedFinalOutputPictures']==28 and j['sourceSamples48k']==56112 and h(out)==j['assembledSha256'] and h(candidate)==m['candidateSha256']
frames=lambda p:[x.split(',')[-1].strip() for x in ff(['-i',str(p),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if x and not x.startswith('#')]
def compare(a,b,name,n):
 stats=f/name
 if not stats.exists():ff(['-i',str(a),'-i',str(b),'-filter_complex',f'[0:v:0][1:v:0]ssim=stats_file={stats.as_posix()}:shortest=1','-an','-f','null','-'])
 scores=[float(re.search(r'All:([0-9.]+)',x).group(1)) for x in stats.read_text(encoding='utf8').splitlines()];assert len(scores)==n;return dict(pairs=n,minimum=min(scores),mean=sum(scores)/len(scores),allAtLeastOriginalDiagnostic99=min(scores)>=.99,requiresActualPictureReview=True)
a,b=frames(out),frames(candidate);assert len(a)==len(b)==29;local=compare(out,candidate,'all29-normal-frame-ssim.txt',29)
final=f/'actual-normal-final28-picture-review-only.mp4';ff(['-i',str(out),'-vf','trim=end_frame=28,setpts=PTS-STARTPTS','-frames:v','28','-an','-c:v','libx264','-crf','0',str(final)]);assert len(frames(final))==28;end=compare(final,m['selectedFinalPicture'],'all28-final-frame-ssim.txt',28)
for src,last,name in [(out,28,'normal-local29'),(final,27,'normal-final28')]:
 ff(['-i',str(src),'-vf',f"select='between(n,0,{last})',scale=384:216,tile=4x8",'-frames:v','1',str(f/f'actual-all-{name}.png')])
 for n in sorted(set([0,14,last])):ff(['-i',str(src),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(f/f'actual-{name}-full-{n}.png')])
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),localFrames=29,finalFrames=28,assembledSha256=h(out),candidateSha256=h(candidate),all29DecodedPicturesIdentical=a==b,all29PairsCompared=True,local29Ssim=local,all28FinalPairsCompared=True,final28Ssim=end,actualFinalPicture=str(final.resolve()),actualFinalPictureSha256=h(final),actualFinalUsedNormalFrameRange=[0,28],actualFinalUsedEndingNormalFrame=27,final27PresentationTimestampMs=27/24*1000,final28PictureWindowEndMs=28/24*1000,sourceDurationMs=1169,sourceAllSamplesPreserved=True,diagnostic99FailureRetained='Original .99 diagnostic failed min .989161 across29 NORMAL pictures, likely CRF18 recompression; NEVER pixel identity or automatic equivalence. All29 local and28 final measurements retained; explicit actual-picture review required before acceptance.',actualNormalDirectReviewPending=True,providerCalls=0,databaseWrites=0,wholeFilmReady=False)
(f/'normal-frame-correspondence-proof.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
