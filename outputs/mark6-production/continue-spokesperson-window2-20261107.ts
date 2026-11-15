// Actual accepted native ending-frame continuation; no synthetic keyframe provenance.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {reserveAvatarSpend,settleAvatarSpend,readPerformanceDirection,checkFilmSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/spokesperson-window2-native-continuation-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='30837ce5-9556-4ca5-96f0-72bc1fd82b2c',parentId='f87070ab-5945-4545-9fec-dcbad8c0473e';
const db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),auth=productionAuthorization(db,data,project);
const selected=read(root+'/speaking-execution/spokesperson-final-expression-repair-v2/execution/first-window-selection.json'),parent=db.prepare("SELECT shot_id,status,result_asset_path FROM generation_attempts WHERE id=? AND operation='lip_sync'").get(parentId),clip=db.prepare('SELECT id FROM clips WHERE generation_attempt_id=?').get(parentId);
validateAttemptRevision(db,data,project,parentId);
if(!parent||parent.status!=='accepted'||!clip||clip.id!==selected.selection.clipId||selected.attemptId!==parentId)throw Error('Current actually selected parent required');
const parentRoot=join(data,'assets',String(parent.result_asset_path),'..'),old=read(parentRoot+'/line.json'),proofPath=parentRoot+'/last-retained-native-carry.png.proof.json',proof=read(proofPath),tail=old.sections.at(-1),pre=read(root+'/speaking-source-preflight/scene1-shot6-source-ready/preflight.json');
const binding=db.prepare('SELECT * FROM shot_utterance_bindings WHERE shot_id=?').get(shot),cv=binding&&db.prepare("SELECT character_id,locked_visual_facts FROM character_versions WHERE id=? AND status='approved'").get(String(binding.character_version_id)),audio=binding&&resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));
if(!binding||!cv||!audio||String(cv.character_id)!==old.character.characterId||String(binding.character_version_id)!==old.character.characterVersionId||JSON.stringify(cv.locked_visual_facts?JSON.parse(String(cv.locked_visual_facts)):undefined)!==JSON.stringify(old.character.lockedVisualFacts)||old.productionRevision.runId!==auth.runId||old.productionRevision.briefHash!==auth.briefHash||hash(join(parentRoot,'candidate.mp4'))!==old.outputSha256||old.outputSha256!==proof.lineOutputSha256||proof.attemptId!==parentId||proof.kind!=='actual_last_retained_native_frame_projection'||proof.exactFacePixelsUnchanged!==true||hash(proof.endingImagePath)!==proof.endingImageSha256||hash(tail.rawPath)!==proof.sourceRawSha256||tail.rawSha256!==proof.sourceRawSha256||tail.lastRetainedFrameIndex!==proof.nativeFrameIndex||JSON.stringify(old.crop)!==JSON.stringify(proof.crop)||hash(join(data,'assets',audio.path))!==old.source.sourceSha256||old.source.sourceEndSample!==Math.round(audio.startMs*48)||Math.round(audio.startMs*48)!==pre.startSample||Math.round(audio.endMs*48)!==pre.endSample||pre.fullLineSamples!==582848||pre.sourceSha256!==old.source.sourceSha256||Number(binding.source_start_ms)!==48997.33333333333||Number(binding.source_end_ms)!==61140)throw Error('Current exact parent/canon/source/native-carry proof mismatch');
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'").get(shot)||existsSync(folder))throw Error('Existing continuation must be reconciled, never repeated');
if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Another native request pending');
if(!process.argv.includes('--execute')||!process.env.LTX_TOKEN)throw Error('Explicit execution and stored local credential required');
checkFilmSpend(db,project,0);auth.assertCurrent();mkdirSync(folder,{recursive:true});
const reservation=reserveAvatarSpend(db,project,shot,0),requestId=reservation+'-spokesperson-window2-native-continuation-v1',continuation={kind:'accepted_native_ending_frame',parentAttemptId:parentId,parentShotId:parent.shot_id,parentClipId:clip.id,parentVideoSha256:old.outputSha256,endingProofPath:proofPath,endingProofSha256:hash(proofPath),endingImagePath:proof.endingImagePath,endingImageSha256:proof.endingImageSha256,sourceBoundarySample:874000,originalKeyframeAttemptId:'9d7bdce6-1b9c-4c24-8f72-707adaa02c4b',originalKeyframePath:old.reference.path,originalKeyframeSha256:old.reference.sha256,productionRevision:old.productionRevision};
writeFileSync(folder+'/preflight.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,shotId:shot,reservationId:reservation,requestId,audio,expectedSamples:582848,expectedFrames:292,maximumNewNativeSections:4,continuation,qualityApproval:false},null,2),{flag:'wx'});
for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
const description=String(old.character.lockedVisualFacts?.description??'');if(description&&!old.prompt.endsWith(' '+description))throw Error('Exact locked description suffix required');
const performancePrompt=description?old.prompt.slice(0,-description.length-1):old.prompt,budget=mark6NativeBudget(root);let index=0;
const section:typeof budget.section=async(request,dependencies)=>{
 const part=index++,manifestPath=join(request.directory,'..','line.json'),line=read(manifestPath);if(part>=4||line.fullLineAudioSha256!==pre.lineSha256||JSON.stringify(line.plan)!==JSON.stringify(pre.plan)||line.reference.sha256!==proof.endingImageSha256)throw Error('Exact next-window source/plan/reference changed');
 line.continuationFromAcceptedWindow=continuation;writeFileSync(manifestPath,JSON.stringify(line,null,2));
 let announced=false;const pending=root+'/native-speaking-allowance-pending.json',clearance=folder+'/section-'+(part-1)+'-continuation-clearance.json';
 while(true){
  let clear=part===0;if(part>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifestPath).sections[part-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.carryImagePath)!==c.carryImageSha256||c.pictureSha256!==hash(previous.picturePath))throw Error('Previous actual section clearance mismatch');clear=true;}
  const q=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(q.observedAt);if(clear&&q.source==='actual_host_get_usage_limits'&&q.ordinaryUsageAllowed===true&&q.usedPercent<95&&Number.isFinite(age)&&age>=0&&age<60000)break;
  if(!announced){const status='waiting_for_actual_section_review_and_fresh_allowance';writeFileSync(pending,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status,directory:request.directory,previousSectionIndex:part-1,clearanceRequired:part>0,clearancePath:clearance}));console.log(JSON.stringify({status,part,pid:process.pid}));announced=true;}await new Promise(r=>setTimeout(r,5000));
 }
 if(announced&&existsSync(pending))unlinkSync(pending);auth.assertCurrent();
 return budget.section({...request,seed:43},dependencies);
};
try{
 const sync=new LtxChainedSpeaking({dataDir:data,crop:old.crop,performancePrompt,generateSection:section}),result=await sync.sync(old.character,audio,{path:relative(join(data,'assets'),proof.endingImagePath)},{requestId,authorizeSubmission:auth.assertCurrent,productionRevision:old.productionRevision,avatarDirection:readPerformanceDirection(db,project,shot)});
 if(!result.media||result.provenance.provider!=='ltx_local'||result.cost.usd!==0||index!==4)throw Error('Actual complete local continuation required');auth.assertCurrent();
 const manifestPath=join(data,'assets',result.media.path,'..','line.json'),line=read(manifestPath);if(line.fullLineAudioSha256!==pre.lineSha256||line.plan.sampleCount!==582848||line.plan.totalFrames!==292)throw Error('Completed continuation source mismatch');line.continuationFromAcceptedWindow=continuation;writeFileSync(manifestPath,JSON.stringify(line,null,2));
 const id=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,?,?,'hold_for_review',?,?,?)").run(id,shot,result.provenance.provider,result.provenance.model,'lip_sync',result.provenance.prompt,result.media.path,0,now);
  db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,?,?)').run(randomUUID(),project,id,0,now);settleAvatarSpend(db,project,reservation,id);bindAttemptRevision(db,project,id,auth);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,reservationId:reservation,result,continuation,wholeQuotationApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify({status:'actual_complete_continuation_held_for_full_av',attemptId:id,media:result.media}));
}finally{sharedLtxTransport().reset();db.close();}
