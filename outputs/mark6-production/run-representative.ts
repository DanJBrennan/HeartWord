// Independently runnable bounded TEST using existing providers. No DB media
// selection, approved plan, production clip or canon mutation is created.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {hasCurrentSourceReview} from '../../src/pipeline/ingestion/source-review.js';
import {mark6NativeBudget} from './native-budget.js';
const ops=resolve('outputs/mark6-production'),dir=join(ops,'representative-test-20261104'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const input=read(join(dir,'inputs.json')),data=input.dataDir,root=input.root,mode=process.argv[2]??'';
if(!['herod','herod-v2','bridge','daughter','daughter-v2'].includes(mode))throw Error('Choose one prepared test phase; no automatic retries');
for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','ELEVENLABS_API_KEY','OPENAI_API_KEY','CODEX_API_KEY'])delete process.env[key];
if(!process.env.LTX_TOKEN)throw Error('Stored local session required');
const db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),budget=mark6NativeBudget(ops);
const actor=input.actors[mode.startsWith('herod')?'herod':'daughter'];
const authorization=()=>{
 const state=read(join(ops,'execution.json'));
 if(state.productionScope!=='representative_test_only'||state.productionHold!==false||!input.testOnly||!hasCurrentSourceReview(db,input.projectId))throw Error('Current standalone test/source authorization required');
 const cv=db.prepare("SELECT voice_id FROM character_versions WHERE id=? AND character_id=? AND status='approved'").get(actor.versionId,actor.characterId);
 if(!cv||cv.voice_id!==actor.voiceId)throw Error('Approved voice/canon binding changed');
 for(const ref of [...input.references,{path:actor.frame,sha256:actor.frameSha256},{path:actor.audio,sha256:actor.audioSha256}])if(hash(ref.path)!==ref.sha256)throw Error('Pinned test input changed');
 if(hash(input.scoreReference.path)!==input.scoreReference.sha256)throw Error('Approved music changed');
 if(read(join(dir,'framing-review.json')).status!=='inspected_for_standalone_test_only')throw Error('Actual frame inspection required');
};
const resultFile=join(dir,mode+'-result.json');if(existsSync(resultFile))throw Error('Phase result already retained; never regenerate implicitly');
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...args],{windowsHide:true,stdio:'pipe'});
authorization();writeFileSync(join(dir,'worker-status.json'),JSON.stringify({mode,pid:process.pid,status:'running',at:new Date().toISOString()}));
try{
 let result;
 if(mode==='bridge'){
  const local=new LtxVideoProvider({dataDir:data,lazyLoadDownloadedFast:true});
  result=await budget.video(local).generateFinal({shotId:'mark6-representative-narrator-bridge',characters:[{characterId:actor.characterId,characterVersionId:actor.versionId}],authorizeSubmission:authorization,
   prompt:'One silent visible woman. Preserve the supplied approved identity, opaque teal and cream clothing, interior entrance recess, camera, eyeline and warm light. A very small natural settling of her shoulders at this consultation stopping position, then still attentive posture toward her mother off-camera just to camera-right. Lips remain together; absolutely no talking, mouthing words, smile, dance or gesture. Stable eye-level camera, no cuts. No text, captions, subtitles, logos or new people. The actual narrator is supplied separately. No added plot action.'},
   {resolution:'720p',durationSeconds:8,fps:24,tier:'economy',seed:42,audioMode:'none',startFrame:{path:actor.frame},outputPath:join(root,'narrator-bridge-v1.mp4')});
  if(!result.media)throw Error('No retained bridge picture');
  const path=resolve(data,'assets',result.media.path),carry=join(root,'daughter-from-bridge-frame154.png');
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path],{encoding:'utf8'})).streams[0];
  const c=input.crop;if(c.x+c.width>info.width||c.y+c.height>info.height)throw Error('Actual bridge dimensions cannot fit inspected crop');
  ff(['-i',path,'-vf',`select=eq(n\\,154),crop=${c.width}:${c.height}:${c.x}:${c.y},pad=${info.width}:${info.height}:${c.x}:${c.y},fillborders=left=${c.x}:right=${info.width-c.x-c.width}:top=${c.y}:bottom=${info.height-c.y-c.height}:mode=smear`,'-frames:v','1',carry]);
  Object.assign(result,{carry:{path:carry,sha256:hash(carry),frameIndex:154},retainedNarrationFrames:155});
 }else{
  const frame=mode.startsWith('daughter')?read(join(dir,'bridge-result.json')).carry:{path:actor.frame,sha256:actor.frameSha256};
  if(hash(frame.path)!==frame.sha256)throw Error('Starting/carry frame changed');
  if(mode.startsWith('daughter')&&read(join(dir,'bridge-carry-review.json')).status!=='inspected_for_test_continuation')throw Error('Actual bridge carry frame needs inspection');
  const control=mode==='herod-v2'?read(join(dir,'prompt-control-v1/manifest.json')):undefined;
  let sectionIndex=0;
  const generateSection:typeof budget.section=async(request,dependencies)=>{
   if(mode==='daughter-v2'){
    if(read(join(request.directory,'..','line.json')).plan.sections.length!==2)throw Error('Daughter partition differs from approved two-call scope; hold before submission');
    return budget.section(request,dependencies);
   }
   if(mode!=='herod-v2'||sectionIndex++!==0)return budget.section(request,dependencies);
   const reviewed=read(join(dir,'prompt-control-v1/av-review.json')),verification=read(join(dir,'prompt-control-v1/verification.json')),retained=read(join(dir,'prompt-control-v1/result.json')),attempt=read(retained.attemptPath);
   if(reviewed.result.status!=='clear'||!verification.completeLinePrefixScopeMatches||!verification.exactDiagnosticPcmVerified||JSON.stringify(input.crop)!==JSON.stringify(control.crop)||request.prompt!==control.prompt||hash(request.image)!==control.image.sha256||hash(request.audio)!==control.audio.sha256||attempt.status!=='downloaded_unreviewed'||hash(retained.rawPath)!==attempt.rawSha256)throw Error('Reviewed prefix does not exactly match current task; no automatic regeneration');
   writeFileSync(join(dir,'herod-v2-prefix-reuse.json'),JSON.stringify({status:'exact_reviewed_test_prefix_reused',newGenerationCalls:0,sourceAttemptPath:retained.attemptPath,rawPath:retained.rawPath,rawSha256:attempt.rawSha256,inputImageSha256:control.image.sha256,inputAudioSha256:control.audio.sha256,promptSha256:control.promptSha256,sourceSamples:[0,176000],retainedFrames:88,lastRetainedFrameIndex:87,crop:input.crop,review:join(dir,'prompt-control-v1/av-review.json'),limitation:'Reviewed first section only; continuations and full line still require actual AV review.'},null,2));
   console.log(JSON.stringify({status:'reused_reviewed_first_section',newGenerationCalls:0}));
   return{rawPath:retained.rawPath,attemptPath:retained.attemptPath,id:retained.id};
  };
  const daughterPrompt="A steady photorealistic speaking portrait of the single Papuan woman in the supplied Herodias's daughter continuation frame. Preserve her exact approved identity, gathered dark curls, opaque teal dress with secure neckline and cream shoulder drape, and warm palace entrance recess. Keep her full face visible and the camera locked in a16:9 landscape composition. She speaks the entire supplied Hatam audio performance. Her lips, jaw and facial movement follow the complete supplied audio performance at its original timing, including its pauses, pace and emphasis. Begin with the actual recording, without adding a preparatory performance or an invented delay. Her head movement is subtle and natural; blinking and breathing are restrained. When the recorded speech ends, her lips settle naturally and remain at rest. Preserve her attentive orientation toward her mother off-camera just camera-right; introduce no smile, dance or gesture. Keep every frame free of text, subtitles, captions, lettering, transcription, translations, titles, logos and graphic overlays. No additional people, dialogue, singing, music or invented vocal sounds. Preserve the supplied immediately preceding frame's pose, expression, framing, clothing and lighting without resetting the portrait. Keep the camera fixed and continue the same performance through its natural pause.";
  const sync=new LtxChainedSpeaking({dataDir:data,crop:{...input.crop,evidenceRef:join(dir,'framing-review.json')},performancePrompt:mode==='herod-v2'?control.prompt:mode==='daughter-v2'?daughterPrompt:undefined,generateSection});
  result=await sync.sync({characterId:actor.characterId,characterVersionId:actor.versionId},{path:actor.audio,startMs:0,endMs:actor.samples/actor.sampleRate*1000},{path:frame.path},
   {requestId:`mark6-representative-${mode}-20261104-v1`,authorizeSubmission:authorization,productionRevision:{runId:'representative-test-20261104',briefHash:'test-only-no-plan-approval'}});
 }
 writeFileSync(resultFile,JSON.stringify(result,null,2));
 writeFileSync(join(dir,'worker-status.json'),JSON.stringify({mode,pid:null,status:'returned_unreviewed',at:new Date().toISOString()}));console.log(JSON.stringify({mode,status:result.status,media:result.media}));
}catch(error){writeFileSync(join(dir,'worker-status.json'),JSON.stringify({mode,pid:null,status:'held_no_retry',error:String((error as Error).message),at:new Date().toISOString()}));throw error;}finally{db.close();sharedLtxTransport().reset();}
