// Existing production speaking stage, exact retained quote09. No new voice or paid fallback.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/herod-offer-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='6dd65d3f-fbb0-4e61-9a81-7a44dd636b87',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Settled native boundary required, including for preparation');
const db=getDb(),data=getDataDir();
try{
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/herod-banquet-offer/preflight.json'),framing=read(root+'/speaking-framing/herod-offer-v1/framing-review.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==264528||pre.sampleRate!==48000||pre.plan.totalFrames!==133||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[67,66]'||!frame||frame.id!=='729dee38-0562-4fc6-bb3c-9a526cf680eb'||framing.acceptedFrameAttemptId!==frame.id||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='cf8f38b0b12417291f03a894c6eb290ffb6f547bc060047eaf1f7402ba75d409'||hash(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||hash(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==5511||hash(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='5c5cb00c0707ffd02a1986a35c5d52c4f37a32b2ead34e3ca92a46e3f7c7e727'||binding.source_start_ms!==340954||binding.source_end_ms!==346465)throw Error('Exact current accepted96 frame/crop, original quote09/source/plan/binding required');
 const crop=framing.crop;if(crop.x!==112||crop.y!==0||crop.width!==1056||crop.height!==594)throw Error('Inspected native-coordinate HerodOFFER crop changed');
 const prompt='One single mature Papuan man seated in this supplied royal close view is actively speaking the complete supplied recording. His lips visibly open, round and close and his jaw moves through every audible phrase in time with the recording. He pauses where the recording pauses, then resumes articulation. His expression is pleased and attentive, with comfortably open eyes, relaxed brow and cheeks, and minimal head movement. Preserve the same salt-and-pepper curls and beard, bare head, finished cream bound neckline, burgundy mantle with narrow gold edging, supported seated posture and slight image-left eyeline toward the offcamera daughter. His hands remain low below the picture. Same royal chair posts, burgundy curtain, rectangular stone piers, warm hall-left light and weaker bounce. Fixed camera and full visible hair, unobstructed eyes, mouth and jaw. One plain photographic take.';
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[340954,346465],sourceSamples48k:264528,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[67,66],fullLineFrames:133,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute')){console.log(JSON.stringify(preparation));}
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential and no retained prior speaking submission required; reconcile unknown jobs instead of retry');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:43},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let next=0;
  const section:typeof budget.section=async(request,deps)=>{
   const index=next++,manifest=join(request.directory,'..','line.json'),line=read(manifest);
   if(index>=2||line.plan.sampleCount!==264528||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash)throw Error('Actual complete HerodOFFER source/section plan/current reference changed');
   const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';let announced=false;
   while(true){
    let clear=index===0;
    if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.rawPath)!==c.rawSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual HerodOFFER previous-section picture/carry clearance mismatch');clear=true;}
    const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
    if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
    if(!announced){const pending={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_herod_offer_section_review_and_fresh_allowance',sectionIndex:index,previousSectionIndex:index-1,clearancePath:clearance,directory:request.directory};writeFileSync(folder+'/pending-section.json',JSON.stringify(pending,null,2));console.log(JSON.stringify(pending));announced=true;}await new Promise(r=>setTimeout(r,5000));
   }
   if(announced){const archived=folder+'/section-'+index+'-wait-before-clearance.json';if(existsSync(archived))throw Error('Existing HerodOFFER wait archive requires inspection');renameSync(folder+'/pending-section.json',archived);}
   return budget.section({...request,seed:43},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:next,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
