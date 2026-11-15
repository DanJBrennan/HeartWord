// Existing production speaking stage, exact retained quote18. No new voice or paid fallback.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/jesus-inventory-question-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='24b0dc46-6b1e-41d1-966c-2b3d3d16c643',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Settled native boundary required, including for preparation');
const db=getDb(),data=getDataDir();
try{
 const preceding=read(root+'/complete-jesus-inventory-intro-native185-range52-121-source-window-20261110/root-joined-review.json');if(preceding.status!=='root_reviewed_actual_selected69_jesus_inventory_intro_source_and_normal'||preceding.sourceClearThroughMs!==564966.5||!preceding.av.all10Clear||!preceding.all69NormalDecodedPicturesIdenticalToReviewedPicture)throw Error('Complete precedingreturn actualnormal source reviewed required');
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/scene4-shot19-source-ready/preflight.json'),framing=read(root+'/speaking-framing/jesus-inventory-question-v1/framing-review.json');
 const reuse=read(root+'/keyframes/jesus-inventory-question-actual-intro185-ending-reuse-20261110-v1/reuse.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==246408||pre.sampleRate!==48000||pre.plan.totalFrames!==124||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[73,51]'||!frame||frame.id!==framing.acceptedFrameAttemptId||framing.acceptedFrameAttemptId!==frame.id||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!==preceding.ending.sha256||hash(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||hash(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==5133.5||hash(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='3dc94f7412701027988cffbaead286dd1851e9c81e64eb18cca4b4ef16ffdbe1'||binding.source_start_ms!==564966.5||binding.source_end_ms!==570100)throw Error('Exact current reaction-ending Jesusinventoryquestionframe/crop, original quote18/source/plan/binding required');
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Inspected native-coordinate Jesusinventoryquestion crop changed');
 const prompt="One single Papuan man Jesus in this supplied settled shoreline portrait actively speaks the complete supplied recording to Peter just LEFT beside the lens. His lips visibly open, round and close and jaw articulates every audible phrase with the recording; mouth rests at actual quiet and resumes with the audio. Composed measured conversational practical instruction; question and command form one uninterrupted performance. Actual recorded delivery governs expression, relaxed brow and cheeks, level lip corners, modest natural articulation. Eyes attentive toward Peter with ordinary blinks and small natural head motion, upright settled shoulders and empty hands outside picture. Same face/dark shoulder waves/full beard/full crown with visible top margin, cream FRONT central slit neckline/indigo bands/cream mantle/current folds. Same water/green shoreline/hills/daylight, steady exposure/white balance, fixed camera/scale. Eyes lips jaw unobstructed. One plain photographic take.";
 if(binding.character_version_id!=='4e23012c-a74d-4e63-b4ae-a63d6847a02a'||frame.id!==reuse.imported.attemptId)throw Error('Exact accepted reaction ending and current Jesus voice required');
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[564966.5,570100],sourceSamples48k:246408,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[73,51],fullLineFrames:124,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute')){console.log(JSON.stringify(preparation));}
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential and no retained prior speaking submission required; reconcile unknown jobs instead of retry');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:43},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let next=0;
  const section:typeof budget.section=async(request,deps)=>{
   const index=next++,manifest=join(request.directory,'..','line.json'),line=read(manifest);
   if(index>=2||line.plan.sampleCount!==246408||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash)throw Error('Actual complete Jesusinventoryquestion source/section plan/current reference changed');
   if(index===0)writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:246408,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';let announced=false;
   while(true){
    let clear=index===0;
    if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.rawPath)!==c.rawSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual Jesusinventoryquestion previous-section picture/carry clearance mismatch');clear=true;}
    const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
    if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
    if(!announced){const pending={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_jesus_inventory_question_section_review_and_fresh_allowance',sectionIndex:index,previousSectionIndex:index-1,clearancePath:clearance,directory:request.directory};writeFileSync(folder+'/pending-section.json',JSON.stringify(pending,null,2));console.log(JSON.stringify(pending));announced=true;}await new Promise(r=>setTimeout(r,5000));
   }
   if(announced){const archived=folder+'/section-'+index+'-wait-before-clearance.json';if(existsSync(archived))throw Error('Existing Jesusinventoryquestion wait archive requires inspection');renameSync(folder+'/pending-section.json',archived);}
   return budget.section({...request,seed:43},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:next,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
