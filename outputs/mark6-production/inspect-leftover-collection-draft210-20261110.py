# Deferred until SAME210 returns; actual media inspection, no provider/DB writes.
from pathlib import Path
import json,sqlite3,hashlib,subprocess,datetime
r=Path('outputs/mark6-production');f=r/'native-generation/leftover-collection-draft210-540p-20261110';data=Path('C:/Users/danbr/HeartWordData');assets=data/'assets'
ret=json.loads((f/'result.json').read_text(encoding='utf8'));n=json.loads((r/'native-generation/execution.json').read_text(encoding='utf8'))
assert len(n['entries'])==210 and all(x['status']=='returned_unreviewed' for x in n['entries']) and ret['result']['status']=='draft'
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True)
row=db.execute("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_draft'",(ret['result']['attemptId'],'ccd8cf71-cc05-4ffb-b544-456261b81774')).fetchone();db.close();assert row and row[1]=='hold_for_review'
src=assets/row[0];h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();req=json.loads((f/'request.json').read_text(encoding='utf8'));meta=json.loads(Path(str(src)+'.json').read_text(encoding='utf8'))
assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe'])=='2c94adc7b93b601a72ef1fe6ebdd8bec64e7dcf27255f66c16bc5edb7efe7924' and not meta.get('sourceEndKeyframe')
v=next(x for x in json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(src)]))['streams'] if x['codec_type']=='video');count=int(v['nb_read_frames']);assert v['r_frame_rate']=='24/1' and count>=120 and v['width']==1024 and v['height']==576
out=f/'actual-inspection';out.mkdir(exist_ok=True);ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
# Larger complete-frame boards retain all hands AND every resting food item.
for first in range(0,count,32):
 last=min(first+31,count-1)
 ff(['-i',str(src),'-vf',f"select='between(n,{first},{last})',scale=384:216,tile=4x8",'-frames:v','1',str(out/f'all-native-{first:03d}-{last:03d}.png')])
for i in sorted(set([0,30,60,90,count-1])):
 ff(['-i',str(src),'-vf',f"select='eq(n,{i})'",'-frames:v','1',str(out/f'actual-frame{i}.png')])
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),attemptId=ret['result']['attemptId'],asset=row[0],sha256=h(src),actualDimensions=[v['width'],v['height']],nativeFrames=count,fps=24,durationSeconds=v['duration'],sourceKeyframe=meta['sourceKeyframe'],sourceKeyframeSha256=req['frameSha256'],sourceBuiltinOriginalSha256='2c94adc7b93b601a72ef1fe6ebdd8bec64e7dcf27255f66c16bc5edb7efe7924',sourceCurrentImageProof='outputs/mark6-production/keyframes/scene4-leftover-collection-20261110-v1/builtin-return.json',noEndGuide=True,compositionReviewOnly=True,draftIsNotDeliverable=True,sourceClearRemainsMs=633613.875,newExternalAvCalls=0)
(out/'technical-proof.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
