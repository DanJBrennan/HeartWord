from pathlib import Path
import json,subprocess,hashlib,datetime
r=Path('outputs/mark6-production');f=r/'complete-waterwalk234-wide-detail-source-window-20261111';assets=Path('C:/Users/danbr/HeartWordData/assets');j=json.loads((f/'selection-and-assembly.json').read_text(encoding='utf8'));h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
frames=lambda p:[x.split(',')[-1].strip() for x in ff(['-i',str(p),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if x and not x.startswith('#')]
assert j['frames']==192 and j['sourceSamples24k']==192000 and [x['name'] for x in j['components']]==['wide','detail']
ordered=[];proofs=[];paths=[]
for c in j['components']:
 out=assets/c['assembled']['assembledVideoPath'];expected=Path(c['reviewedPicture']);assert h(out)==c['assembledSha256'] and h(expected)==c['reviewedPictureSha256']
 actual=frames(out);reference=frames(expected);assert len(actual)==96 and actual==reference
 streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))['streams'];assert len(streams)==1 and streams[0]['r_frame_rate']=='24/1' and streams[0]['width']==1280 and streams[0]['height']==720
 for first,last in [(0,63),(64,95)]:ff(['-i',str(out),'-vf',f"select='between(n,{first},{last})',scale=256:144,tile=8x8",'-frames:v','1',str(f/f"actual-{c['name']}-normal-{first:03d}-{last:03d}.png")])
 for n in [0,48,95]:ff(['-i',str(out),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(f/f"actual-{c['name']}-normal-full-{n}.png")])
 ordered+=actual;paths.append(out);proofs.append(dict(name=c['name'],attemptId=c['attemptId'],editorClipId=c['editorClipId'],frames=96,assembledSha256=h(out),all96DecodedPicturesIdenticalToReviewedComponent=True,decodedHashesSha256=hashlib.sha256(json.dumps(actual).encode()).hexdigest()))
listing=f/'actual-normal-concat.txt';listing.write_text(''.join("file '"+str(x.resolve()).replace('\\','/')+"'\n" for x in paths),encoding='utf8');joined=f/'actual-two-normal-components-joined192.mp4';ff(['-f','concat','-safe','0','-i',str(listing),'-c','copy',str(joined)]);assert frames(joined)==ordered and len(ordered)==192
ff(['-i',str(joined),'-vf',"select='between(n,93,98)',scale=426:240,tile=3x2",'-frames:v','1',str(f/'actual-normal-internal-cut-edges.png')])
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),frames=192,components=proofs,all192DecodedPicturesIdenticalToReviewedOrderedComponents=True,actualJoinedNormal=str(joined.resolve()),actualJoinedNormalSha256=h(joined),actualNormalDirectReviewPending=True,providerCalls=0,databaseWrites=0)
(f/'normal-frame-correspondence-proof.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
