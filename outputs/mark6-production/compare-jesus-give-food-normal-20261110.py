# Diagnostic comparison of an intermediate assembly. Actual direct review still required.
from pathlib import Path
import json,subprocess,hashlib,re,datetime
r=Path('outputs/mark6-production');f=r/'complete-jesus-give-food-source-window-20261110';assets=Path('C:/Users/danbr/HeartWordData/assets')
j=json.loads((f/'selection-and-assembly.json').read_text(encoding='utf-8'));m=json.loads((f/'review-preparation-proof.json').read_text(encoding='utf-8'));out=assets/j['assembled']['assembledVideoPath'];candidate=Path(m['candidate']);h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert j['pictureFrames']==68 and j['sourceSamples48k']==135024 and h(out)==j['assembledSha256'] and h(candidate)==m['candidateSha256']
ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
frames=lambda p:[x.split(',')[-1].strip() for x in ff(['-i',str(p),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if x and not x.startswith('#')]
a,b=frames(out),frames(candidate);assert len(a)==len(b)==68
stats=f/'normal-frame-ssim.txt';assert not stats.exists();ff(['-i',str(out),'-i',str(candidate),'-filter_complex',f'[0:v:0][1:v:0]ssim=stats_file={stats.as_posix()}:shortest=1','-an','-f','null','-']);scores=[float(re.search(r'All:([0-9.]+)',x).group(1)) for x in stats.read_text().splitlines()];assert len(scores)==68
for n in [0,11,25,34,67]:ff(['-i',str(out),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(f/f'actual-normal-{n}.png')])
ff(['-i',str(out),'-vf','scale=256:144,tile=8x9','-frames:v','1',str(f/'actual-normal-all68.png')])
p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'frames':68,'assembledSha256':h(out),'candidateSha256':h(candidate),'allFramesDecodedRgbIdentical':a==b,'pairedFrameSsimMinimum':min(scores),'pairedFrameSsimMean':sum(scores)/len(scores),'all68PairsCompared':True,'historicalDiagnosticThreshold':0.99,'belowHistoricalDiagnosticThreshold':min(scores)<.99,'actualNormalPictureReviewPending':True,'finalEditorUsesOriginalCandidate':True,'providerCalls':0,'sourceAudioUnchanged':True}
(f/'normal-frame-correspondence-proof.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf-8');print(json.dumps(p))
