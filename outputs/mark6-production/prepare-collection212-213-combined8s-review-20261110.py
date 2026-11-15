# Deferred until203 terminal and its actual120picture review derivatives exist.
# Review media only; never production selection or source timing authority.
from pathlib import Path
import json,subprocess,hashlib,datetime
r=Path('outputs/mark6-production');a=r/'collection212-prefix72-source-window-20261110';b=r/'complete-collection-continuation213-source-window-20261110';f=r/'complete-collection212-213-combined8s-source-window-20261110'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8'));h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
root=read(a/'root-joined-review.json');m=read(b/'review-preparation-proof.json');p=read(a/'review-preparation-proof.json');assert root['sourceClearThroughMs']==636613.875 and root['all72NormalDecodedPicturesIdenticalToReviewedPicture'] and root['av']['all10Clear'] and m['frames']==120 and m['sourceWindowMs']==[636613.875,641613.875] and m['exactApprovedMasterPcmVerified']
for x in [p,m]:assert h(x['selectedPicture'])==x['selectedPictureSha256'] and h(x['raw'])==x['rawSha256']
f.mkdir(exist_ok=True)
ff=lambda args:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+args)
probe=lambda path:json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(path)]))['streams']
frames=lambda path:[x.split(',')[-1].strip() for x in ff(['-i',str(path),'-map','0:v:0','-an','-f','framemd5','-']).decode().splitlines() if x and not x.startswith('#')]
pk=lambda path,k:json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams',k,'-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',str(path)]))['packets']
parts=f/'actual-selected-pictures.txt';parts.write_text("file '"+Path(p['selectedPicture']).as_posix()+"'\nfile '"+Path(m['selectedPicture']).as_posix()+"'\n",encoding='utf-8')
pic=f/'combined192-picture-review-only.mp4';ff(['-f','concat','-safe','0','-i',str(parts),'-map','0:v:0','-an','-c:v','copy',str(pic)])
expected=frames(p['selectedPicture'])+frames(m['selectedPicture']);actual=frames(pic);assert len(expected)==len(actual)==192 and actual==expected
v=probe(pic);assert len(v)==1 and v[0]['width']==1280 and v[0]['height']==720 and v[0]['r_frame_rate']=='24/1' and int(v[0]['nb_read_frames'])==192
master=Path(p['sourceMaster']);assert h(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
wav=f/'complete-approved-source8s.wav';ref=f/'complete-continuous-reference8s.m4a';whole=f/'complete-collection-approved-mix.mp4'
flt='atrim=start_sample=15206733:end_sample=15398733,asetpts=PTS-STARTPTS';ff(['-i',str(master),'-af',flt,'-c:a','pcm_s16le',str(wav)])
pcm=lambda path,filter=None:ff(['-i',str(path)]+(['-af',filter] if filter else [])+['-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-'])
audio=pcm(wav);assert len(audio)==192000*4 and audio==pcm(master,flt)
ff(['-i',str(wav),'-c:a','aac','-b:a','120k',str(ref)]);ff(['-i',str(pic),'-i',str(ref),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(whole)])
assert pk(whole,'v:0')==pk(pic,'v:0') and pk(whole,'a:0')==pk(ref,'a:0') and int(next(x for x in probe(whole) if x['codec_type']=='audio')['duration_ts'])==192000
for first,last in [(0,63),(64,127),(128,191)]:ff(['-i',str(whole),'-vf',f"select='between(n,{first},{last})',scale=256:144,tile=8x8",'-frames:v','1',str(f/f'combined-{first:03d}-{last:03d}.png')])
for n in [0,71,72,96,144,191]:ff(['-i',str(whole),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(f/f'combined-full-{n}.png')])
ff(['-i',str(whole),'-vf',"select='between(n,69,74)',scale=426:240,tile=3x2",'-frames:v','1',str(f/'actual-continuation-cut-edges.png')])
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Actual accepted212prefix72 plus UNAPPROVED213first120; combined8s review only','sourceWindowMs':[633613.875,641613.875],'sourceSampleRange24k':[15206733,15398733],'sourceSamples24k':192000,'frames':192,'fps':24,'internalCutFrame':72,'internalCutIsEditorialNotNativeWordtimeOrPause':True,'whole':str(whole.resolve()),'wholeSha256':h(whole),'selectedPicture':str(pic.resolve()),'selectedPictureSha256':h(pic),'all192DecodedPicturesMatchComponents':True,'videoPacketsIdenticalToSelectedPicture':True,'exactApprovedMasterPcmVerified':True,'aacPacketsIdenticalToContinuousReference':True,'prefixAttemptId':root['attemptId'],'prefixParentAttemptId':read(a/'selection-and-assembly.json')['parentAttemptId'],'continuationAttemptId':m['attemptId'],'continuationSelectedNativeRange':[0,120],'incoming':p['boundary'],'incomingSha256':p['boundarySha256'],'sourceMusicVoiceCanonUnchanged':True,'nativeAudioExcluded':True,'qualityApproved':False,'providerCalls':0,'databaseWrites':0,'wholeFilmReady':False}
assert h(proof['incoming'])==proof['incomingSha256'];(f/'review-preparation-proof.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8');print(json.dumps(proof))
