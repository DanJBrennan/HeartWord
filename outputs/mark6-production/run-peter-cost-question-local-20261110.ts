// Existing production speaking stage, exact retained quote17. No new voice or paid fallback.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/peter-cost-question-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='7fe4c536-ee13-466d-88e7-f75a6c5e2bb6',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Settled native boundary required, including for preparation');
const db=getDb(),data=getDataDir();
try{
 const preceding=read(root+'/complete-peter-cost-reaction-native181-range0-91-source-window-20261110/root-joined-review.json');if(preceding.status!=='root_reviewed_actual_selected91_peter_cost_reaction_source_and_normal'||preceding.sourceClearThroughMs!==553152.5||!preceding.av.all10Clear||!preceding.all91NormalDecodedPicturesIdenticalToReviewedPicture)throw Error('Complete precedingreturn actualnormal source reviewed required');
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/scene4-shot17-source-ready/preflight.json'),framing=read(root+'/speaking-framing/peter-cost-question-v1/framing-review.json');
 const reuse=read(root+'/keyframes/peter-cost-question-actual-reaction-ending-reuse-20261110-v1/reuse.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==429480||pre.sampleRate!==48000||pre.plan.totalFrames!==215||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[78,71,66]'||!frame||frame.id!==framing.acceptedFrameAttemptId||framing.acceptedFrameAttemptId!==frame.id||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='c4926b7162550f61f2ab860f72a0394efb98605bf14c4ad1ab36750548c4f1bf'||hash(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||hash(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==8947.5||hash(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='8b9a26ddca76fe3379488ee2602806136e479967beef67f0092c96ac1f114251'||binding.source_start_ms!==553152.5||binding.source_end_ms!==562100)throw Error('Exact current reaction-ending PETERcostquestionframe/crop, original quote17/source/plan/binding required');
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Inspected native-coordinate PETERcostquestion crop changed');
 const prompt="One single Papuan man Peter in this supplied settled shoreline portrait actively speaks the complete supplied recording to Jesus just SCREENRIGHT beside the lens. His lips visibly open, round and close and his jaw articulates every audible phrase with the recording. He rests his mouth at the actual quiet passages and resumes with the audio. Earnest cost question with plain measured conversational practical concern, no imposed grin, comic disbelief or anger, relaxed brow and cheeks, level lip corners, modest natural articulation. Actual recorded delivery governs expression. Eyes attentive toward Jesus with brief ordinary blinks and small natural head movement, upright settled shoulders, hands outside picture. Keep same mature broad face, salt-and-pepper curls/full grey beard/bare head, full hair contour and visible top margin, cream clavi tunic and rust shoulder mantle with current folds. Soft distant inland crowd stays indistinct and quiet, same green grass/palms/hills/daylight, steady exposure and white balance. Fixed camera, unobstructed eyes lips jaw. One plain photographic take.";
 if(binding.character_version_id!=='88e8eb71-6d59-4ba3-9e2b-b3e3ce544377'||frame.id!==reuse.imported.attemptId)throw Error('Exact accepted reaction ending and current Peter voice required');
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[553152.5,562100],sourceSamples48k:429480,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[78,71,66],fullLineFrames:215,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute')){console.log(JSON.stringify(preparation));}
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential and no retained prior speaking submission required; reconcile unknown jobs instead of retry');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:43},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let next=0;
  const section:typeof budget.section=async(request,deps)=>{
   const index=next++,manifest=join(request.directory,'..','line.json'),line=read(manifest);
   if(index>=3||line.plan.sampleCount!==429480||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash)throw Error('Actual complete PETERcostquestion source/section plan/current reference changed');
   if(index===0)writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:429480,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';let announced=false;
   while(true){
    let clear=index===0;
    if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.rawPath)!==c.rawSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual PETERcostquestion previous-section picture/carry clearance mismatch');clear=true;}
    const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
    if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
    if(!announced){const pending={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_peter_cost_question_section_review_and_fresh_allowance',sectionIndex:index,previousSectionIndex:index-1,clearancePath:clearance,directory:request.directory};writeFileSync(folder+'/pending-section.json',JSON.stringify(pending,null,2));console.log(JSON.stringify(pending));announced=true;}await new Promise(r=>setTimeout(r,5000));
   }
   if(announced){const archived=folder+'/section-'+index+'-wait-before-clearance.json';if(existsSync(archived))throw Error('Existing PETERcostquestion wait archive requires inspection');renameSync(folder+'/pending-section.json',archived);}
   return budget.section({...request,seed:43},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:next,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
