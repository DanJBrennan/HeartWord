# Deferred until SAME223 terminal; exact original163/240actualpictures/source/incoming only.
from pathlib import Path
import sqlite3,json,subprocess,hashlib,datetime
r=Path('outputs/mark6-production');data=Path('C:/Users/danbr/HeartWordData');assets=data/'assets';base=r/'native-motion/prayer-final223-guided-20261111';folder=r/'complete-prayer223-source-window-20261111'
j=json.loads((r/'native-generation/execution.json').read_text(encoding='utf-8'));assert len(j['entries'])==223 and all(e['status']=='returned_unreviewed' for e in j['entries'])
result=json.loads((base/'result.json').read_text(encoding='utf-8'));assert result['result']['status']=='candidate';aid=result['result']['attemptId']
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
row=dict(db.execute("select id,shot_id,result_asset_path,status from generation_attempts where id=? and operation='generate_final_video'",(aid,)).fetchone());db.close()
assert row['shot_id']=='59f03007-6524-4e0d-af3d-57697cb712a7' and row['status']=='hold_for_review'
raw=assets/row['result_asset_path'];h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();meta=json.loads(Path(str(raw)+'.json').read_text(encoding='utf-8'));req=json.loads((base/'request.json').read_text(encoding='utf-8'))
assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe']) and req['frame']['id']=='d0cfaaf5-2335-4d80-874b-191c0261b6d1'
guide=json.loads((r/'keyframes/prayer-standing-end167-20261111/returned-artifact-proof.json').read_text(encoding='utf-8'));assert req['endingGuidance']['sha256']==guide['imageSha256']=='3e56c7aa8d542c14c1e3988b589685504ce8d5fa186bbb87c1e9708bb50aa2b8' and meta.get('sourceEndKeyframe')==guide['imageAsset'] and meta.get('sourceEndKeyframeSha256')==guide['imageSha256']==h(assets/guide['imageAsset'])
assert req['expectedFinalOutputPictures']==240 and req['actualFinalUsedEndingNormalFrame']==239

folder.mkdir(exist_ok=True)
ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
probe=lambda p:json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(p)]))['streams']
pk=lambda p,k:json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams',k,'-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',str(p)]))['packets']
v=next(s for s in probe(raw) if s['codec_type']=='video');assert v['r_frame_rate']=='24/1' and int(v['nb_read_frames'])>=240
pic=folder/'selected240-picture-review-only.mp4'
ff(['-i',str(raw),'-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24','-frames:v','240','-an','-c:v','libx264','-preset','medium','-crf','18',str(pic)])
ps=probe(pic);assert len(ps)==1 and int(ps[0]['nb_read_frames'])==240 and ps[0]['width']==1280 and ps[0]['height']==720
master=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav';assert h(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
start,end=16049496,16289496;assert end-start==240000 and start/24==668729 and end/24==678729
wav=folder/'prayer-approved-source.wav';ref=folder/'prayer-continuous-reference.m4a';whole=folder/'complete-prayer-approved-mix.mp4'
pcm=lambda p,flt=None:ff(['-i',str(p)]+(['-af',flt] if flt else [])+['-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-'])
flt=f'atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS';ff(['-i',str(master),'-af',flt,'-c:a','pcm_s16le',str(wav)])
source=pcm(wav);assert len(source)==240000*4 and source==pcm(master,flt)
ff(['-i',str(wav),'-c:a','aac','-b:a','120k',str(ref)]);ff(['-i',str(pic),'-i',str(ref),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(whole)])
ws=probe(whole);assert len(ws)==2 and int(next(s for s in ws if s['codec_type']=='audio')['duration_ts'])==240000 and pk(whole,'v:0')==pk(pic,'v:0') and pk(whole,'a:0')==pk(ref,'a:0')
prior=json.loads((r/'complete-dismissal220-source-window-20261111/selection-and-assembly.json').read_text(encoding='utf-8'));prior_path=assets/prior['assembled']['assembledVideoPath'];assert h(prior_path)==prior['assembledSha256']
cw=folder/'collection-to-prayer-approved-source.wav';cr=folder/'collection-to-prayer-continuous-reference.m4a';cut=folder/'dismissal-to-prayer-actual-join.mp4'
bf='atrim=start_sample=16013496:end_sample=16085496,asetpts=PTS-STARTPTS';ff(['-i',str(master),'-af',bf,'-c:a','pcm_s16le',str(cw)]);assert len(pcm(cw))==72000*4 and pcm(cw)==pcm(master,bf)
ff(['-i',str(cw),'-c:a','aac','-b:a','120k',str(cr)])
ff(['-i',str(prior_path),'-i',str(pic),'-i',str(cr),'-filter_complex','[0:v]trim=start_frame=156:end_frame=192,setpts=N/(24*TB)[a];[1:v]trim=end_frame=36,setpts=N/(24*TB)[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',str(cut)])
cs=probe(cut);assert int(next(s for s in cs if s['codec_type']=='video')['nb_read_frames'])==72 and int(next(s for s in cs if s['codec_type']=='audio')['duration_ts'])==72000 and pk(cut,'a:0')==pk(cr,'a:0')

for first,last in [(0,63),(64,127),(128,191),(192,239)]:ff(['-i',str(raw),'-vf',f"select='between(n,{first},{last})',scale=256:144,tile=8x8",'-frames:v','1',str(folder/f'native-{first:03d}-{last:03d}.png')])
for n in [0,60,120,180,239]:
 ff(['-i',str(raw),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(folder/f'native-{n}.png')])
 ff(['-i',str(pic),'-vf',f"select='eq(n,{n})'",'-frames:v','1',str(folder/f'actual-normalized-{n}.png')])
ff(['-i',str(cut),'-vf',"select='between(n,33,38)',scale=426:240,tile=3x2",'-frames:v','1',str(folder/'incoming-cut-edges.png')])
p={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attemptId':aid,'sourceWindowMs':[668729,678729],'sourceSampleRange24k':[start,end],'sourceSamples24k':240000,'sourceMaster':str(master),'sourceMasterSha256':h(master),'pcmSha256':hashlib.sha256(source).hexdigest(),'raw':str(raw),'rawSha256':h(raw),'rawFrames':int(v['nb_read_frames']),'reviewedSelectedNativeRange':[0,240],'unselectedNativeRange':[240,int(v['nb_read_frames'])],'selectedPicture':str(pic.resolve()),'selectedPictureSha256':h(pic),'frames':240,'fps':24,'whole':str(whole.resolve()),'wholeSha256':h(whole),'exactApprovedMasterPcmVerified':True,'aacPacketsIdenticalToContinuousReference':True,'videoPacketsIdenticalToSelectedPicture':True,'boundary':str(cut.resolve()),'boundarySha256':h(cut),'boundarySourceMs':[667229,670229],'boundaryFrames':72,'boundarySamples24k':72000,'boundaryLocalCutFrame':36,'priorInputFrameRange':[156,192],'priorPictureGridDifferenceMs':0,'boundaryAacPacketsIdenticalToContinuousReference':True,'pictureMinusAudioMs':0,'nativeAudioExcluded':True,'noSourcePauseRetimeOrGainChange':True,'endingGuidance':req['endingGuidance'],'noConditionedEndGuide':False,'actualEndGuideSha256Verified':True,'prospectiveEndGuideIsNotNativeEnding':True,'expectedFinalOutputPictures':240,'actualFinalUsedNormalFrameRange':[0,240],'actualFinalUsedEndingNormalFrame':239,'sourceParentMs':[650729,709631],'sourceParentConfidence':70,'internalEditorialWindowNotNativePhraseTiming':True,'qualityApproved':False,'providerCalls':0,'databaseWrites':0,'wholeFilmReady':False}
(folder/'review-preparation-proof.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf-8');print(json.dumps({'attemptId':aid,'frames':240,'samples24k':240000,'wholeSha256':h(whole),'approved':False}))
