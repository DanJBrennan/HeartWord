# Deferred: run ONLY after SAME258 returns. Creates inspection/source media, never acceptance.
from pathlib import Path
import json, sqlite3, subprocess, hashlib, datetime
r=Path('outputs/mark6-production'); data=Path('C:/Users/danbr/HeartWordData'); assets=data/'assets'
base=r/'native-motion/touch-final261-20261112'; folder=r/'complete-touch261-source-window-20261112'
read=lambda p:json.loads(Path(p).read_text(encoding='utf8')); h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
n=read(r/'native-generation/execution.json'); ret=read(base/'result.json'); req=read(base/'request.json')
assert len(n['entries'])==261 and all(e['status']=='returned_unreviewed' for e in n['entries']) and ret['result']['status']=='candidate'
db=sqlite3.connect((data/'db/heartword.sqlite').as_uri()+'?mode=ro',uri=True); db.execute('PRAGMA busy_timeout=5000')
row=db.execute("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'",(ret['result']['attemptId'],'4eca09f5-e472-4045-8ecb-4ff633c933e6')).fetchone();db.close()
assert row and row[1]=='hold_for_review'
raw=assets/row[0]; meta=read(str(raw)+'.json')
assert meta['sourceKeyframe']==req['frame']['result_asset_path'] and meta['sourceKeyframeSha256']==req['frameSha256']==h(assets/meta['sourceKeyframe'])=='d30b16494e117d2fa427f58cd62a0c0d64d44873f2bafc1a44b0d3c64576d4e9'
assert req['sourceSamples24k']==240000 and req['sourceDurationMs']==10000 and req['expectedFinalOutputPictures']==240
assert req['endingGuidance'] is None and req['proposedSourceWindowMs']==[778791,788791] and req['sourceParentMs']==[740291,796680]
prior=read(r/'complete-layseek260-source-window-20261112/root-joined-review.json');priorSelection=read(r/'complete-layseek260-source-window-20261112/selection-and-assembly.json');normal=assets/priorSelection['assembled']['assembledVideoPath']
assert prior['sourceClearThroughMs']==778791 and prior['actualAll240NormalAndFull239Viewed'] and prior['av']['all12Clear'] and prior['expectedFinalOutputPictures']==240 and h(normal)==prior['normalSha256']=='60b27260bdb2d73b4acfe896806a7bd3edcd2b0ce1b5554f8b08f234d5876e14'
folder.mkdir(exist_ok=True)
ff=lambda a:subprocess.check_output(['ffmpeg','-v','error','-nostdin','-n']+a)
probe=lambda p:json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(p)]))['streams']
packets=lambda p,k:json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams',k,'-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',str(p)]))['packets']
v=next(x for x in probe(raw) if x['codec_type']=='video');count=int(v['nb_read_frames']); assert count>=240 and v['r_frame_rate']=='24/1'
pic=folder/'selected240-picture-review-only.mp4'
ff(['-i',str(raw),'-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24','-frames:v','240','-an','-c:v','libx264','-preset','medium','-crf','18',str(pic)])
assert int(probe(pic)[0]['nb_read_frames'])==240
master=assets/'generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav'; assert h(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
pcm=lambda p,flt=None:ff(['-i',str(p)]+(['-af',flt] if flt else [])+['-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-'])
def audio(name,start,end):
    wav=folder/(name+'.wav'); aac=folder/(name+'.m4a');flt=f'atrim=start_sample={start}:end_sample={end},asetpts=PTS-STARTPTS'
    ff(['-i',str(master),'-af',flt,'-c:a','pcm_s16le',str(wav)]); b=pcm(wav); assert len(b)==(end-start)*4 and b==pcm(master,flt)
    ff(['-i',str(wav),'-c:a','aac','-b:a','120k',str(aac)]);return wav,aac,b
wav,aac,b=audio('touch-approved-source',18690984,18930984);whole=folder/'complete-touch-approved-mix.mp4'
ff(['-i',str(pic),'-i',str(aac),'-map','0:v:0','-map','1:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',str(whole)])
assert packets(whole,'v:0')==packets(pic,'v:0') and packets(whole,'a:0')==packets(aac,'a:0') and int(next(x for x in probe(whole) if x['codec_type']=='audio')['duration_ts'])==240000
bw,ba,bb=audio('run-to-touch-approved-source',18654984,18726984); boundary=folder/'actual260-normal-to-touch261-join.mp4'
ff(['-i',str(normal),'-i',str(pic),'-i',str(ba),'-filter_complex','[0:v]trim=start_frame=204:end_frame=240,setpts=N/(24*TB)[a];[1:v]trim=end_frame=36,setpts=N/(24*TB)[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',str(boundary)])
assert int(next(x for x in probe(boundary) if x['codec_type']=='video')['nb_read_frames'])==72 and packets(boundary,'a:0')==packets(ba,'a:0')
for prefix,src,frames in [('native',raw,count),('selected',pic,240)]:
    for first in range(0,frames,32):
        last=min(first+31,frames-1);ff(['-i',str(src),'-vf',f"select='between(n,{first},{last})',scale=384:216,tile=4x8",'-frames:v','1',str(folder/f'{prefix}-{first:03d}-{last:03d}.png')])
    for i in sorted(set([0,60,120,180,239,frames-1])):ff(['-i',str(src),'-vf',f"select='eq(n,{i})'",'-frames:v','1',str(folder/f'{prefix}-full{i}.png')])
ff(['-i',str(boundary),'-vf',"select='between(n,33,38)',scale=426:240,tile=3x2",'-frames:v','1',str(folder/'actual-incoming-cut-edges.png')])
p=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),attemptId=ret['result']['attemptId'],raw=str(raw),rawSha256=h(raw),rawFrames=count,sourceWindowMs=[778791,788791],sourceSampleRange24k=[18690984,18930984],sourceSamples24k=240000,sourceDurationMs=10000,sourceLanguage='Hatam',sourceMaster=str(master),sourceMasterSha256=h(master),pcmSha256=hashlib.sha256(b).hexdigest(),selectedPicture=str(pic.resolve()),selectedPictureSha256=h(pic),frames=240,fps=24,whole=str(whole.resolve()),wholeSha256=h(whole),boundary=str(boundary.resolve()),boundarySha256=h(boundary),boundarySourceMs=[777291,780291],boundaryFrames=72,boundarySamples24k=72000,boundaryLocalCutFrame=36,priorNormalSha256=h(normal),priorInputFrameRange=[204,240],exactApprovedMasterPcmVerified=True,aacPacketsIdenticalToContinuousReference=True,videoPacketsIdenticalToSelectedPicture=True,boundaryAacPacketsIdenticalToContinuousReference=True,selectedNativeRange=[0,240],unselectedNativeRange=[240,count],endingGuidance=None,guideIsNotActualMotionAcceptance=True,prior260Exact240FinalNormalUsed=True,prior260PictureGridDifferenceMs=0,sourceParentMs=[740291,796680],internalEditorialWindowNotNativePhraseTiming=True,actualFinalUsedNormalFrameRange=[0,240],actualFinalUsedEndingNormalFrame=239,pictureMinusAudioMs=0,nativeAudioExcluded=True,noSourcePauseRetimeOrGainChange=True,qualityApproved=False,wholeFilmReady=False,providerCalls=0,databaseWrites=0)
(folder/'review-preparation-proof.json').write_text(json.dumps(p,indent=2)+'\n',encoding='utf8'); print(json.dumps(p))
