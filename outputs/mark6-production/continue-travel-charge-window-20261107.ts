// Existing local speaking stage; follow an actually accepted native endpoint.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {reserveAvatarSpend,settleAvatarSpend,readPerformanceDirection,checkFilmSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',project='c457a815-d07d-4902-91b5-7b936b549856',window=Number(process.argv[2]),resumeUnsubmitted=process.argv.includes('--resume-unsubmitted');
if(![2,3].includes(window))throw Error('Explicit charge window2 or3 required');
const folder=root+`/speaking-execution/travel-charge-window${window}-native-continuation-20261107`,parentFolder=window===2?root+'/speaking-execution/travel-charge-window1-editorial-repair-20261107':root+'/speaking-execution/travel-charge-window2-native-continuation-20261107',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),db=getDb(),data=getDataDir();
try{
 const pre=read(root+`/speaking-source-preflight/jesus-travel-charge-window${window}/preflight.json`),shot=pre.shotId,parentId=read(parentFolder+'/result.json').attemptId,auth=productionAuthorization(db,data,project);
 validateAttemptRevision(db,data,project,parentId);
 const parent=db.prepare("SELECT shot_id,result_asset_path FROM generation_attempts WHERE id=? AND status='accepted' AND operation='lip_sync'").get(parentId),clip=db.prepare('SELECT id FROM clips WHERE generation_attempt_id=?').get(parentId);
 if(!parent||!clip)throw Error('Actual selected parent required before continuation');
 const parentRoot=dirname(join(data,'assets',String(parent.result_asset_path))),old=read(parentRoot+'/line.json'),proofPath=parentRoot+'/last-retained-native-carry.png.proof.json',proof=read(proofPath),tail=old.sections.at(-1);
 const binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),cv=binding&&db.prepare("SELECT character_id,locked_visual_facts FROM character_versions WHERE id=? AND status='approved'").get(String(binding.character_version_id)),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
 if(!binding||!cv||!audio||String(cv.character_id)!==old.character.characterId||String(binding.character_version_id)!==old.character.characterVersionId||JSON.stringify(cv.locked_visual_facts?JSON.parse(String(cv.locked_visual_facts)):undefined)!==JSON.stringify(old.character.lockedVisualFacts)||old.productionRevision.runId!==auth.runId||old.productionRevision.briefHash!==auth.briefHash||pre.productionRunId!==auth.runId||old.outputSha256!==hash(join(parentRoot,'candidate.mp4'))||proof.attemptId!==parentId||proof.lineOutputSha256!==old.outputSha256||proof.kind!=='actual_last_retained_native_frame_projection'||proof.exactFacePixelsUnchanged!==true||hash(proof.endingImagePath)!==proof.endingImageSha256||hash(tail.rawPath)!==proof.sourceRawSha256||tail.rawSha256!==proof.sourceRawSha256||tail.lastRetainedFrameIndex!==proof.nativeFrameIndex||JSON.stringify(old.crop)!==JSON.stringify(proof.crop)||hash(join(data,'assets',audio.path))!==old.source.sourceSha256||old.source.sourceEndSample!==pre.startSample||Math.round(audio.startMs*48)!==pre.startSample||Math.round(audio.endMs*48)!==pre.endSample||pre.sourceSha256!==old.source.sourceSha256||Number(binding.source_start_ms)!==Number(pre.binding.source_start_ms)||Number(binding.source_end_ms)!==Number(pre.binding.source_end_ms))throw Error('Exact current source/canon/revision/native endpoint mismatch');
 if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'").get(shot)||(existsSync(folder)&&!resumeUnsubmitted)||read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Existing attempt or active native request must be reconciled');
 if(!process.argv.includes('--execute')||!process.env.LTX_TOKEN)throw Error('Explicit local execution required');
 const origin=window===2?old.reference:old.continuationFromAcceptedWindow?.originalKeyframe;
 if(!origin?.path||!origin?.sha256||hash(join(data,'assets',origin.path))!==origin.sha256)throw Error('Actual original accepted image lineage required');
 const key=db.prepare("SELECT id FROM generation_attempts WHERE id='a8063208-91f9-44a4-a99b-7e32c6c45203' AND result_asset_path=? AND status='accepted'").get(origin.path);
 if(!key)throw Error('Original accepted charge image authority changed');
 const originalRequest=read(root+'/speaking-execution/charge-window1-active-articulation-recovery-20261107/request.json'),append=originalRequest.remainingSectionOverrides.find((s:any)=>s.index===4)?.append;
 const locked=String(old.character.lockedVisualFacts?.description??'');
 const firstLine=read(join(data,'assets/generated/lip-sync/ltx-charge-window1-active-articulation-recovery-20261107/line.json'));
 if(!String(append).includes('lips and jaw visibly articulate')||(locked&&!firstLine.prompt.endsWith(' '+locked)))throw Error('Established exact base prompt/direction required');
 const performancePrompt=(locked?firstLine.prompt.slice(0,-locked.length-1):firstLine.prompt)+append;
 const preAudio=root+`/speaking-source-preflight/jesus-travel-charge-window${window}/full-line.wav`,stream=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',preAudio],{encoding:'utf8',windowsHide:true})).streams.find((s:any)=>s.codec_type==='audio');
 if(hash(preAudio)!==pre.lineSha256||stream.sample_rate!=='48000'||Number(stream.duration_ts)!==pre.fullLineSamples||![1,2].includes(stream.channels))throw Error('Exact measured preflight source required');
 const pcmHash=(path:string,duplicateMono=false)=>createHash('sha256').update(execFileSync('ffmpeg',['-v','error','-i',path,...(duplicateMono?['-af','pan=stereo|c0=c0|c1=c0']:[]),'-f','s16le','-c:a','pcm_s16le','-'],{windowsHide:true,maxBuffer:5*1024*1024})).digest('hex'),expectedStereoPcmSha256=pcmHash(preAudio,stream.channels===1);
 checkFilmSpend(db,project,0);auth.assertCurrent();mkdirSync(folder,{recursive:true});
 const stopped=resumeUnsubmitted?read(folder+'/preflight.json'):undefined;
 const reservation=stopped?.reservationId??reserveAvatarSpend(db,project,shot,0),requestId=stopped?.requestId??reservation+`-travel-charge-window${window}-20261107`,continuation={kind:'accepted_native_ending_frame',parentAttemptId:parentId,parentShotId:parent.shot_id,parentClipId:clip.id,parentVideoSha256:old.outputSha256,endingProofPath:proofPath,endingProofSha256:hash(proofPath),endingImagePath:proof.endingImagePath,endingImageSha256:proof.endingImageSha256,sourceBoundarySample:pre.startSample,originalKeyframe:origin,originalKeyframeAttemptId:key.id,productionRevision:old.productionRevision};
 let resumeManifestSha256:string|undefined;
 if(stopped){
  const heldPath=join(data,'assets/generated/lip-sync/ltx-'+requestId+'/line.json'),held=read(heldPath),pending=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation);
  if(!pending||JSON.parse(String(pending.payload)).shotId!==shot||JSON.parse(String(pending.payload)).upperBoundUsd!==0||db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='settle_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation)||held.status!=='held_reconcile_before_retry'||held.sections.length!==0||held.error!=='Exact prepared stereo source/plan/reference changed'||JSON.stringify(stopped.continuation)!==JSON.stringify(continuation)||read(root+'/native-generation/execution.json').entries.some((e:any)=>String(e.id).includes(requestId))||pcmHash(dirname(heldPath)+'/full-line.wav')!==expectedStereoPcmSha256)throw Error('Exact unsubmitted mono/stereo guard hold and same pending reservation required');
  resumeManifestSha256=hash(heldPath);writeFileSync(folder+'/unsubmitted-resume.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,requestId,reservationId:reservation,resumeManifestSha256,priorProviderSubmissions:0,originalPreflightChannels:stream.channels,expectedStereoPcmSha256,samplesUnchanged:true,sourceTimingUnchanged:true},null,2),{flag:'wx'});
 }else writeFileSync(folder+'/preflight.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,shotId:shot,reservationId:reservation,requestId,audio,preflight:pre,continuation,maximumNewNativeSections:pre.plan.sections.length,expectedStereoPcmSha256,wholeQuotationApproved:false,paidFallback:false},null,2),{flag:'wx'});
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 const budget=mark6NativeBudget(root);let index=0;
 const section:typeof budget.section=async(request,deps)=>{
  const part=index++,manifestPath=join(request.directory,'..','line.json'),m=read(manifestPath);
  if(part>=pre.plan.sections.length||JSON.stringify(m.plan)!==JSON.stringify(pre.plan)||m.reference.sha256!==proof.endingImageSha256||m.source.sourceSha256!==pre.sourceSha256||m.source.sourceStartSample!==pre.startSample||m.source.sourceEndSample!==pre.endSample||pcmHash(join(request.directory,'..','full-line.wav'))!==expectedStereoPcmSha256)throw Error('Exact prepared stereo source/plan/reference changed');
  let announced=false;
  while(true){
   let clear=part===0;const clearance=folder+`/section-${part-1}-continuation-clearance.json`;
   if(part>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifestPath).sections[part-1];if(c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==hash(previous.carryImagePath)||c.pictureSha256!==hash(previous.picturePath))throw Error('Actual preceding section continuation review mismatch');clear=true;}
   const q=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(q.observedAt);
   if(clear&&q.source==='actual_host_get_usage_limits'&&q.ordinaryUsageAllowed===true&&Number.isFinite(q.usedPercent)&&q.usedPercent>=0&&q.usedPercent<=100&&age>=0&&age<60000)break;
   if(!announced){const state={at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_charge_section_review_and_fresh_allowance',directory:request.directory,previousSectionIndex:part-1,clearanceRequired:part>0,clearancePath:clearance};writeFileSync(folder+'/pending-section.json',JSON.stringify(state,null,2));console.log(JSON.stringify(state));announced=true;}await new Promise(r=>setTimeout(r,5000));
  }
  return budget.section({...request,seed:43},deps);
 };
 const result=await new LtxChainedSpeaking({dataDir:data,crop:old.crop,performancePrompt,resumeManifestSha256,generateSection:section}).sync(old.character,audio,{path:relative(join(data,'assets'),proof.endingImagePath)},{requestId,authorizeSubmission:auth.assertCurrent,productionRevision:old.productionRevision,avatarDirection:readPerformanceDirection(db,project,shot)});
 if(!result.media||result.provenance.provider!=='ltx_local'||result.cost.usd!==0||index!==pre.plan.sections.length)throw Error('Actual completed zero-dollar local continuation required');
 const manifestPath=join(data,'assets',result.media.path,'..','line.json'),m=read(manifestPath);m.continuationFromAcceptedWindow=continuation;writeFileSync(manifestPath,JSON.stringify(m,null,2));auth.assertCurrent();
 const id=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,'lip_sync',?,'hold_for_review',?,0,?)").run(id,shot,result.provenance.provider,result.provenance.model,result.provenance.prompt,result.media.path,now);
  db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,id,now);settleAvatarSpend(db,project,reservation,id);bindAttemptRevision(db,project,id,auth);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,reservationId:reservation,result,continuation,wholeQuotationApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify({status:'actual_complete_charge_continuation_held_for_av',attemptId:id,media:result.media}));
}finally{sharedLtxTransport().reset();db.close();}
