# Deferred until actual235 selected120 NORMAL assembled. No provider or DB writes.
from pathlib import Path
import json,subprocess,hashlib,datetime
r=Path('outputs/mark6-production');f=r/'complete-terror238-source-window-20261111';assets=Path('C:/Users/danbr/HeartWordData/assets')
j=json.loads((f/'selection-and-assembly.json').read_text(encoding='utf-8'));m=json.loads((f/'review-preparation-proof.json').read_text(encoding='utf-8'));out=assets/j['assembled']['assembledVideoPath'];h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert h(out)==j['assembledSha256'] and h(m['selectedPicture'])==m['selectedPictureSha256'] and j['sourceSamples24k']==120000
ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
frames=lambda p:[x.split(',')[-1].strip() for x in ff(['-i',str(p),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if x and not x.startswith('#')]
a,b=frames(out),frames(m['selectedPicture']);assert len(a)==len(b)==120
streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))['streams'];assert len(streams)==1 and streams[0]['codec_type']=='video' and streams[0]['width']==1280 and streams[0]['height']==720 and streams[0]['r_frame_rate']=='24/1'
for n in [0,60,119]:ff(['-i',str(out),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(f/f'actual-normal-{n}.png')])
for first,last in [(0,31),(32,63),(64,95),(96,119)]:ff(['-i',str(out),'-vf',f"select='between(n,{first},{last})',scale=384:216,tile=4x8",'-frames:v','1',str(f/f'actual-normal-{first:03d}-{last:03d}.png')])
p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'frames':120,'assembledSha256':h(out),'selectedPictureSha256':h(m['selectedPicture']),'all120DecodedPicturesIdenticalToReviewedPicture':a==b,'decodedFrameHashesSha256':hashlib.sha256(json.dumps(a).encode()).hexdigest(),'actualNormalDirectReviewPending':True,'providerCalls':0}
(f/'normal-frame-correspondence-proof.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf-8');print(json.dumps(p));assert a==b,'Actual normal output differs; hold and inspect before root source acceptance'

