// Resume the SAME zero-dollar held reservation, reusing native55 unchanged.
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {productionAuthorization,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {settleAvatarSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/jesus-travel-charge-window1-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='0b7d5eb1-cf5d-4327-8480-c61d29583430',id='c3a380d5-825a-4b0e-9482-37eccdeca1f0',db=getDb(),data=getDataDir(),linePath=join(data,'assets/generated/lip-sync/ltx-'+id+'/line.json'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 const old=read(linePath),authorization=productionAuthorization(db,data,project),manifestSha256=hash(linePath),budget=mark6NativeBudget(root),pending=root+'/native-speaking-allowance-pending.json';
 if(!process.env.LTX_TOKEN||old.status!=='held_reconcile_before_retry'||old.sections.length!==1||old.sections[0].rawSha256!=='e5363f0bd34a31188832d9881609d9ddc742afdc9ba974ed6c1630be80ef3f2f'||old.productionRevision.runId!==authorization.runId||old.productionRevision.briefHash!==authorization.briefHash||existsSync(folder+'/caption-cleanup-resume-request.json'))throw Error('Exact retained first native result/held revision/current local credential required; no replay');
 const reservation=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,id);
 if(!reservation||JSON.parse(String(reservation.payload)).upperBoundUsd!==0||JSON.parse(String(reservation.payload)).shotId!==shot||db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='settle_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,id))throw Error('Same unsettled local zero-dollar reservation required');
 const binding=db.prepare('SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?').get(shot) as {character_version_id:string;source_start_ms:number;source_end_ms:number}|undefined;
 if(!binding||binding.character_version_id!==old.character.characterVersionId||Math.round((binding.source_end_ms-binding.source_start_ms)*48)!==700000||!db.prepare("SELECT id FROM character_versions WHERE id=? AND status='approved'").get(binding.character_version_id))throw Error('Current approved utterance/voice identity required');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 writeFileSync(folder+'/caption-cleanup-resume-request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,reservationId:id,manifestSha256,reusedNative55:true,correctedCrop:{x:128,y:0,width:1024,height:576},authority:'Existing autonomous production; direct returned-frame review, original selected crop contained generated subtitles. No source/canon change, first native section is reused without inference.',paidFallback:false},null,2),{flag:'wx'});
 const section:typeof budget.section=async(request,dependencies)=>{
  const index=Number(request.directory.match(/attempt-(\d+)$/)?.[1]);if(!Number.isInteger(index)||index<1||index>4)throw Error('Only remaining original planned sections may submit');
  const clearance=folder+'/corrected-section-'+(index-1)+'-continuation-clearance.json';let announced=false;
  while(true){
   let clear=false;
   if(existsSync(clearance)){const c=read(clearance),previous=read(linePath).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual corrected continuation clearance mismatch');clear=true;}
   const s=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(s.observedAt);
   if(clear&&s.source==='actual_host_get_usage_limits'&&s.ordinaryUsageAllowed===true&&Number.isFinite(s.usedPercent)&&s.usedPercent>=0&&s.usedPercent<=100&&age>=0&&age<60000)break;
   if(!announced){writeFileSync(pending,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_corrected_section_review_and_fresh_allowance',directory:request.directory,previousSectionIndex:index-1,clearanceRequired:true,clearancePath:clearance}));console.log(JSON.stringify({status:'waiting_for_actual_corrected_section_review_and_fresh_allowance',index,pid:process.pid}));announced=true;}
   await new Promise(r=>setTimeout(r,5000));
  }
  if(announced&&existsSync(pending))unlinkSync(pending);return budget.section(request,dependencies);
 };
 const locked=old.character.lockedVisualFacts?.description,performancePrompt=locked&&old.prompt.endsWith(' '+locked)?old.prompt.slice(0,-locked.length-1):old.prompt;
 const result=await new LtxChainedSpeaking({dataDir:data,crop:{x:128,y:0,width:1024,height:576,evidenceRef:folder+'/corrected-crop-root-review.json'},resumeManifestSha256:manifestSha256,performancePrompt,generateSection:section}).sync(old.character,{path:old.source.path,startMs:old.source.sourceStartSample/48,endMs:old.source.sourceEndSample/48},{path:old.reference.path},{requestId:id,authorizeSubmission:authorization.assertCurrent,productionRevision:old.productionRevision});
 if(!result.media||result.provenance.provider!=='ltx_local'||result.cost.usd!==0)throw Error('Only real returned local zero-dollar candidate may settle original reservation');
 authorization.assertCurrent();const attempt=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,'lip_sync',?,'hold_for_review',?,0,?)").run(attempt,shot,result.provenance.provider,result.provenance.model,result.provenance.prompt,result.media.path,now);
  db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,attempt,now);
  settleAvatarSpend(db,project,id,attempt);bindAttemptRevision(db,project,attempt,authorization);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(folder+'/caption-cleanup-result.json',JSON.stringify({at:new Date().toISOString(),attemptId:attempt,result,requiresWholeLineAv:true},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:attempt,result}));
}finally{sharedLtxTransport().reset();db.close();}
