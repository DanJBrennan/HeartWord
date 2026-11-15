/** Isolated complete-verse comparison. One section per invocation, no retries.
 * Existing source/sample planner and local A2V provider, no production writes. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {generateA2vSection} from '../../../src/providers/ltx/a2v.js';
import {childEnvironment} from '../../../src/providers/ltx/transport.js';
import {planShortSpeaking} from '../../../src/pipeline/voice-lipsync/short-speaking-plan.js';
import {detectSilences} from '../../../src/pipeline/ingestion/detect-silences.js';
const root=resolve('outputs/mark6-preparation/mark5-v19-neutral-speaking-test'),assets=join(root,'assets');
const index=Number(process.argv[2]);if(!Number.isInteger(index)||index<0||index>2)throw new Error('Use section 0, 1 or 2.');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const prep=read(join(root,'preparation.json')),full=prep.fullLine.path;
const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,env:childEnvironment(),maxBuffer:8*1024*1024});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true,env:childEnvironment()})).streams;
const quiet=detectSilences(full,{minDurationSec:.15}).map(q=>({startSample:Math.round(q.startMs*48),endSample:Math.round(q.endMs*48)}));
const plan=planShortSpeaking({sampleRate:48000,sampleCount:prep.fullLine.samples,quiet});
if(plan.sections.length!==3||plan.totalFrames!==192)throw new Error('Unexpected complete-line plan.');
const planPath=join(root,'plan.json');
if(existsSync(planPath)){if(JSON.stringify(read(planPath))!==JSON.stringify(plan))throw new Error('Retained plan differs.');}
else writeFileSync(planPath,JSON.stringify(plan,null,2),{flag:'wx'});
const prompt='A single continuous close-up of the Papuan man in the supplied image speaking in Hatam. Retain his exact face, hair, beard, cream clothing with indigo bands, the existing sunset lakeshore and boat, gaze, head angle and camera framing. He speaks the words of the supplied recording as an ordinary matter-of-fact instruction. His lips and jaw visibly form the spoken words fluently, in precise synchrony with their natural timing. The speaking is conversational in scale, with a neutral emotional expression. His brows and cheeks remain relaxed while his mouth continues the speech. Head movement is subtle and natural. Follow the complete recording and its existing pauses; let his mouth settle naturally only when the recorded phrase finishes. Keep the face size, lighting and camera position stable throughout. The picture is plain photographic footage of this one man and the reference scene. Keep it free of captions, subtitles, transcription, titles, lettering, logos and overlays. No extra people, words, vocal sounds or music.';
const dir=join(assets,`section-${index}`);if(existsSync(dir))throw new Error('Retained section exists; reconcile rather than regenerate.');
let image=prep.startingFrame.path;
if(index){const prev=read(join(assets,`section-${index-1}/section.json`));if(prev.status!=='complete_section_held_for_review')throw new Error('Previous section incomplete.');
 const review=read(join(root,`section-${index-1}-review.json`));if(review.proceedToNextSection!==true||review.rawSha256!==prev.rawSha256)throw new Error('Previous section must be inspected before continuing.');
 image=prev.carryImagePath;if(hash(image)!==prev.carryImageSha256)throw new Error('Retained carry changed.');}
const authorize=()=>{
 if(hash(full)!==prep.fullLine.sha256||hash(prep.cast.path)!==prep.cast.sha256||hash(prep.existingPrequoteQuiet.sourcePath)!==prep.source.audio.source_hash)throw new Error('Pinned original performance changed.');
 const{DatabaseSync}=createRequire(import.meta.url)('node:sqlite'),db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
 try{if(!db.prepare("SELECT id FROM character_versions WHERE id=? AND status='approved'").get(prep.canon.versionId))throw new Error('Approved canon changed.');}finally{db.close();}
};authorize();mkdirSync(dir);
const section=plan.sections[index]!,audio=join(dir,'submission.wav');
ff(['-i',full,'-af',`atrim=start_sample=${section.sourceStartSample}:end_sample=${section.sourceEndSample},asetpts=PTS-STARTPTS,apad`,'-t','5','-c:a','pcm_s16le',audio]);
const state:any={status:'prepared',...section,prompt,inputImagePath:image,inputImageSha256:hash(image),submittedAudioSha256:hash(audio),fullLineAudioSha256:hash(full),fullProductionHold:true,startedAt:new Date().toISOString()};
const save=()=>writeFileSync(join(dir,'section.json'),JSON.stringify(state,null,2));save();
try{
 const result=await generateA2vSection({dataDir:root,directory:join(dir,'attempt'),image,audio,prompt,authorizeSubmission:authorize});
 const v=probe(result.rawPath).find((s:any)=>s.codec_type==='video');if(v.width!==1280||v.height!==704||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)<section.retainedFrames)throw new Error('Native framing/count differs; hold.');
 state.rawPath=result.rawPath;state.rawSha256=hash(result.rawPath);
 state.picturePath=join(dir,'picture.mkv');ff(['-i',result.rawPath,'-vf',`trim=end_frame=${section.retainedFrames},setpts=PTS-STARTPTS,crop=980:550:150:0,scale=1280:720,setsar=1`,'-an','-c:v','ffv1',state.picturePath]);
 if(index<2){state.carryImagePath=join(dir,'carry.png');ff(['-i',result.rawPath,'-vf',`select=eq(n\\,${section.lastRetainedFrameIndex}),crop=1280:550:0:0,pad=1280:704:0:0,fillborders=bottom=154:mode=smear`,'-frames:v','1',state.carryImagePath]);state.carryImageSha256=hash(state.carryImagePath);}
 state.reviewPath=join(dir,'review.mp4');ff(['-i',state.picturePath,'-i',full,'-filter_complex',`[1:a]atrim=start_sample=${section.sourceStartSample}:end_sample=${section.sourceEndSample},asetpts=PTS-STARTPTS[a]`,'-map','0:v:0','-map','[a]','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',state.reviewPath]);
 const sheets=join(dir,'all-delivered-frames');mkdirSync(sheets);ff(['-i',state.picturePath,'-vf','scale=320:180,tile=6x4','-fps_mode','passthrough',join(sheets,'frames-%02d.png')]);
 state.status='complete_section_held_for_review';state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({index,status:state.status,retainedFrames:section.retainedFrames,rawSha256:state.rawSha256}));
}catch(e){state.status='held_reconcile_before_any_retry';state.error=(e as Error).message;save();throw e;}
