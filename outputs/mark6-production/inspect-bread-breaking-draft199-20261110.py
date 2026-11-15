# Deferred until SAME199 returns; actual media inspection, no provider/DB writes.
from pathlib import Path
import json,sqlite3,hashlib,subprocess,datetime
r=Path('outputs/mark6-production');f=r/'native-generation/bread-breaking-draft-540p-20261110-v1';data=Path('C:/Users/danbr/HeartWordData');assets=data/'assets'
ret=json.loads((f/'result.json').read_text(encoding='utf8'));n=json.loads((r/'native-generation/execution.json').read_text(encoding='utf8'))
assert len(n['entries'])==199 and all(x['status']=='returned_unreviewed' for x in n['entries']) and ret['result']['status']=='draft'
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True)
row=db.execute("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_draft'",(ret['result']['attemptId'],'0403d670-6313-4dd4-87ea-b9fb644bdb67')).fetchone();db.close();assert row and row[1]=='hold_for_review'
src=assets/row[0];h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();req=json.loads((f/'request.json').read_text(encoding='utf8'));meta=json.loads(Path(str(src)+'.json').read_text(encoding='utf8'))
assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe'])=='6e3bb2aa6d4ec31403fccd89b2ed84ed705bfbc973eccecc7521ec35112f1913' and not meta.get('sourceEndKeyframe')
v=next(x for x in json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(src)]))['streams'] if x['codec_type']=='video');count=int(v['nb_read_frames']);assert v['r_frame_rate']=='24/1' and count>=120 and v['width']==1024 and v['height']==576
out=f/'actual-inspection';out.mkdir(exist_ok=True);ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
# Larger complete-frame boards retain all hands AND every resting food item.
for first in range(0,count,32):
 last=min(first+31,count-1)
 ff(['-i',str(src),'-vf',f"select='between(n,{first},{last})',scale=384:216,tile=4x8",'-frames:v','1',str(out/f'all-native-{first:03d}-{last:03d}.png')])
for i in sorted(set([0,30,60,90,count-1])):
 ff(['-i',str(src),'-vf',f"select='eq(n,{i})'",'-frames:v','1',str(out/f'actual-frame{i}.png')])
 ff(['-i',str(src),'-vf',f"select='eq(n,{i})',crop=1000:310:12:60",'-frames:v','1',str(out/f'actual-hands-loaf-{i}.png')])
proof=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),attemptId=ret['result']['attemptId'],asset=row[0],sha256=h(src),actualDimensions=[v['width'],v['height']],nativeFrames=count,fps=24,durationSeconds=v['duration'],sourceKeyframe=meta['sourceKeyframe'],sourceKeyframeSha256=req['frameSha256'],sourceBuiltinOriginalSha256='b895fca6267c89c74355ad348e048a1e52f17c5598ef6f61ea45d9ca74b549d6',sourceOneColumnNormalizationProof='outputs/mark6-production/keyframes/scene4-bread-breaking-20261110-v2-plain-cuffs/format-proof.json',noEndGuide=True,compositionReviewOnly=True,draftIsNotDeliverable=True,sourceClearRemainsMs=603613.875,newExternalAvCalls=0)
(out/'technical-proof.json').write_text(json.dumps(proof,indent=2),encoding='utf8');print(json.dumps(proof))
