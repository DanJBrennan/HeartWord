# Deferred until SAME native201 is terminal. Exact8s editorialwindow insideuncertainnarratorparent; no provider calls or DB writes.
from pathlib import Path
import sqlite3,json,subprocess,hashlib,datetime
r=Path('outputs/mark6-production');data=Path('C:/Users/danbr/HeartWordData');assets=data/'assets';base=r/'native-motion/bread-breaking-20261110-v2-continuous-half';folder=r/'complete-bread-breaking-source-window-20261110-v2'
j=json.loads((r/'native-generation/execution.json').read_text(encoding='utf-8'));assert len(j['entries'])==201 and all(e['status']=='returned_unreviewed' for e in j['entries'])
result=json.loads((base/'result.json').read_text(encoding='utf-8'));assert result['result']['status']=='candidate';aid=result['result']['attemptId']
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
row=dict(db.execute("select id,shot_id,result_asset_path,status from generation_attempts where id=? and operation='generate_final_video'",(aid,)).fetchone());db.close()
assert row['shot_id']=='0403d670-6313-4dd4-87ea-b9fb644bdb67' and row['status']=='hold_for_review'
raw=assets/row['result_asset_path'];h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();meta=json.loads(Path(str(raw)+'.json').read_text(encoding='utf-8'));req=json.loads((base/'request.json').read_text(encoding='utf-8'))
assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe']) and req['frame']['id']=='6e3f97c5-36c4-4da3-af12-4e28a9e6178b'
guide=req.get('endingGuidance');design=req['designEndingReferenceOnly'];assert guide is None and not meta.get('sourceEndKeyframe') and not meta.get('sourceEndKeyframeSha256') and design['notSubmittedAsNativeEnd'] and design['sha256']=='a0b04b55f0a9fe396b4f36ec48a0031507ad64b0249a05aabb5862dd04a932bc' and h(assets/design['path'])==design['sha256']


folder.mkdir(exist_ok=True)
ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
probe=lambda p:json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(p)]))['streams']
pk=lambda p,k:json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams',k,'-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',str(p)]))['packets']
v=next(s for s in probe(raw) if s['codec_type']=='video');assert v['r_frame_rate']=='24/1' and int(v['nb_read_frames'])>=192
pic=folder/'selected192-picture-review-only.mp4'
ff(['-i',str(raw),'-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24','-frames:v','192','-an','-c:v','libx264','-preset','medium','-crf','18',str(pic)])
ps=probe(pic);assert len(ps)==1 and int(ps[0]['nb_read_frames'])==192 and ps[0]['width']==1280 and ps[0]['height']==720
master=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav';assert h(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
start,end=14486733,14678733;assert end-start==192000 and start/24==603613.875 and end/24==611613.875
wav=folder/'bread-breaking-approved-source.wav';ref=folder/'bread-breaking-continuous-reference.m4a';whole=folder/'complete-bread-breaking-approved-mix.mp4'
pcm=lambda p,flt=None:ff(['-i',str(p)]+(['-af',flt] if flt else [])+['-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-'])
flt=f'atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS';ff(['-i',str(master),'-af',flt,'-c:a','pcm_s16le',str(wav)])
source=pcm(wav);assert len(source)==192000*4 and source==pcm(master,flt)
ff(['-i',str(wav),'-c:a','aac','-b:a','120k',str(ref)]);ff(['-i',str(pic),'-i',str(ref),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(whole)])
ws=probe(whole);assert len(ws)==2 and int(next(s for s in ws if s['codec_type']=='audio')['duration_ts'])==192000 and pk(whole,'v:0')==pk(pic,'v:0') and pk(whole,'a:0')==pk(ref,'a:0')
prior=json.loads((r/'complete-jesus-taking-source-window-20261110/selection-and-assembly.json').read_text(encoding='utf-8'));prior_path=assets/prior['assembled']['assembledVideoPath'];assert h(prior_path)==prior['assembledSha256']
cw=folder/'seating-to-bread-breaking-approved-source.wav';cr=folder/'seating-to-bread-breaking-continuous-reference.m4a';cut=folder/'taking-to-bread-breaking-actual-join.mp4'
bf='atrim=start_sample=14450733:end_sample=14522733,asetpts=PTS-STARTPTS';ff(['-i',str(master),'-af',bf,'-c:a','pcm_s16le',str(cw)]);assert len(pcm(cw))==72000*4 and pcm(cw)==pcm(master,bf)
ff(['-i',str(cw),'-c:a','aac','-b:a','120k',str(cr)])
ff(['-i',str(prior_path),'-i',str(pic),'-i',str(cr),'-filter_complex','[0:v]trim=start_frame=156:end_frame=192,setpts=N/(24*TB)[a];[1:v]trim=end_frame=36,setpts=N/(24*TB)[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',str(cut)])
cs=probe(cut);assert int(next(s for s in cs if s['codec_type']=='video')['nb_read_frames'])==72 and int(next(s for s in cs if s['codec_type']=='audio')['duration_ts'])==72000 and pk(cut,'a:0')==pk(cr,'a:0')

for first,last in [(0,63),(64,127),(128,191)]:ff(['-i',str(raw),'-vf',f"select='between(n,{first},{last})',scale=256:144,tile=8x8",'-frames:v','1',str(folder/f'native-{first:03d}-{last:03d}.png')])
for n in [0,48,96,144,191]:
 ff(['-i',str(raw),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(folder/f'native-{n}.png')])
 ff(['-i',str(pic),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(folder/f'actual-normalized-{n}.png')])
ff(['-i',str(cut),'-vf',"select='between(n,33,38)',scale=426:240,tile=3x2",'-frames:v','1',str(folder/'incoming-cut-edges.png')])

# Hand/bread-transfer crops only; lower resting food remains in complete frame contacts/full samples above.
assert v['width']==1280 and v['height'] in (704,720) # Native LTX rounds height to model lattice; normalized review is1280x720 above.
for first in range(0,192,32):
 last=min(first+31,191)
 ff(['-i',str(raw),'-vf',f"select='between(n,{first},{last})',crop=1240:420:20:40,scale=500:-1,tile=4x8",'-frames:v','1',str(folder/f'hands-loaf-{first:03d}-{last:03d}.png')])

p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attemptId':aid,'sourceWindowMs':[603613.875,611613.875],'sourceSampleRange24k':[start,end],'sourceSamples24k':192000,'sourceMaster':str(master),'sourceMasterSha256':h(master),'pcmSha256':hashlib.sha256(source).hexdigest(),'raw':str(raw),'rawSha256':h(raw),'rawFrames':int(v['nb_read_frames']),'reviewedSelectedNativeRange':[0,192],'unselectedNativeRange':[192,int(v['nb_read_frames'])],'selectedPicture':str(pic.resolve()),'selectedPictureSha256':h(pic),'frames':192,'fps':24,'whole':str(whole.resolve()),'wholeSha256':h(whole),'exactApprovedMasterPcmVerified':True,'aacPacketsIdenticalToContinuousReference':True,'videoPacketsIdenticalToSelectedPicture':True,'boundary':str(cut.resolve()),'boundarySha256':h(cut),'boundarySourceMs':[602113.875,605113.875],'boundaryFrames':72,'boundarySamples24k':72000,'boundaryLocalCutFrame':36,'priorInputFrameRange':[156,192],'priorPictureGridDifferenceMs':0,'boundaryAacPacketsIdenticalToContinuousReference':True,'pictureMinusAudioMs':192/24*1000-8000,'nativeAudioExcluded':True,'noSourcePauseRetimeOrGainChange':True,'endingGuidance':guide,'prospectiveEndGuideOnlyNotActualEnding':False,'designEndingReferenceOnly':design,'noConditionedEndGuide':True,'acceptedNormalizedSTART146AndProspectiveEND147Only':True,'sourceParentMs':[579613.875,650729],'sourceParentConfidence':70,'internalEditorialWindowNotNativePhraseTiming':True,'qualityApproved':False,'sourceOriginalBuiltin146Preserved':True,'sourceOneColumnNormalizationProof':'outputs/mark6-production/keyframes/scene4-bread-breaking-20261110-v2-plain-cuffs/format-proof.json','providerCalls':0,'databaseWrites':0,'wholeFilmReady':False}
(folder/'review-preparation-proof.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf-8');print(json.dumps({'attemptId':aid,'frames':192,'samples24k':192000,'wholeSha256':h(whole),'approved':False}))
