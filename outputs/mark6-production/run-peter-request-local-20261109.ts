// Existing production speaking stage, exact retained quote15. No new voice or paid fallback.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/peter-request-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='5853deb0-d835-4464-9e81-bc0062d396c4',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Settled native boundary required, including for preparation');
const db=getDb(),data=getDataDir();
try{
 const preceding=read(root+'/complete-reused-jesus-before-peter-source-window-20261109/root-joined-review.json');if(preceding.status!=='root_reviewed_actual21_reused_jesus_before_peter_in_actual_approach_context'||preceding.sourceClearThroughMs!==530993.5||!preceding.av.all14Clear||!preceding.all21NormalDecodedPicturesIdenticalToSelectedPicture)throw Error('Complete precedingreturn actualnormal source reviewed required');
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/scene4-shot13-source-ready/preflight.json'),framing=read(root+'/speaking-framing/peter-request-v1/framing-review.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==632568||pre.sampleRate!==48000||pre.plan.totalFrames!==317||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[64,63,63,46,81]'||!frame||frame.id!==framing.acceptedFrameAttemptId||framing.acceptedFrameAttemptId!==frame.id||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='ae058dfa8f90a2ad098521c0e7a2b42031d4986ffddfd0122abbb4400f60e206'||hash(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||hash(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==13178.5||hash(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='cdc95e8df9bfd519f2f17b69bab49b8dee26a9872c09006817208e1a11437e5f'||binding.source_start_ms!==530993.5||binding.source_end_ms!==544172)throw Error('Exact current actualarrival PETERrequestframe/crop, original quote15/source/plan/binding required');
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Inspected native-coordinate PETERrequest crop changed');
 const prompt="One single Papuan man Peter in this supplied settled shoreline portrait actively speaks the complete supplied recording to Jesus just SCREENRIGHT beside the lens. His lips visibly open, round and close and his jaw articulates every audible phrase with the recording. He rests his mouth at the actual quiet passages and resumes with the audio. Plain measured conversational practical concern, relaxed brow and cheeks, level lip corners, modest natural articulation. Actual recorded delivery governs expression. Eyes attentive toward Jesus with brief ordinary blinks and small natural head movement, upright settled shoulders, hands outside picture. Keep same mature broad face, salt-and-pepper curls/full grey beard/bare head, full hair contour and visible top margin, cream clavi tunic and rust shoulder mantle with current folds. Soft distant inland crowd stays indistinct and quiet, same green grass/palms/hills/daylight, steady exposure and white balance. Fixed camera, unobstructed eyes lips jaw. One plain photographic take.";
 if(binding.character_version_id!=='88e8eb71-6d59-4ba3-9e2b-b3e3ce544377'||frame.id!=='9fe6db26-a6b4-4237-a83c-06f147f20824')throw Error('Exact accepted listener ending and current Jesus voice required');
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[530993.5,544172],sourceSamples48k:632568,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[64,63,63,46,81],fullLineFrames:317,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute')){console.log(JSON.stringify(preparation));}
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential and no retained prior speaking submission required; reconcile unknown jobs instead of retry');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:43},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let next=0;
  const section:typeof budget.section=async(request,deps)=>{
   const index=next++,manifest=join(request.directory,'..','line.json'),line=read(manifest);
   if(index>=5||line.plan.sampleCount!==632568||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash)throw Error('Actual complete PETERrequest source/section plan/current reference changed');
   if(index===0)writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:632568,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';let announced=false;
   while(true){
    let clear=index===0;
    if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.rawPath)!==c.rawSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual PETERrequest previous-section picture/carry clearance mismatch');clear=true;}
    const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
    if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
    if(!announced){const pending={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_peter_request_section_review_and_fresh_allowance',sectionIndex:index,previousSectionIndex:index-1,clearancePath:clearance,directory:request.directory};writeFileSync(folder+'/pending-section.json',JSON.stringify(pending,null,2));console.log(JSON.stringify(pending));announced=true;}await new Promise(r=>setTimeout(r,5000));
   }
   if(announced){const archived=folder+'/section-'+index+'-wait-before-clearance.json';if(existsSync(archived))throw Error('Existing PETERrequest wait archive requires inspection');renameSync(folder+'/pending-section.json',archived);}
   return budget.section({...request,seed:43},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:next,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
