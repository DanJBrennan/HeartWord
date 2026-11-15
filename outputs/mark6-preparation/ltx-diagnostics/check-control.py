"""Wait for the ONE retained control; inspect files only. Never submit/retry."""
import hashlib,json,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent/'peter-control'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def call(*args):return subprocess.check_output([str(v) for v in args],creationflags=subprocess.CREATE_NO_WINDOW)
deadline=time.monotonic()+3*3600
while time.monotonic()<deadline:
 state=read(ROOT/'performance/attempt.json')
 if state['status'] not in ['preflight','submitted','generated']:break
 time.sleep(10)
report={'status':'control_not_ready_for_review','attemptStatus':state['status'],'newInferenceCalls':0,'fullProductionHold':True,'noFurtherInferenceScheduled':True}
if state['status']=='ready_for_review':
 try:
  raw=ROOT/'performance/raw.mp4';review=ROOT/'performance/review.mp4'
  meta=json.loads(call('ffprobe','-v','error','-count_frames','-show_streams','-of','json',review))['streams']
  video=next(s for s in meta if s['codec_type']=='video')
  assert int(video['nb_read_frames'])==78 and video['r_frame_rate']=='24/1'
  for p in [raw,review]:call('ffmpeg','-v','error','-nostdin','-i',p,'-f','null','-')
  sheets=ROOT/'performance/all-delivered-frames';sheets.mkdir()
  call('ffmpeg','-v','error','-nostdin','-n','-i',review,'-vf','scale=320:180,tile=6x4','-fps_mode','passthrough',sheets/'frames-%02d.png')
  historical=Path('C:/Users/danbr/HeartWordData/prototypes/ltx-peter-frame-chain-20261030/part-2/performance/attempt.json')
  before=read(historical)['request'];after=state['request']
  difference={k:{'before':before.get(k),'after':after.get(k)} for k in set(before)|set(after) if before.get(k)!=after.get(k) and k not in ['imagePath','audioPath']}
  assert not difference, f'Unexpected request differences: {difference}'
  report.update(status='control_generated_technical_checks_passed_visual_AV_review_pending',videoFrames=78,
   generationRequestMatchesHistoricalExceptRemotePaths=True,rawSha256=hashlib.sha256(raw.read_bytes()).hexdigest(),
   reviewPath=str(review),allDeliveredFrameSheets=str(sheets),limitations='File success does not establish speaking or synchronized lips. Review before any subsequent inference.')
 except Exception as e:report.update(status='control_technical_hold',error=str(e))
(ROOT.parent/'control-technical-checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
