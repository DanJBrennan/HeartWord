# Deferred until SAME63997 returns. Composition evidence only, never footage acceptance.
from pathlib import Path
import json,sqlite3,subprocess,hashlib,datetime
r=Path('outputs/mark6-production');base=r/'native-generation/carry-draft257-540p-20261112';f=base/'actual-inspection';data=Path('C:/Users/danbr/HeartWordData');assets=data/'assets'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
n=read(r/'native-generation/execution.json');ret=read(base/'result.json');req=read(base/'request.json');assert len(n['entries'])==257 and all(x['status']=='returned_unreviewed' for x in n['entries']) and ret['result']['status']=='draft'
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True);db.execute('PRAGMA busy_timeout=5000');row=db.execute("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_draft'",(ret['result']['attemptId'],'603e079c-eeeb-492c-b15a-cfca23d41b0b')).fetchone();db.close();assert row and row[1]=='hold_for_review'
raw=assets/row[0];meta=read(str(raw)+'.json');assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe'])=='c6995750219971fc7f7fd0735ea35aa6cec48b9c852037e0312607f04a46a9c6' and not meta.get('sourceEndKeyframe')
v=next(x for x in json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(raw)]))['streams'] if x['codec_type']=='video');count=int(v['nb_read_frames']);assert count>=120 and v['r_frame_rate']=='24/1'
f.mkdir(exist_ok=True);ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
for first in range(0,count,32):
    last=min(first+31,count-1);ff(['-i',str(raw),'-vf',f"select='between(n,{first},{last})',scale=384:216,tile=4x8",'-frames:v','1',str(f/f'native-{first:03d}-{last:03d}.png')])
for i in sorted(set([0,30,60,90,count-1])):ff(['-i',str(raw),'-vf',f"select='eq(n,{i})'",'-frames:v','1',str(f/f'full-{i}.png')])
p=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),attemptId=ret['result']['attemptId'],asset=row[0],sha256=h(raw),actualDimensions=[v['width'],v['height']],nativeFrames=count,fps=24,durationSeconds=v['duration'],sourceKeyframe=meta['sourceKeyframe'],sourceKeyframeSha256=meta['sourceKeyframeSha256'],noEndGuide=True,compositionReviewOnly=True,draftIsNotDeliverable=True,newExternalAvCalls=0,sourceClearRemainsMs=760791)
(f/'technical-proof.json').write_text(json.dumps(p,indent=2)+'\n');print(json.dumps(p))
