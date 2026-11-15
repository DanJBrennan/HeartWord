from pathlib import Path
import json,subprocess,hashlib,re,datetime
r=Path('outputs/mark6-production');f=r/'complete-peter-request-source-window-20261109';assets=Path('C:/Users/danbr/HeartWordData/assets')
j=json.loads((f/'selection-and-assembly.json').read_text(encoding='utf-8'));m=json.loads((f/'review-preparation-proof.json').read_text(encoding='utf-8'));out=assets/j['assembled']['assembledVideoPath'];candidate=Path(m['candidate']);h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert j['pictureFrames']==317 and j['sourceSamples48k']==632568 and h(out)==j['assembledSha256'] and h(candidate)==m['candidateSha256']
ff=lambda args:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+args)
hashes=lambda p:[x.split(',')[-1].strip() for x in ff(['-i',str(p),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if x and not x.startswith('#')]
a,b=hashes(out),hashes(candidate);assert len(a)==len(b)==317
stats=f/'normal-frame-ssim.txt';assert not stats.exists()
ff(['-i',str(out),'-i',str(candidate),'-filter_complex',f'[0:v:0][1:v:0]ssim=stats_file={stats.as_posix()}:shortest=1','-an','-f','null','-'])
lines=stats.read_text(encoding='utf-8').splitlines();scores=[float(re.search(r'All:([0-9.]+)',x).group(1)) for x in lines];assert len(scores)==317
for n in [0,158,316]:ff(['-i',str(out),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(f/f'actual-normal-{n}.png')])
ff(['-i',str(out),'-vf',"select='eq(n,0)+eq(n,63)+eq(n,64)+eq(n,126)+eq(n,127)+eq(n,189)+eq(n,190)+eq(n,236)+eq(n,316)',scale=426:240,tile=3x3",'-frames:v','1',str(f/'actual-normal-poses.png')])
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'frames':317,'assembledSha256':h(out),'candidateSha256':h(candidate),'allFramesDecodedRgbIdentical':a==b,'pairedFrameSsimMinimum':min(scores),'pairedFrameSsimMean':sum(scores)/len(scores),'all317PairsCompared':True,'actualNormalPictureReviewPending':True,'providerCalls':0,'sourceAudioUnchanged':True}
(f/'normal-frame-correspondence-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8');print(json.dumps(proof));assert min(scores)>=.99,'Actual normal images differ: inspect/hold before source acceptance'
