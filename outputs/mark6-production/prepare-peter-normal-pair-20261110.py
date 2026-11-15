from pathlib import Path
import json, subprocess, hashlib, datetime
f=Path('outputs/mark6-production/complete-peter-request-source-window-20261109')
read=lambda n:json.loads((f/n).read_text(encoding='utf-8'))
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
s=read('selection-and-assembly.json');m=read('review-preparation-proof.json')
normal=Path('C:/Users/danbr/HeartWordData/assets')/s['assembled']['assembledVideoPath']
assert h(normal)==s['assembledSha256'] and h(m['whole'])==m['wholeSha256']
ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
out=(f/'actual-normal-approved-mix.mp4').resolve()
ff(['-i',str(normal),'-i',m['whole'],'-map','0:v:0','-map','1:a:0','-c','copy',str(out)])
packets=lambda p,st:ff(['-i',str(p),'-map',st,'-c','copy','-f','hash','-hash','sha256','-']).decode().strip()
assert packets(out,'0:v:0')==packets(normal,'0:v:0')
assert packets(out,'0:a:0')==packets(m['whole'],'0:a:0')
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(out)]))
v=next(x for x in probe['streams'] if x['codec_type']=='video')
assert int(v['nb_read_frames'])==317 and v['r_frame_rate']=='24/1'
for start,count in [(0,64),(64,64),(128,64),(192,64),(256,61)]:
 ff(['-i',str(normal),'-vf',f"select='between(n,{start},{start+count-1})',scale=256:144,tile=8x8",'-frames:v','1',str(f/f'normal-all-{start:03d}.png')])
ff(['-i',str(normal),'-vf',"select='eq(n,256)'",'-frames:v','1',str(f/'actual-normal-256.png')])
p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'path':str(out),'sha256':h(out),'normalSha256':h(normal),'baselinePath':m['whole'],'baselineSha256':m['wholeSha256'],'frames':317,'fps':24,'sourceSamples24k':316284,'sourceMs':[530993.5,544172],'videoPacketsEqualNormal':True,'audioPacketsEqualApprovedBaseline':True,'originalSsimThreshold':0.99,'originalMinimum':read('normal-frame-correspondence-proof.json')['pairedFrameSsimMinimum'],'originalThresholdWarningPreserved':True,'providerCalls':0}
(f/'normal-paired-preparation.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf-8')
print(json.dumps(p))
