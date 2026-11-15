# Local review encodings only. No API calls or DB writes; all originals retained.
from pathlib import Path
import json,subprocess,hashlib,re,datetime
from PIL import Image
r=Path('outputs/mark6-production');f=r/'complete-eating207-source-window-20261110'
n=json.loads((r/'native-generation/execution.json').read_text(encoding='utf8'));assert len(n['entries'])==207 and all(x['status']=='returned_unreviewed' for x in n['entries'])
m=json.loads((f/'review-preparation-proof.json').read_text(encoding='utf8'));assert m['frames']==240 and m['sourceWindowMs']==[615613.875,625613.875]
req=json.loads((r/'keyframes/scene4-eating-20261110-v1/request.json').read_text(encoding='utf8'));ret=json.loads((r/'keyframes/scene4-eating-20261110-v1/builtin-return.json').read_text(encoding='utf8'))
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(a):
 p=subprocess.run(a,capture_output=True,text=True)
 if p.returncode:raise RuntimeError('Local media operation failed: '+p.stderr[-1600:])
 return p.stdout
def probe(p,a):return json.loads(run(['ffprobe','-v','error',*a,'-of','json',str(p)]))
def ssim(a,b,out,rgb=False):
 filt=('[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]' if rgb else '')+'ssim=stats_file='+out.as_posix()
 run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(a),'-i',str(b),'-lavfi',filt,'-an','-f','null','-'])
 return [float(x) for x in re.findall(r'All:([0-9.]+)',out.read_text())]
o=Path(m['whole']);q=f/'complete-eating207-review-encoding-crf20.mp4';assert h(o)==m['wholeSha256'] and not q.exists()
run(['ffmpeg','-hide_banner','-loglevel','error','-n','-i',str(o),'-map','0:v','-map','0:a','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',str(q)])
a=probe(q,['-count_frames','-show_streams'])['streams'];v=next(x for x in a if x['codec_type']=='video');u=next(x for x in a if x['codec_type']=='audio');assert v['nb_read_frames']=='240' and (v['width'],v['height'],v['r_frame_rate'],v['duration'])==(1280,720,'24/1','10.000000');assert u['duration_ts']==240000 and u['time_base']=='1/24000'
a=['-select_streams','a','-show_packets','-show_entries','packet=pts,duration,data_hash','-show_data_hash','sha256'];assert probe(o,a)==probe(q,a)
a=['-select_streams','v','-show_frames','-show_entries','frame=best_effort_timestamp_time,pkt_duration_time']
def times(p):return [{k:x.get(k) for k in ['best_effort_timestamp_time','pkt_duration_time']} for x in probe(p,a)['frames']]
ta,tb=times(o),times(q);assert len(ta)==len(tb)==240 and ta==tb and all(x['best_effort_timestamp_time'] is not None for x in ta)
values=ssim(o,q,f/'review-encoding-frame-ssim-crf20.txt');assert len(values)==240
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'original':str(o.resolve()),'originalSha256':h(o),'proxy':str(q.resolve()),'proxySha256':h(q),'proxyBytes':q.stat().st_size,'frames':240,'width':1280,'height':720,'fps':24,'all240TimestampsIdentical':True,'aacPacketsIdentical':True,'audioSamples24k':240000,'ssimMin':min(values),'ssimMean':sum(values)/240,'decodedPicturesIdentical':False,'encoding':'libx264 medium CRF20 yuv420p; unchanged copied approved AAC','qualityThreshold':.98,'qualityPassed':min(values)>=.98,'providerCalls':0,'originalPreserved':True};(f/'technical-review-encoding-proof-crf20.json').write_text(json.dumps(proof,indent=2));assert proof['qualityPassed'],'Review encoding below retained quality threshold; hold before API'
run(['ffmpeg','-hide_banner','-loglevel','error','-n','-i',str(q),'-vf','select=eq(n\\,120)','-frames:v','1',str(f/'review-encoding-crf20-actual120.png')])
def jpeg(original,dest,stats):
 assert not dest.exists()
 with Image.open(original) as im:
  dims=im.size;im.convert('RGB').save(dest,format='JPEG',quality=100,subsampling=0,optimize=True)
 with Image.open(dest) as im:assert im.size==dims
 vals=ssim(original,dest,stats,True);assert len(vals)==1 and vals[0]>=.99,'Reference encoding quality holds before API'
 return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'original':str(original.resolve()),'originalSha256':h(original),'proxy':str(dest.resolve()),'proxySha256':h(dest),'proxyBytes':dest.stat().st_size,'width':dims[0],'height':dims[1],'rgbSsim':vals[0],'encoding':'JPEG quality100 subsampling0 optimize; same dimensions/no content editing; decoded RGB SSIM','providerCalls':0}
start=Path(ret['artifact']);assert h(start)==ret['artifactSha256']=='ed25d5ce779d1a86c66fbffaf241be107273ca3cebe778665cc6fb9ade2d0e78';sp=jpeg(start,f/'accepted153-start-review-only-quality100.jpg',f/'start153-quality100-rgb-ssim.txt');(f/'technical-start153-review-encoding-proof.json').write_text(json.dumps(sp,indent=2))
refs=[(i,Path(x)) for i,x in enumerate(req['referenced_image_paths']) if i!=1];base=q.stat().st_size+Path(m['boundary']).stat().st_size+sp['proxyBytes']+sum(p.stat().st_size for _,p in refs);rp=[]
if base>18*1024*1024:
 for i,p in refs:
  assert h(p)==req['generationInputs'][i]['sha256'];z=jpeg(p,f/f'current-reference-image{i+1}-review-only-quality100.jpg',f/f'current-reference-image{i+1}-quality100-rgb-ssim.txt');z['requestImageIndex']=i;rp.append(z)
 final=q.stat().st_size+Path(m['boundary']).stat().st_size+sp['proxyBytes']+sum(x['proxyBytes'] for x in rp)
else:final=base
packet={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalReferencePacketBytes':base,'reviewPacketBytes':final,'limitBytes':18*1024*1024,'usesTechnicalCanonEncodings':bool(rp),'references':rp,'allOriginalReferencesRetained':True,'allReferencesSameDimensions':True,'providerCalls':0,'readyForDirectProxyInspectionOnly':True,'notAvOrMotionApproval':True};(f/'technical-canon-reference-review-encodings-proof.json').write_text(json.dumps(packet,indent=2));assert final<=18*1024*1024,'Review packet still oversized; hold before API';print(json.dumps({'mainSsimMin':proof['ssimMin'],'mainSsimMean':proof['ssimMean'],'startRgbSsim':sp['rgbSsim'],'packetBytes':final,'canonTechnicalEncodings':len(rp),'actualDirectProxyReviewPending':True,'providerCalls':0}))
