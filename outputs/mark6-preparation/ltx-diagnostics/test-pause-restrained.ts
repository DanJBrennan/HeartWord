/** One-factor diagnostic: existing v50 image/audio/settings; new positive prompt.
 * One local container only. No retry, paid video fallback, DB writes or voice. */
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {generateA2vSection} from '../../../src/providers/ltx/a2v.js';
import {childEnvironment} from '../../../src/providers/ltx/transport.js';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const old=resolve('outputs/mark6-preparation/ltx-prepared-tests-v3/assets/generated/lip-sync/ltx-mark6-20261101-pause-v50');
const line=JSON.parse(readFileSync(join(old,'line.json'),'utf8'));
const previous=JSON.parse(readFileSync(join(old,'attempt-0/attempt.json'),'utf8'));
const dataDir=resolve('outputs/mark6-preparation/ltx-diagnostics/pause-restrained-test'),assets=join(dataDir,'assets');
if(existsSync(dataDir))throw new Error('Retained diagnostic exists; reconcile rather than retry.');
if(hash(join(old,'start.png'))!==previous.imageSha256||hash(join(old,'section-0.wav'))!==previous.audioSha256)throw new Error('Original submitted input changed.');
mkdirSync(assets,{recursive:true});
const image=join(assets,'start.png'),audio=join(assets,'submission.wav'),fullLine=join(assets,'full-line.wav');
copyFileSync(join(old,'start.png'),image);copyFileSync(join(old,'section-0.wav'),audio);copyFileSync(join(old,'full-line.wav'),fullLine);
const prompt='A steady photorealistic speaking portrait of the single Papuan man in the supplied scene frame. Preserve his exact identity, shoulder-length dark hair, beard, cream tunic, cream outer mantle with indigo bands, the existing night-lake background and lighting. The camera is locked, showing his head and upper chest in the same landscape composition throughout. He speaks Hatam with quiet, composed reassurance and the low physical effort of ordinary conversation. His lips and jaw follow the supplied recording precisely with small, relaxed movements and modest jaw opening. His face remains settled and attentive: relaxed eyebrows, softly open eyes and a neutral resting mouth between phrases. The emotional intensity is low and steady throughout. His mouth begins speaking at the first audible word, rests during the recorded pauses, and settles closed when the words finish. His head stays comfortably still; blinking and breathing are occasional and natural. Facial movement is understated and unforced throughout the line. Preserve his face size and head position; the camera does not move closer. This is plain photographic footage of this one person and the reference scene. Keep every frame free of text, subtitles, captions, lettering, transcription, translations, titles, logos and graphic overlays. No additional people, dialogue, singing, music or invented vocal sounds.';
const state:any={status:'preparing_one_restrained_test',changedFactor:'conversational_performance_direction_only',comparisonBaseline:'pause-prompt-test explicit speaking take; Dan found sync/volume good and acting exaggerated',fullProductionHold:true,newVoiceCalls:0,maxContainers:1,
 previousRequest:previous.request,newPrompt:prompt,inputImageSha256:hash(image),submittedAudioSha256:hash(audio),
 sourceClock:line.source,fullLineAudioSha256:hash(fullLine),plan:line.plan,startedAt:new Date().toISOString()};
const save=()=>writeFileSync(join(dataDir,'execution.json'),JSON.stringify(state,null,2));save();
const authorize=()=>{if(hash(image)!==previous.imageSha256||hash(audio)!==previous.audioSha256||hash(fullLine)!==line.fullLineAudioSha256)throw new Error('Pinned diagnostic inputs changed.');};
try{
 const result=await generateA2vSection({dataDir,directory:join(assets,'attempt'),image,audio,prompt,authorizeSubmission:authorize});
 const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...args],{windowsHide:true,env:childEnvironment(),maxBuffer:4*1024*1024});
 const out=join(assets,'candidate.mp4');
 ff(['-i',result.rawPath,'-i',fullLine,'-map','0:v:0','-map','1:a:0','-vf',`trim=end_frame=${line.plan.totalFrames},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2`,'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',out]);
 const sheets=join(dataDir,'all-delivered-frames');mkdirSync(sheets);
 ff(['-i',out,'-vf','scale=320:180,tile=6x4','-fps_mode','passthrough',join(sheets,'frames-%02d.png')]);
 state.status='generated_held_for_review';state.rawPath=result.rawPath;state.candidatePath=out;state.finishedAt=new Date().toISOString();save();console.log(JSON.stringify(state));
}catch(e){state.status='held_reconcile_before_retry';state.error=(e as Error).message;save();throw e;}
