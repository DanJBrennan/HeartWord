"""Assemble the complete neutral test and compare against the actual film.
No provider calls, source edits, speech retiming, interpolation or production writes.
"""
import json,hashlib,subprocess,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parent;ASSETS=ROOT/'assets'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def call(*a):return subprocess.check_output([str(x) for x in a],creationflags=subprocess.CREATE_NO_WINDOW)
def ff(*a):return call('ffmpeg','-v','error','-nostdin','-n',*a)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def pcm(p):return call('ffmpeg','-v','error','-i',p,'-map','0:a:0','-f','s16le','-')
def streams(p):return json.loads(call('ffprobe','-v','error','-count_frames','-show_streams','-of','json',p))['streams']
def packets(p):return json.loads(call('ffprobe','-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts,dts,duration,data_hash','-show_data_hash','sha256','-of','json',p))['packets']
prep=read(ROOT/'preparation.json');plan=read(ROOT/'plan.json');parts=[];audio=[];proof=[]
full=Path(prep['fullLine']['path']);assert sha(full)==prep['fullLine']['sha256'];fullPcm=pcm(full)
for i,s in enumerate(plan['sections']):
 part=read(ASSETS/f'section-{i}/section.json');assert part['status']=='complete_section_held_for_review'
 assert sha(Path(part['rawPath']))==part['rawSha256'];parts.append(Path(part['picturePath']))
 data=pcm(ASSETS/f'section-{i}/submission.wav');n=(s['sourceEndSample']-s['sourceStartSample'])*4
 assert len(data)==5*48000*4 and not any(data[n:]);audio.append(data[:n])
 if i:
  prev=read(ASSETS/f'section-{i-1}/section.json');assert part['inputImageSha256']==prev['carryImageSha256'];assert sha(Path(prev['carryImagePath']))==part['inputImageSha256']
  raw=prev['rawPath'];idx=prev['lastRetainedFrameIndex'];carry=prev['carryImagePath']
  a=call('ffmpeg','-v','error','-i',raw,'-vf',f'select=eq(n\\,{idx}),crop=1280:550:0:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-')
  b=call('ffmpeg','-v','error','-i',carry,'-vf','crop=1280:550:0:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-');assert a==b
  proof.append({'join':i,'previousNativeFrameIndex':idx,'allNativeTop550PixelsUnchanged':True})
assert b''.join(audio)==fullPcm,'Speech samples omitted, repeated or changed'
listing=ROOT/'pictures.txt';listing.write_text(''.join("file '"+str(p).replace('\\','/')+"'\n" for p in parts),encoding='utf-8')
candidate=ROOT/'neutral-complete-line.mp4'
ff('-f','concat','-safe','0','-i',listing,'-i',full,'-map','0:v:0','-map','1:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',candidate)
expected=ROOT/'single-full-line-encode.m4a';ff('-i',full,'-c:a','aac','-b:a','192k',expected);assert pcm(candidate)==pcm(expected)
v=next(s for s in streams(candidate) if s['codec_type']=='video');assert int(v['nb_read_frames'])==192 and v['r_frame_rate']=='24/1'
pts=json.loads(call('ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',candidate))['frames'];assert all(abs(float(f['best_effort_timestamp_time'])-i/24)<.000002 for i,f in enumerate(pts))
filmPicture=ASSETS/'film-picture-matched-crop.mkv';film=ROOT/'film-excerpt-original-mix.mp4'
for name,audioSource in [('comparison-film-left-neutral-right-original-film-sound.mp4',film),('comparison-film-left-neutral-right-clean-speech.mp4',candidate)]:
 out=ROOT/name
 ff('-i',filmPicture,'-i',candidate,'-i',audioSource,'-filter_complex','[0:v]scale=640:360[l];[1:v]scale=640:360[r];[l][r]hstack=inputs=2[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',out)
 assert packets(out)==packets(audioSource)
 ff('-i',out,'-f','null','-')
sheets=ROOT/'all-delivered-frames';sheets.mkdir();ff('-i',candidate,'-vf','scale=320:180,tile=6x4','-fps_mode','passthrough',sheets/'frames-%02d.png')
for i,frame in enumerate([62,122],1):ff('-i',candidate,'-vf',f'trim=start_frame={frame-4}:end_frame={frame+4},scale=320:180,tile=4x2','-frames:v','1',ROOT/f'join-{i}.png')
report={'status':'complete_comparison_technical_checks_passed_visual_AV_review_pending','passage':'Mark 5:19','filmMasterSha256':prep['approvedFilm']['sha256'],'filmMasterUnchanged':sha(Path(prep['approvedFilm']['path']))==prep['approvedFilm']['sha256'],
 'frames':192,'fps':24,'sourceSamples':383968,'exactSourcePartitionAndTailSilence':True,'singleContinuousFullLineAudioEncode':True,'allPicturePtsPreserved':True,'nativeCarryProof':proof,
 'sourceClockAlignment':read(ROOT/'film-audio-alignment-check.json'),'primaryComparison':'comparison-film-left-neutral-right-original-film-sound.mp4','secondaryComparison':'comparison-film-left-neutral-right-clean-speech.mp4','fullProductionHold':True,'newVoiceCalls':0,'newImageCalls':0,'paidFallback':False,
 'limitations':'Acting neutrality, lip-sync, mouth rest, identity/framing, caption removal and straight-join quality require complete-line playback. Technical checks do not grant film acceptance.'}
(ROOT/'technical-checks.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
