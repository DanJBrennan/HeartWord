// Recover the actual unfinished production reservation. The failed first native
// take is retained and counted, not reused or reported as a complete performance.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {readPerformanceDirection,checkAvatarSpend,settleAvatarSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {mark6NativeBudget} from './native-budget.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/spokesperson-window1-headroom-recovery-v2',project='c457a815-d07d-4902-91b5-7b936b549856',shot='1a3ecc10-00c7-4d1f-b0bc-0b276f4f1045',reservation='7f55234a-d919-4952-8c40-79d158df5a2b',requestId=reservation+'-headroom-recovery-v2';
const db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const originalRoot=join(data,'assets/generated/lip-sync/ltx-'+reservation),line=read(originalRoot+'/line.json'),prefix=line.sections[0],oldAttempt=read(originalRoot+'/attempt-0/attempt.json'),stop=read(root+'/speaking-execution/spokesperson-questions-window1-v1/worker-stop-for-source-framing-repair.json');
const auth=productionAuthorization(db,data,project),binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),cv=binding&&db.prepare("SELECT character_id,locked_visual_facts,voice_id FROM character_versions WHERE id=? AND status='approved'").get(String(binding.character_version_id)),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
const pending=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=? AND NOT EXISTS(SELECT 1 FROM edit_commands s WHERE s.project_id=? AND s.command_type='settle_avatar_spend' AND json_extract(s.payload,'$.reservationId')=?)").get(project,reservation,project,reservation);
const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate' AND status='accepted'").get('9d7bdce6-1b9c-4c24-8f72-707adaa02c4b',shot);
if(!binding||!cv||!audio||!pending||!frame?.result_asset_path||JSON.parse(String(pending.payload)).upperBoundUsd!==0||JSON.parse(String(pending.payload)).shotId!==shot||line.sections.length!==1||line.plan.sampleCount!==874000||line.plan.sections.length!==6||prefix.retainedFrames!==86||prefix.sourceStartSample!==0||prefix.sourceEndSample!==172000||stop.pid!==492408||stop.pendingNative!==0||stop.status!=='stopping_waiting_worker_before_second_native_request'||oldAttempt.status!=='downloaded_unreviewed'||oldAttempt.apiCostUsd!==0||hash(prefix.rawPath)!==prefix.rawSha256||prefix.rawSha256!==oldAttempt.rawSha256)throw Error('Stopped actual first section and unfinished zero-dollar reservation required');
const facts=cv.locked_visual_facts?JSON.parse(String(cv.locked_visual_facts)):undefined;
if(auth.runId!==line.productionRevision.runId||auth.briefHash!==line.productionRevision.briefHash||String(cv.character_id)!==line.character.characterId||String(binding.character_version_id)!==line.character.characterVersionId||JSON.stringify(facts)!==JSON.stringify(line.character.lockedVisualFacts)||hash(join(data,'assets',audio.path))!==line.source.sourceSha256||Math.round(audio.startMs*48)!==line.source.sourceStartSample||Math.round(audio.endMs*48)!==line.source.sourceEndSample||hash(originalRoot+'/full-line.wav')!==line.fullLineAudioSha256)throw Error('Current source/canon/voice/plan differs from actual unfinished invocation');
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shot))throw Error('Terminal candidate exists; review rather than repeat');
checkAvatarSpend(db,project,0);mkdirSync(folder,{recursive:true});
const crop={x:160,y:0,width:960,height:540,evidenceRef:'outputs/mark6-production/keyframes/scene1-shot5-headroom-edit-20261107-v1/review.txt'};
const performancePrompt='The single man in this image SPEAKS the supplied Hatam audio. His lips and jaw clearly articulate the actual speech and rest during its pauses. Fixed tripod camera: identical distance, head size and framing throughout. Keep ample space above his complete hair and show the whole face, beard and mouth. Preserve his seated position, searching attentive expression, brown tunic with indigo bands, pale mantle and same daylight room. Small natural independent blinks and breathing. Continue from the actual last retained frame without a pose reset. Preserve the supplied words and timing. No subtitles, captions, letters, added words, music or additional people.';
const proof={at:new Date().toISOString(),status:'explicit_same_reservation_recovery_prepared',workerPid:process.pid,reservationId:reservation,requestId,originalLine:originalRoot+'/line.json',originalLineSha256:hash(originalRoot+'/line.json'),rejectedNative:prefix.rawPath,rejectedNativeSha256:prefix.rawSha256,rejectedNativeCallsRetained:1,reusedNativeCalls:0,newExpectedNativeCalls:6,newFrame:frame.result_asset_path,newFrameSha256:hash(join(data,'assets',String(frame.result_asset_path))),fullLineAudioSha256:line.fullLineAudioSha256,sourceSamples:874000,completeQuotationSamples:1456848,crop,performancePrompt,sourceAndVoiceUnchanged:true,originalReservationRemainsOpenUntilActualCompleteWindow:true,sectionContinuation:'Require exact previous raw/picture/carry clearance and fresh actual host allowance before each following section. No automatic propagation from allowance refresh alone.',limitations:'New seed/prompt do not prove native articulation/framing/sync. Full30.351s quotation and second picture window remain unfinished.'};
writeFileSync(folder+'/recovery-preflight.json',JSON.stringify(proof,null,2));
if(!process.argv.includes('--execute')){console.log(JSON.stringify(proof));db.close();}else{
 if(!process.env.LTX_TOKEN||existsSync(folder+'/result.json')||existsSync(join(data,'assets/generated/lip-sync/ltx-'+requestId)))throw Error('Local credential required; never duplicate retained recovery');
 if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Another native operation pending');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 console.log(JSON.stringify({status:'actual_spokesperson_recovery_worker_started',pid:process.pid,requestId,failedNativeReused:false,reviewBeforeEachContinuation:true}));
 const budget=mark6NativeBudget(root),pendingPath=root+'/native-speaking-allowance-pending.json';let index=0;
 const section:typeof budget.section=async(request,dependencies)=>{
  const part=index++;if(part===0&&hash(request.audio)!==prefix.submittedAudioSha256)throw Error('Original first source audio changed');if(part>=6)throw Error('Six replacement sections maximum');let announced=false;
  while(true){
   const s=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(s.observedAt),fresh=s.source==='actual_host_get_usage_limits'&&s.ordinaryUsageAllowed===true&&Number.isFinite(age)&&age>=0&&age<60000;
   let clear=part===0;const clearance=folder+'/section-'+(part-1)+'-continuation-clearance.json';
   if(part>0&&existsSync(clearance)){const c=read(clearance),previous=read(join(request.directory,'..','line.json')).sections[part-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||c.pictureSha256!==hash(previous.picturePath))throw Error('Actual previous section clearance does not match raw/picture/carry');clear=true;}
   if(clear&&fresh)break;
   if(!announced){const status='waiting_for_actual_section_review_and_fresh_allowance';writeFileSync(pendingPath,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status,directory:request.directory,previousSectionIndex:part-1,clearanceRequired:part>0,clearancePath:clearance}));console.log(JSON.stringify({status,part,clearanceRequired:part>0}));announced=true;}
   await new Promise(r=>setTimeout(r,5000));
  }
  if(announced&&existsSync(pendingPath))unlinkSync(pendingPath);return budget.section(request,dependencies);
 };
 try{
  const sync=new LtxChainedSpeaking({dataDir:data,crop,performancePrompt,generateSection:section});
  const result=await sync.sync(line.character,audio,{path:String(frame.result_asset_path)},{requestId,authorizeSubmission:auth.assertCurrent,productionRevision:line.productionRevision,avatarDirection:readPerformanceDirection(db,project,shot)});
  if(!result.media||result.provenance.provider!=='ltx_local'||result.cost.usd!==0)throw Error('Actual complete local performance window required');auth.assertCurrent();
  const id=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
   db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,?,?,'hold_for_review',?,?,?)").run(id,shot,result.provenance.provider,result.provenance.model,'lip_sync',result.provenance.prompt,result.media.path,result.cost.usd,now);
   db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,?,?)').run(randomUUID(),project,id,result.cost.usd,now);settleAvatarSpend(db,project,reservation,id);bindAttemptRevision(db,project,id,auth);
   db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(randomUUID(),project,shot,'Recovered actual unfinished source-bound window '+id+' with corrected headroom/speaking prompt. Failed first native retained/counted, not reused; original reservation '+reservation+' settled only after real complete window return. Held for full AV; remaining picture window still needed.',now);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,reservationId:reservation,result},null,2),{flag:'wx'});console.log(JSON.stringify({status:'actual_complete_production_window_held_for_review',attemptId:id,media:result.media}));
 }finally{sharedLtxTransport().reset();db.close();}
}
