"""Assemble only returned test pictures over the exact approved-balance excerpt."""
import hashlib,json,pathlib,subprocess,wave
ops=pathlib.Path('outputs/mark6-production/representative-test-20261104');inp=json.loads((ops/'inputs.json').read_text());root=pathlib.Path(inp['root']);assets=pathlib.Path(inp['dataDir'])/'assets'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def ff(args):subprocess.run(['ffmpeg','-v','error','-nostdin','-n',*map(str,args)],check=True,capture_output=True)
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(p)]))
def read(name):return json.loads((ops/name).read_text())
herod,bridge,daughter=[read(x) for x in ['herod-v2-result.json','bridge-result-test-scope.json','daughter-v2-result.json']]
for r in [herod,bridge,daughter]:
 if r['status']!='hold_for_review' or r['cost']['usd']!=0 or r['provenance']['provider']!='ltx_local':raise RuntimeError('Local-only returned candidate required; no acceptance inferred')
timeline=[];pictures=[]
for name,result,frames in [('herod',herod,244),('bridge',bridge,155),('daughter',daughter,128)]:
 source=assets/result['media']['path'];v=next(s for s in probe(source)['streams'] if s['codec_type']=='video')
 if v['r_frame_rate']!='24/1' or int(v['nb_read_frames'])<frames:raise RuntimeError('Insufficient native picture coverage')
 dst=root/f'{name}-picture-v2.mkv';vf=f'trim=end_frame={frames},setpts=PTS-STARTPTS'
 if name=='bridge':
  c=inp['crop'];vf+=f",crop={c['width']}:{c['height']}:{c['x']}:{c['y']},scale=1280:720"
 if not dst.exists():ff(['-i',source,'-vf',vf,'-an','-c:v','ffv1','-pix_fmt','yuv420p',dst])
 if int(next(s for s in probe(dst)['streams'] if s['codec_type']=='video')['nb_read_frames'])!=frames:raise RuntimeError('Picture trim changed frame count')
 pictures.append(dst);timeline.append({'id':name,'source':str(source),'sourceSha256':sha(source),'picture':str(dst),'frames':frames,'fps':24})
audio=pathlib.Path(inp['mix']['path'])
if sha(audio)!=inp['mix']['sha256']:raise RuntimeError('Exact mix excerpt changed')
with wave.open(str(audio),'rb') as w:
 if w.getnframes()!=526668 or w.getframerate()!=24000:raise RuntimeError('Exact source-clock duration changed')
listing=root/'pictures-v2.ffconcat';listing.write_text(''.join("file '"+str(p).replace('\\','/')+"'\n" for p in pictures),encoding='utf-8')
output=root/'mark6-representative-review-v2.mp4'
if not output.exists():ff(['-f','concat','-safe','0','-i',listing,'-i',audio,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',output])
v=next(s for s in probe(output)['streams'] if s['codec_type']=='video')
if v['r_frame_rate']!='24/1' or int(v['nb_read_frames'])!=527:raise RuntimeError('Assembled picture coverage changed')
# Single full-line sounds and exact source-clock mix remain separate editable assets.
manifest={'status':'assembled_test_held_for_AV_review','testOnly':True,'path':str(output),'sha256':sha(output),'sourceClock':inp['sourceClock'],'durationSec':526668/24000,'pictureFrames':527,'fps':24,'timeline':timeline,'audio':inp['mix'],'dialogueStem':inp['dialogue'],'music':inp['scoreReference'],'gainDb':0,'newDucking':False,'sourceSpeed':1,'sourceWordsOrPausesChanged':False,'selectedAsFilmMedia':False,'boundaryLimits':'Herod picture ends at10.166667s vs speech10.1405s; daughter picture begins16.625s vs audio16.613s. Frame quantization only, continuous source-clock audio unchanged; both offsets <1frame. AV review must check actual joins.'}
(ops/'assembly.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');(root/'assembly.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
# Leads for review, not a claim that sampled stills establish lip-sync.
sheet=ops/'review-contact-sheet.jpg'
if not sheet.exists():ff(['-i',output,'-vf','fps=1,scale=320:180,tile=6x4','-frames:v','1',sheet])
print(json.dumps({'status':manifest['status'],'path':str(output),'durationSec':manifest['durationSec'],'pictureFrames':527}))
