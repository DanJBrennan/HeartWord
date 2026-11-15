# Read-only technical extraction from actual native/carry/picture files, not creative media.
import pathlib,json,subprocess,hashlib,sys,datetime
base=pathlib.Path('outputs/mark6-production/speaking-execution/herod-vow-v1');root=pathlib.Path('C:/Users/danbr/HeartWordData/assets/generated/lip-sync/ltx-89e266ca-228b-47c7-aa8d-f08e5483d9be');line=json.loads((root/'line.json').read_text(encoding='utf8'));n=int(sys.argv[1]);s=line['sections'][n];folder=base/f'section-{n}-actual-inspection';folder.mkdir(exist_ok=True)
h=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
assert h(s['rawPath'])==s['rawSha256'];hasCarry='carryImagePath' in s
if hasCarry: assert h(s['carryImagePath'])==s['carryImageSha256']
else: assert n==len(line['sections'])-1
ff=lambda args:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+args)
probe=lambda p:json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(p)]))['streams']
streams=probe(s['picturePath']);v=next(x for x in streams if x['codec_type']=='video');assert int(v['nb_read_frames'])==s['retainedFrames'] and v['width']==1280 and v['height']==720 and v['r_frame_rate']=='24/1'
c=line['crop'];crop=f"crop={c['width']}:{c['height']}:{c['x']}:{c['y']}";last=s['lastRetainedFrameIndex'];native=ff(['-i',s['rawPath'],'-vf',f"select='eq(n,{last})',"+crop,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'])
carry=ff(['-i',s['carryImagePath'],'-vf',crop,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']) if hasCarry else None
if hasCarry: assert native==carry
for start,end in [(0,min(63,last))]+([(64,last)] if last>63 else []):ff(['-i',s['rawPath'],'-vf',f"select='between(n,{start},{end})',scale=240:132,tile=8x8",'-frames:v','1',str(folder/f'native-{start:03d}-{end:03d}.png')])
for i in [0,last//2,last]:ff(['-i',s['rawPath'],'-vf',f"select='eq(n,{i})'",'-frames:v','1',str(folder/f'native-{i}.png')])
ff(['-i',s['picturePath'],'-vf',f"select='eq(n,0)+eq(n,{last//2})+eq(n,{last})',scale=426:240,tile=3x1",'-frames:v','1',str(folder/'normal-poses.png')])
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sectionIndex':n,'frames':s['retainedFrames'],'actualLastNativeFrame':last,'rawPath':s['rawPath'],'rawSha256':s['rawSha256'],'picturePath':s['picturePath'],'pictureSha256':h(s['picturePath']),'carryImagePath':s.get('carryImagePath'),'carryImageSha256':s.get('carryImageSha256'),'nativeCarryCropRgbIdentical':True if hasCarry else None,'finalSectionHasNoContinuationCarry':not hasCarry,'rgbCropSha256':hashlib.sha256(native).hexdigest(),'actualRootPictureReviewPending':True,'providerCalls':0};(folder/'technical-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8');print(json.dumps(proof))
