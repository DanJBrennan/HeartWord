from pathlib import Path
import json,sqlite3,hashlib,subprocess,datetime
root=Path('outputs/mark6-production');f=root/'native-generation/late-approach-draft-540p-20261109-v1';r=json.loads((f/'result.json').read_text());j=json.loads((root/'native-generation/execution.json').read_text());assert len(j['entries'])==171 and all(x['status']=='returned_unreviewed' for x in j['entries'])
db=sqlite3.connect('file:C:/Users/danbr/HeartWordData/db/heartword.sqlite?mode=ro',uri=True);row=db.execute('SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation=?',(r['result']['attemptId'],'5f121d6d-0404-4768-975a-40c0c928c6e7','generate_draft')).fetchone();db.close();assert row
src=Path('C:/Users/danbr/HeartWordData/assets')/row[0];v=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(src)],encoding='utf8'))['streams'];v=next(x for x in v if x['codec_type']=='video');assert int(v['nb_read_frames'])==121 and v['r_frame_rate']=='24/1'
out=f/'actual-inspection';out.mkdir(exist_ok=True)
def render(name,vf):subprocess.run(['ffmpeg','-v','error','-nostdin','-n','-i',str(src),'-vf',vf,'-frames:v','1',str(out/name)],check=True)
render('all-native-000-063.png','select=between(n\\,0\\,63),scale=240:-1,tile=8x8')
render('all-native-064-120.png','select=between(n\\,64\\,120),scale=240:-1,tile=8x8')
render('composition-15-actual-samples.png','select=not(mod(n\\,8))*lt(n\\,120),scale=384:-1,tile=5x3')
for i in [0,60,119]:render(f'actual-frame{i}.png',f'select=eq(n\\,{i})')
p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attemptId':r['result']['attemptId'],'asset':row[0],'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'actualDimensions':[v['width'],v['height']],'nativeFrames':121,'fps':24,'durationSeconds':v['duration'],'compositionReviewOnly':True,'draftIsNotDeliverable':True,'newExternalAvCalls':0,'sourceClearRemainsMs':520100}
(out/'technical-proof.json').write_text(json.dumps(p,indent=2),encoding='utf8');print(json.dumps(p))
