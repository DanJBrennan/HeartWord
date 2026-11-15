from pathlib import Path
import json,sqlite3,hashlib,subprocess,datetime
r=Path('outputs/mark6-production');f=r/'native-generation/jesus-taking-food-draft-540p-20261110-v1';ret=json.loads((f/'result.json').read_text(encoding='utf-8'));n=json.loads((r/'native-generation/execution.json').read_text(encoding='utf-8'));assert len(n['entries'])==197 and all(x['status']=='returned_unreviewed' for x in n['entries']) and ret['result']['status']=='draft'
p=Path('C:/Users/danbr/HeartWordData/db/heartword.sqlite');db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True);row=db.execute("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_draft'",(ret['result']['attemptId'],'59ef4731-67e8-4cb5-a3bc-f83b562b92fe')).fetchone();db.close();assert row and row[1]=='hold_for_review'
assets=Path('C:/Users/danbr/HeartWordData/assets');src=assets/row[0];h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();req=json.loads((f/'request.json').read_text(encoding='utf-8'));meta=json.loads(Path(str(src)+'.json').read_text(encoding='utf-8'));assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe'])=='4d7caee2eaf89aa3baa26381df0eba54ee508bd486526c7adfb87a3f298175e6' and not meta.get('sourceEndKeyframe')
streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(src)]))['streams'];v=next(x for x in streams if x['codec_type']=='video');count=int(v['nb_read_frames']);assert v['r_frame_rate']=='24/1' and count>=120
out=f/'actual-inspection';out.mkdir(exist_ok=True);ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
for first,last in [(0,63),(64,count-1)]:ff(['-i',str(src),'-vf',f"select='between(n,{first},{last})',scale=256:-1,tile=8x8",'-frames:v','1',str(out/f'all-native-{first:03d}-{last:03d}.png')])
ff(['-i',str(src),'-vf',"select='not(mod(n,8))*lt(n,120)',scale=384:-1,tile=5x3",'-frames:v','1',str(out/'composition-15-actual-samples.png')])
for i in [0,60,count-1]:ff(['-i',str(src),'-vf',f"select='eq(n,{i})'",'-frames:v','1',str(out/f'actual-frame{i}.png')])
# Exact source crops for checking food count, cloth support and hands throughout.
# These are inspection derivatives only, not modified production imagery.
assert v['width']==1024 and v['height']==576
for first in range(0,count,32):
 last=min(first+31,count-1)
 ff(['-i',str(src),'-vf',f"select='between(n,{first},{last})',crop=660:296:180:280,scale=384:-1,tile=4x8",'-frames:v','1',str(out/f'food-hands-{first:03d}-{last:03d}.png')])
p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attemptId':ret['result']['attemptId'],'asset':row[0],'sha256':h(src),'actualDimensions':[v['width'],v['height']],'nativeFrames':count,'fps':24,'durationSeconds':v['duration'],'sourceKeyframe':meta['sourceKeyframe'],'sourceKeyframeSha256':req['frameSha256'],'noEndGuide':True,'compositionReviewOnly':True,'draftIsNotDeliverable':True,'newExternalAvCalls':0,'sourceClearRemainsMs':595613.875};(out/'technical-proof.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf-8');print(json.dumps(p))
