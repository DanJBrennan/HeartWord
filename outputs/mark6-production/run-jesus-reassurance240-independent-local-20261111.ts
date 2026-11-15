// Deferred existing speech stage; retain original quote21, never request a voice.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/jesus-reassurance240-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='87935174-7179-4282-8e94-306b24cbaa62',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),h=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const native=read(root+'/native-generation/execution.json');if(native.entries.length!==239||native.entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Actual settled239 boundary required');
const db=getDb(),data=getDataDir();
try{
 // Generation of this separately approved utterance does not accept239 or depend on its AV result.
 const prior=read(root+'/complete-terror238-source-window-20261111/root-joined-review.json'),held=read(root+'/complete-andrew-james-terror239-source-window-20261111/review-preparation-proof.json');if(prior.sourceClearThroughMs!==715800||!prior.av.all10Clear||!prior.actualAll120NormalAndFull119Viewed||JSON.stringify(held.sourceWindowMs)!=='[715800,719307]'||held.frames!==84||h(held.raw)!==held.rawSha256||held.attemptId!=='f0a51985-3014-4532-a68c-f31be3b91da2')throw Error('Actualaccepted238/currentreturned239/independent approvedutterance required');
 validateAttemptRevision(db,data,project,held.attemptId);


 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/scene5-shot12-source-ready/preflight.json'),framing=read(root+'/speaking-framing/jesus-reassurance181-v1/framing-review.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==186768||pre.sampleRate!==48000||pre.plan.totalFrames!==94||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[94]'||!frame||frame.id!=='1fe269a7-4fbf-4ddd-a357-2843a9f9391b'||frame.id!==framing.acceptedFrameAttemptId||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='1bf69f496868bf78c40dcc7c01a6609daea90924ca74a286a646999b8737dd5e'||h(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||h(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==3891||h(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='9c69e913306b847fd8e48f9e732d2a1aac779b95e94fded5aa218211e819d415'||binding.source_start_ms!==719307||binding.source_end_ms!==723198||binding.character_version_id!=='4e23012c-a74d-4e63-b4ae-a63d6847a02a')throw Error('Exact current181/crop/originalquote21/fullsource/binding required');
 for(const id of [prior.attemptId,frame.id])validateAttemptRevision(db,data,project,String(id));
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Reviewed crop changed');
 const prompt='ONE current Papuan Jesus, steady upright outside the boat on the SAME dark cool sea portrait, speaks ONLY complete supplied recording to disciples just SCREENLEFT beside lens. Calm firm reassurance, ordinary natural mouth articulation governed by actual Hatam audio. Mouth rests/closes during real quiet passages; no theatrical jaw stretch, extra gasp/cry, smile, added words or broad head-brow-cheek performance. Small ordinary blink, settled shoulders, hands outside picture. Same mature face, long dark curls and full beard, cream FRONT-slit tunic, indigo layer and free cream mantle/brown tie. Keep full hair contour and positive upper air, both eyes and complete lips/jaw visible. Same natural dark cool sea/cloudy fourth-watch sky/hills, wind RIGHT-to-LEFT moving free hair/cloth; stable exposure and white balance. Fixed camera/scale, no captions/extra actor/ghost/glow/relight/boatboarding/gesture/zoom/pan/loop/freeze.';
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',independentLocalGenerationOnly:true,prior239NotAccepted:true,knownReviewedSourceClearThroughMs:715800,heldSourceMs:[715800,719307],newPaidReviewVoiceAlignmentCalls:0,projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[719307,723198],sourceSamples48k:186768,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[94],fullLineFrames:94,expectedFinalGlobalOutputPictures:Math.round(723198*24/1000)-Math.round(719307*24/1000),globalPictureAllocationNotPermissionToOmitAudio:true,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute'))console.log(JSON.stringify(preparation));
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential/no prior speech submission required, reconcile unknown jobs');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:65},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let count=0;
  const section:typeof budget.section=async(request,deps)=>{
   if(count++!==0)throw Error('Only one preflight speech section authorized');
   const manifest=join(request.directory,'..','line.json'),line=read(manifest),snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
   if(line.plan.sampleCount!==186768||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash||snapshot.source!=='actual_host_get_usage_limits'||snapshot.ordinaryUsageAllowed!==true||!Number.isFinite(age)||age<0||age>=60000||!Number.isFinite(snapshot.usedPercent)||snapshot.usedPercent>=95)throw Error('Actual full source/plan/frame/revision/fresh allowed allowance required');
   writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:186768,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   return budget.section({...request,seed:65},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:count,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
