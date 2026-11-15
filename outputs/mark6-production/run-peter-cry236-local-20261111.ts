// Deferred existing speech stage; retain original quote20, never request a voice.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/peter-cry236-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='b417c5b2-ac1f-470a-b6bc-eba854207c28',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),h=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const native=read(root+'/native-generation/execution.json');if(native.entries.length!==235||native.entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Actual settled235 boundary required');
const db=getDb(),data=getDataDir();
try{
 const prior=read(root+'/complete-alarm235-source-window-20261111/root-joined-review.json');if(prior.sourceClearThroughMs!==709631||!prior.av.all11Clear||!prior.actualAll118NormalAndFull117Viewed)throw Error('Actual accepted alarm235 source709631 required');
 const parent=read(root+'/complete-departure-alarm-parent-source-window-20261111/root-joined-review.json');if(parent.sourceClearThroughMs!==709631||parent.addsSourceCoverage!==false||!parent.av.all10Clear||parent.onscreenReleaseClaimed!==false||!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get(parent.av.receipt,project,parent.av.costUsd))throw Error('Actual complete sourceparent/contextAV156 knownreceipt required');
 const plan=requireCurrentPlan(db,data,project),pre=read(root+'/speaking-source-preflight/scene5-shot9-source-ready/preflight.json'),framing=read(root+'/speaking-framing/peter-cry177-v1/framing-review.json');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(plan.id!==pre.productionRunId||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||pre.fullLineSamples!==56112||pre.sampleRate!==48000||pre.plan.totalFrames!==29||JSON.stringify(pre.plan.sections.map((s:any)=>s.retainedFrames))!=='[29]'||!frame||frame.id!=='659a7c7c-7473-4b8b-bc6b-8df6425ff8c2'||frame.id!==framing.acceptedFrameAttemptId||framing.status!=='accepted_scene_specific_crop_for_native_trial'||framing.sourceFrameSha256!=='c76c1c3895b460e609f67d05023ad6975abb5df6d6883ec71b433a8aa83f79f4'||h(join(data,'assets',String(frame.result_asset_path)))!==framing.sourceFrameSha256||h(framing.preview)!==framing.previewSha256||!audio||audio.startMs!==0||audio.endMs!==1169||h(join(data,'assets',audio.path))!==pre.sourceSha256||pre.sourceSha256!=='75aff159f29114d47b009713aa886d1da3035f875035c0dda13612044dffe3a9'||binding.source_start_ms!==709631||binding.source_end_ms!==710800||binding.character_version_id!=='88e8eb71-6d59-4ba3-9e2b-b3e3ce544377')throw Error('Exact current177/crop/originalquote20/fullsource/binding required');
 for(const id of [prior.attemptId,frame.id])validateAttemptRevision(db,data,project,String(id));
 const crop=framing.crop;if(crop.x!==14||crop.y!==0||crop.width!==1252||crop.height!==704)throw Error('Reviewed crop changed');
 const prompt='ONE current mature Papuan Peter, seated low in SAME night boat portrait, speaks ONLY the complete supplied brief recording toward Jesus just SCREENRIGHT beside the lens. Mouth opens, rounds and closes with actual audio; rests during real quiet passages. Brief startled cry, actual recorded delivery governs intensity, no theatrical jaw stretching, extra gasp, smile, prolonged yell or added utterance. Restrained brow, cheeks and head, ordinary blink, supported settled shoulders, hands outside picture. Preserve same broad face, gray curls and full gray beard, bare head, cream clavi tunic and free rust shoulder mantle. Full hair contour and positive air above, both eyes, complete lips and jaw remain visible. Same dark cool sea/wooden boat/cloudy night background and wind, stable exposure/white balance. Fixed camera, no captions/extra person/ghost/glow/relight/boarding.';
 const preparation={at:new Date().toISOString(),status:'prepared_existing_stage_not_submitted',projectId:project,shotId:shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceMs:[709631,710800],sourceSamples48k:56112,sourceSha256:pre.sourceSha256,frameAttemptId:frame.id,frameSha256:framing.sourceFrameSha256,crop,prompt,retainedSectionFrames:[29],fullLineFrames:29,expectedFinalGlobalOutputPictures:Math.round(710800*24/1000)-Math.round(709631*24/1000),globalPictureAllocationNotPermissionToOmitAudio:true,newVoiceCallsAuthorized:0,paidFallback:false,wholeLineApproved:false};
 if(!process.argv.includes('--execute'))console.log(JSON.stringify(preparation));
 else{
  if(!process.env.LTX_TOKEN||existsSync(folder+'/execution-request.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Local credential/no prior speech submission required, reconcile unknown jobs');
  for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
  mkdirSync(folder,{recursive:true});writeFileSync(folder+'/execution-request.json',JSON.stringify({...preparation,at:new Date().toISOString(),pid:process.pid,status:'existing_stage_execution_requested',seed:65},null,2),{flag:'wx'});
  const budget=mark6NativeBudget(root);let count=0;
  const section:typeof budget.section=async(request,deps)=>{
   if(count++!==0)throw Error('Only one preflight speech section authorized');
   const manifest=join(request.directory,'..','line.json'),line=read(manifest),snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
   if(line.plan.sampleCount!==56112||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==framing.sourceFrameSha256||line.source.sourceSha256!==pre.sourceSha256||line.productionRevision.runId!==plan.id||line.productionRevision.briefHash!==plan.brief_hash||snapshot.source!=='actual_host_get_usage_limits'||snapshot.ordinaryUsageAllowed!==true||!Number.isFinite(age)||age<0||age>=60000||!Number.isFinite(snapshot.usedPercent)||snapshot.usedPercent>=95)throw Error('Actual full source/plan/frame/revision/fresh allowed allowance required');
   writeFileSync(folder+'/manifest-pointer.json',JSON.stringify({at:new Date().toISOString(),manifest,sourceSamples48k:56112,sourceSha256:pre.sourceSha256,frameSha256:framing.sourceFrameSha256,pid:process.pid},null,2),{flag:'wx'});
   return budget.section({...request,seed:65},deps);
  };
  const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,actualNewSectionCount:count,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
