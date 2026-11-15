from pathlib import Path
import json,hashlib,subprocess,datetime
root=Path('outputs/mark6-production');folder=root/'reviewed-opening-prefix-20261107';folder.mkdir(exist_ok=True)
a=root/'scene1-complete-source-window-20261107/mark6-scene1-complete-approved-music.mp4';b=root/'commissioning-source-window-20261107/mark6-commissioning-approved-music.mp4'
master=Path('C:/Users/danbr/HeartWordData/assets/generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav')
h=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert h(master)=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'
output=folder/'mark6-reviewed-opening-through-commissioning.mp4';reference=folder/'single-continuous-audio-reference.m4a'
ff=lambda args:subprocess.run(['ffmpeg','-v','error','-nostdin','-n',*map(str,args)],check=True,capture_output=True)
ff(['-i',a,'-i',b,'-i',master,'-filter_complex','[0:v]trim=end_frame=2368,setpts=PTS-STARTPTS[v0];[1:v]trim=end_frame=421,setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v];[2:a]atrim=start_sample=0:end_sample=2788536,asetpts=PTS-STARTPTS[a]','-map','[v]','-map','[a]','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-video_track_timescale','24000','-c:a','aac','-b:a','192k','-ar','24000','-movie_timescale','24000','-movflags','+faststart',output])
ff(['-i',master,'-af','atrim=start_sample=0:end_sample=2788536,asetpts=PTS-STARTPTS','-c:a','aac','-b:a','192k','-ar','24000','-movie_timescale','24000',reference])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(output)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert int(v['nb_read_frames'])==2789 and v['r_frame_rate']=='24/1' and v['width']==1280 and v['height']==720
assert int(audio['duration_ts'])==2788536 and audio['time_base']=='1/24000' and audio['channels']==2
packets=lambda path:json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-of','json',str(path)]))['packets']
p1=packets(output);p2=packets(reference);assert [(x['pts'],x['data_hash']) for x in p1]==[(x['pts'],x['data_hash']) for x in p2]
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Continuous opening prefix derived from two previously reviewed source windows; not whole-film completion or new whole-prefix AV approval','path':str(output).replace(chr(92),'/'),'sha256':h(output),'sourceStartMs':0,'sourceEndMs':116189,'sourceStereoFrames':2788536,'sampleRate':24000,'sourceSpeed':1,'audioAacPacketsExactlyEqualSingleMasterEncode':True,'audioReferenceSha256':h(reference),'videoFrames':2789,'fps':24,'videoDurationMs':2789*1000/24,'pictureEndRoundingSurplusMs':2789*1000/24-116189,'sourceBoundaryMs':98679,'actualPictureCutFrame':2368,'actualPictureCutMs':2368*1000/24,'cutRoundingOffsetMs':2368*1000/24-98679,'firstSceneSelectedFrames':[0,2368],'firstScenePreviouslyIncludedFrames':2369,'commissioningSelectedFrames':[0,421],'sourceFiles':[{'path':str(a),'sha256':h(a)},{'path':str(b),'sha256':h(b)},{'path':str(master),'sha256':h(master)}],'sourceAudioDroppedOrRepeated':False,'nativeSoundSelected':False,'freezeLoopSlowMotionOrTailPad':False,'newProviderCalls':0,'databaseWrites':0,'editableWholeFilmComplete':False,'remaining':'Actual join-frame inspection and final whole-cut AV/editable package still required; accepted source coverage remains116.189s, not increased by this derivative.'}
json.dump(report,open(folder/'proof.json','x'),indent=2);json.dump(probe,open(folder/'probe.json','x'),indent=2)
print(json.dumps({'path':report['path'],'sourceSeconds':116.189,'videoFrames':2789,'exactAudioPacketParity':True,'newProviderCalls':0}))
