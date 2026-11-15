// Existing production speaking stage, exact retained quote13. No new voice or paid fallback.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/daughter-demand-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='35d20b02-5771-45b3-9d44-27f92e2d518f',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Settled native boundary required, including for preparation');
const db=getDb(),data=getDataDir();
try{
 const preceding=read(root+'/complete-daughter-return-source-window-20261109/root-joined-review.json');if(preceding.status!=='root_reviewed_complete_daughter_return_source_window'||preceding.sourceClearThroughMs!==389227)throw Error('Complete precedingreturn actualnormal source reviewed required');
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/daughter-platter-request/preflight.json'),framing=read(root+'/speaking-framing/daughter-demand-actual-return-v1/framing-review.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==418608||pre.sampleRate!==48000||pre.plan.totalFrames!==210||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[83,43,84]'||!frame||frame.id!==framing.acceptedFrameAttemptId||framing.acceptedFrameAttemptId!==frame.id||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='422606d57a384e53d3594d7787d94a03dd49625b1aec93c63c37c88e30233216'||hash(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||hash(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==8721||hash(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='29f77f7ceed1a63d01c32d757a4cdf34ece7d223e19cdebf4c53c7283071664a'||binding.source_start_ms!==389227||binding.source_end_ms!==397948)throw Error('Exact current actualarrival DAUGHTERdemandframe/crop, original quote13/source/plan/binding required');
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Inspected native-coordinate DAUGHTERdemand crop changed');
 const prompt="One single young Papuan woman in this supplied close view actively speaks the complete supplied recording to Herod just offcamera IMAGE LEFT. Her lips visibly open, round and close and her jaw moves through each audible phrase with the recording. She pauses where the recording pauses and resumes speaking with it. Serious focused request, relaxed cheeks and level lip corners, naturally resting lips during quiet. Eyes comfortably open and attentive with brief ordinary blinks, small head motion. Actual recorded delivery governs urgency. Keep the same face, gathered curls with full visible hair margin, opaque finished teal neckline and sleeves, cream anatomical LEFT shoulder drape and current settled folds. She stays planted at the same royal-end floor mark with relaxed shoulders, hands outside picture. Same rectangular stone supports and softly focused open hall, fixed warm source and weaker bounce, steady exposure and white balance. Fixed camera, unobstructed eyes lips and jaw. One plain photographic take.";
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[389227,397948],sourceSamples48k:418608,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[83,43,84],fullLineFrames:210,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute')){console.log(JSON.stringify(preparation));}
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential and no retained prior speaking submission required; reconcile unknown jobs instead of retry');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:43},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let next=0;
  const section:typeof budget.section=async(request,deps)=>{
   const index=next++,manifest=join(request.directory,'..','line.json'),line=read(manifest);
   if(index>=3||line.plan.sampleCount!==418608||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash)throw Error('Actual complete DAUGHTERdemand source/section plan/current reference changed');
   if(index===0)writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:418608,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';let announced=false;
   while(true){
    let clear=index===0;
    if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.rawPath)!==c.rawSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual DAUGHTERdemand previous-section picture/carry clearance mismatch');clear=true;}
    const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
    if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
    if(!announced){const pending={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_daughter_demand_section_review_and_fresh_allowance',sectionIndex:index,previousSectionIndex:index-1,clearancePath:clearance,directory:request.directory};writeFileSync(folder+'/pending-section.json',JSON.stringify(pending,null,2));console.log(JSON.stringify(pending));announced=true;}await new Promise(r=>setTimeout(r,5000));
   }
   if(announced){const archived=folder+'/section-'+index+'-wait-before-clearance.json';if(existsSync(archived))throw Error('Existing DAUGHTERdemand wait archive requires inspection');renameSync(folder+'/pending-section.json',archived);}
   return budget.section({...request,seed:43},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:next,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
