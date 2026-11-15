"""Inspect one completed prompt-only diagnostic; no provider requests."""
import hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
NEW=HERE/'pause-prompt-test'
OLD=HERE.parent/'ltx-prepared-tests-v3/assets/generated/lip-sync/ltx-mark6-20261101-pause-v50'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def call(*args):return subprocess.check_output([str(v) for v in args],creationflags=subprocess.CREATE_NO_WINDOW)
def packets(p):return json.loads(call('ffprobe','-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts,dts,duration,data_hash','-show_data_hash','sha256','-of','json',p))['packets']
state=read(NEW/'execution.json')
assert state['status']=='generated_held_for_review', 'Original request has not completed; do not retry'
old=read(OLD/'attempt-0/attempt.json');new=read(NEW/'assets/attempt/attempt.json')
assert old['imageSha256']==new['imageSha256'] and old['audioSha256']==new['audioSha256']
diff={k for k in set(old['request'])|set(new['request']) if old['request'].get(k)!=new['request'].get(k)}
assert diff=={'prompt','imagePath','audioPath'},diff
candidate=NEW/'assets/candidate.mp4'
streams=json.loads(call('ffprobe','-v','error','-count_frames','-show_streams','-of','json',candidate))['streams']
v=next(s for s in streams if s['codec_type']=='video')
assert int(v['nb_read_frames'])==94 and v['r_frame_rate']=='24/1'
assert packets(candidate)==packets(OLD/'candidate.mp4'),'Audio packet hash/timing mismatch'
frames=json.loads(call('ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',candidate))['frames']
assert all(abs(float(f['best_effort_timestamp_time'])-i/24)<.000002 for i,f in enumerate(frames))
call('ffmpeg','-v','error','-nostdin','-i',candidate,'-f','null','-')
comparison=NEW/'comparison-original-left-explicit-right.mp4'
call('ffmpeg','-v','error','-nostdin','-n','-i',OLD/'candidate.mp4','-i',candidate,
 '-filter_complex','[0:v]scale=640:360[l];[1:v]scale=640:360[r];[l][r]hstack=inputs=2[v]',
 '-map','[v]','-map','0:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',comparison)
report={'status':'technical_checks_passed_visual_sync_review_pending','changedFactor':'positive_prompt_only',
 'exactUploadedImageAndAudioMatchPrevious':True,'generationSettingsMatchPrevious':True,
 'sourceAudioPacketHashesAndTimingExactlyMatchPrevious':True,'retainedVideoFrames':94,'allPicturePtsUnchanged':True,
 'comparisonPath':str(comparison),'comparisonLayout':'Original prompt LEFT; explicit speaking prompt RIGHT; one unchanged audio track.',
 'newProviderCalls':0,'fullProductionHold':True,'acceptance':'No syllable-sync verdict follows from technical checks.'}
(NEW/'technical-checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
