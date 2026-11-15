// Existing production speaking stage, exact retained quote19. No new voice or paid fallback.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/peter-inventory-report-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='c36d4734-296c-421d-b477-759a15867d88',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Settled native boundary required, including for preparation');
const db=getDb(),data=getDataDir();
try{
 const preceding=read(root+'/complete-food-inspection-source-window-20261110/root-joined-review.json');if(preceding.status!=='root_reviewed_actual_food_inspection_first140_source_and_normal'||preceding.sourceClearThroughMs!==575921||!preceding.av.all10Clear||!preceding.all140NormalDecodedPicturesIdenticalToReviewedPicture)throw Error('Complete precedingreturn actualnormal source reviewed required');
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/scene4-shot21-source-ready/preflight.json'),framing=read(root+'/speaking-framing/peter-inventory-report-v1/framing-review.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==177258||pre.sampleRate!==48000||pre.plan.totalFrames!==89||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[89]'||!frame||frame.id!==framing.acceptedFrameAttemptId||framing.acceptedFrameAttemptId!==frame.id||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='6daa9074f11e1950e91f8a65468c633f4aeae202e67b7527821521c5cfcf96fe'||hash(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||hash(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==3692.875||hash(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='0a4f136c67808f4d2e4f3b39fee788a8a836b1c2a3fa1156c91f3469eec06411'||binding.source_start_ms!==575921||binding.source_end_ms!==579613.875)throw Error('Exact current reaction-ending Peterinventoryreportframe/crop, original quote19/source/plan/binding required');
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Inspected native-coordinate Peterinventoryreport crop changed');
 const prompt="One single mature Papuan man Peter in this supplied settled portrait speaks the complete supplied short recording to Jesus just RIGHT beside the lens. Lips and jaw articulate each audible phrase with natural Hatam speech motion; mouth rests at real quiet, no new delay. Calm factual report with level lip corners, relaxed brow and cheeks, no imposed smile, nod, recounting gesture, food contact or posture reset. Remain in same balanced lowcrouch below crop, shoulders settled; hands outside picture. Same mature broad face, saltpepper tight curls, full grey beard, bare head, cream clavi tunic and rust shoulder mantle folds. Both eyes, mouth, jaw and full crown readable with generous top margin. Ordinary blinks and small natural head motion, attentive RIGHT offlens eyeline. Same green inland gathering, palms, daylight and white balance; static camera and steady scale. One plain photographic take.";

 if(binding.character_version_id!=='88e8eb71-6d59-4ba3-9e2b-b3e3ce544377'||frame.id!=='62130817-82ec-4304-ad8e-fbbe14686378')throw Error('Exact accepted reaction ending and current Jesus voice required');
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[575921,579613.875],sourceSamples48k:177258,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[89],fullLineFrames:89,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute')){console.log(JSON.stringify(preparation));}
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential and no retained prior speaking submission required; reconcile unknown jobs instead of retry');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:43},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let next=0;
  const section:typeof budget.section=async(request,deps)=>{
   const index=next++,manifest=join(request.directory,'..','line.json'),line=read(manifest);
   if(index>=1||line.plan.sampleCount!==177258||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash)throw Error('Actual complete Peterinventoryreport source/section plan/current reference changed');
   if(index===0)writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:177258,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';let announced=false;
   while(true){
    let clear=index===0;
    if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.rawPath)!==c.rawSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual Peterinventoryreport previous-section picture/carry clearance mismatch');clear=true;}
    const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
    if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
    if(!announced){const pending={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_peter_inventory_report_section_review_and_fresh_allowance',sectionIndex:index,previousSectionIndex:index-1,clearancePath:clearance,directory:request.directory};writeFileSync(folder+'/pending-section.json',JSON.stringify(pending,null,2));console.log(JSON.stringify(pending));announced=true;}await new Promise(r=>setTimeout(r,5000));
   }
   if(announced){const archived=folder+'/section-'+index+'-wait-before-clearance.json';if(existsSync(archived))throw Error('Existing Peterinventoryreport wait archive requires inspection');renameSync(folder+'/pending-section.json',archived);}
   return budget.section({...request,seed:43},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:next,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
