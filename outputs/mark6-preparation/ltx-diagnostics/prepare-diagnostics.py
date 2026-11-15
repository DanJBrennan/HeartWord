import hashlib,json,shutil,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def call(*args):return subprocess.check_output([str(v) for v in args],creationflags=subprocess.CREATE_NO_WINDOW)
def ff(*args):return call('ffmpeg','-v','error','-nostdin','-n',*args)
def packets(path,stream):
 return json.loads(call('ffprobe','-v','error','-select_streams',stream,'-show_packets','-show_entries','packet=pts,dts,duration,data_hash','-show_data_hash','sha256','-of','json',path))['packets']

# Copy the exact inputs of a take inside Dan's explicitly accepted Peter chain.
original=Path('C:/Users/danbr/HeartWordData/prototypes/ltx-peter-frame-chain-20261030/part-2')
control=HERE/'peter-control'
control.mkdir(exist_ok=True)
assert not any(control.iterdir()), 'Retained control inputs exist; reconcile rather than overwrite'
manifest=json.loads((original/'manifest.json').read_text())
for name,expected in manifest['files'].items():
 assert sha(original/name)==expected, f'Historical input changed: {name}'
 shutil.copyfile(original/name,control/name)
 assert sha(control/name)==expected
shutil.copyfile(original/'manifest.json',control/'manifest.json')
old=json.loads((original/'performance/attempt.json').read_text())
current=json.loads((HERE.parent/'ltx-prepared-tests-v3/assets/generated/lip-sync/ltx-mark6-20261101-chain-v4/attempt-0/attempt.json').read_text())
diff={k:{'successfulPeter':old['request'].get(k),'mark6':current['request'].get(k)}
 for k in sorted(set(old['request'])|set(current['request']))
 if old['request'].get(k)!=current['request'].get(k) and k not in ['imagePath','audioPath']}
authorization={'status':'one_control_prepared_not_submitted','source':str(original),'manifestSha256':sha(control/'manifest.json'),
 'allowedContainers':1,'fullProductionHold':True,'noPaidFallback':True,
 'requiredBeforeSubmission':'Local video policy verified; existing free web text encoder retained. No paid video fallback.',
 'necessaryDifferenceFromHistoricalRun':'No deliberate image, audio, prompt or generation-setting change. New remote filenames and execution time are recorded. Deterministic bit-identical output is not assumed.',
 'gating':'Review this control before changing Mark 6 audio/image or running additional inference.',
 'requestDifferencesAgainstMark6':diff}
(HERE/'control-authorization.json').write_text(json.dumps(authorization,indent=2))

# Disclosed picture-only cleanup of the existing short take. Original AAC packets
# are copied; the 68 retained frames and source clock remain unchanged.
root=HERE.parent/'ltx-prepared-tests-v3/assets/generated/lip-sync/ltx-mark6-20261101-short-v37'
clean=HERE/'short-v37-cleanup';clean.mkdir(exist_ok=False)
output=clean/'review-no-text-original-timing.mp4'
ff('-i',root/'attempt-0/raw.mp4','-i',root/'candidate.mp4','-map','0:v:0','-map','1:a:0',
 '-vf','trim=end_frame=68,setpts=PTS-STARTPTS,crop=980:550:150:0,scale=1280:720,setsar=1',
 '-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',output)
assert packets(output,'a:0')==packets(root/'candidate.mp4','a:0'),'Audio packets or timing changed'
v=json.loads(call('ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_streams','-of','json',output))['streams'][0]
assert int(v['nb_read_frames'])==68 and v['r_frame_rate']=='24/1'
frames=json.loads(call('ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',output))['frames']
assert all(abs(float(f['best_effort_timestamp_time'])-i/24)<.000002 for i,f in enumerate(frames))
ff('-i',output,'-f','null','-')
ff('-i',output,'-vf','scale=320:180,tile=6x4','-fps_mode','passthrough',clean/'frames-%02d.png')
ff('-i',output,'-vf','crop=1280:220:0:500,scale=640:110,tile=4x6','-fps_mode','passthrough',clean/'lower-%02d.png')
proof={'status':'technical_cleanup_complete_visual_review_pending','path':str(output),'sha256':sha(output),
 'crop':{'x':150,'y':0,'width':980,'height':550,'nativeWidth':1280,'nativeHeight':704},
 'retainedFrames':68,'fps':24,'audioPacketHashesAndPtsDtsDurationsIdentical':True,'allPicturePtsUnchanged':True,
 'newInferenceCalls':0,'limitations':'Picture crop is disclosed. Does not establish syllable synchronization, production framing or native-language acceptance. Raw take and original candidate retained.'}
(clean/'verification.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'control':authorization,'cleanup':proof},indent=2))
