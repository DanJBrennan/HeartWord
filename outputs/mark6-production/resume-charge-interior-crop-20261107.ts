// Same held line, four cached native sections, exactly one remaining inference.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {productionAuthorization,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {settleAvatarSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',project='c457a815-d07d-4902-91b5-7b936b549856',shot='0b7d5eb1-cf5d-4327-8480-c61d29583430',reservation='c3a380d5-825a-4b0e-9482-37eccdeca1f0',requestId='charge-window1-active-articulation-recovery-20261107',folder=root+'/speaking-execution/'+requestId;
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),db=getDb(),data=getDataDir(),lineRoot=join(data,'assets/generated/lip-sync/ltx-'+requestId),manifestPath=join(lineRoot,'line.json');
try{
 const old=read(manifestPath),resumeSha=hash(manifestPath),auth=productionAuthorization(db,data,project),hold=read(folder+'/section-3-caption-hold.json'),prior=read(folder+'/request.json'),journal=read(root+'/native-generation/execution.json');
 if(old.status!=='held_reconcile_before_retry'||old.sections.length!==4||old.plan.sampleCount!==700000||old.plan.totalFrames!==350||old.sections[3].rawSha256!==hold.rawSha256||old.productionRevision.runId!==auth.runId||old.productionRevision.briefHash!==auth.briefHash||journal.entries.length!==60||journal.entries.some((e:any)=>e.status!=='returned_unreviewed')||existsSync(folder+'/interior-crop-resume-request.json')||existsSync(folder+'/result.json')||!process.env.LTX_TOKEN)throw Error('Exact four-section held line and settled native60 required; no duplicate resume');
 const binding=db.prepare('SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?').get(shot);
 if(!binding||binding.character_version_id!==old.character.characterVersionId||Math.round((Number(binding.source_end_ms)-Number(binding.source_start_ms))*48)!==700000||!db.prepare("SELECT id FROM character_versions WHERE id=? AND status='approved'").get(String(binding.character_version_id)))throw Error('Current source/canon binding changed');
 const saved=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation);
 if(!saved||JSON.parse(String(saved.payload)).shotId!==shot||JSON.parse(String(saved.payload)).upperBoundUsd!==0||db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='settle_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation))throw Error('Original unsettled zero-dollar reservation required');
 const proofs=old.sections.map((s:any,i:number)=>{
  const attemptPath=join(dirname(s.rawPath),'attempt.json'),a=read(attemptPath),input=i===0?join(lineRoot,'start.png'):old.sections[i-1].carryImagePath;
  if(hash(s.rawPath)!==s.rawSha256||hash(input)!==s.inputImageSha256||hash(join(lineRoot,`section-${i}.wav`))!==s.submittedAudioSha256||a.status!=='downloaded_unreviewed'||a.rawSha256!==s.rawSha256||a.imageSha256!==s.inputImageSha256||a.audioSha256!==s.submittedAudioSha256||a.apiCostUsd!==0)throw Error('Original actual native input/raw/audio provenance changed');
  return {index:i,actualNativeId:a.id,attemptPath,rawSha256:s.rawSha256,inputImageSha256:s.inputImageSha256,submittedAudioSha256:s.submittedAudioSha256,seed:a.request.seed,prompt:a.request.prompt};
 });
 const append=prior.remainingSectionOverrides.find((s:any)=>s.index===4)?.append;
 if(!String(append).includes('lips and jaw visibly articulate'))throw Error('Existing successful speaking direction required');
 const crop={x:160,y:0,width:960,height:540,evidenceRef:folder+'/interior-crop-root-review.json'};
 if(!existsSync(crop.evidenceRef)||read(crop.evidenceRef).status!=='clear_for_one_remaining_native_section')throw Error('Actual full-prefix crop review required');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 writeFileSync(folder+'/interior-crop-resume-request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,resumeManifestSha256:resumeSha,requestId,reservation,proofs,crop,newNativeMaximum:1,paidFallback:false},null,2),{flag:'wx'});
 const budget=mark6NativeBudget(root);let calls=0;
 const section:typeof budget.section=async(request,deps)=>{
  const m=read(manifestPath);if(++calls!==1||!request.directory.endsWith('attempt-4')||m.sections.length!==4||m.fullLineAudioSha256!==old.fullLineAudioSha256||JSON.stringify(m.plan)!==JSON.stringify(old.plan)||request.prompt!==old.prompt||hash(request.image)!==m.sections[3].carryImageSha256||m.sections.some((s:any,i:number)=>s.rawSha256!==old.sections[i].rawSha256||s.inputImageSha256!==old.sections[i].inputImageSha256))throw Error('Only final section from cleaned actual native60 endpoint permitted');
  while(true){const q=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(q.observedAt);if(q.source==='actual_host_get_usage_limits'&&q.ordinaryUsageAllowed===true&&Number.isFinite(q.usedPercent)&&q.usedPercent>=0&&q.usedPercent<=100&&age>=0&&age<60000)break;console.log(JSON.stringify({status:'waiting_for_fresh_actual_allowance',pid:process.pid}));await new Promise(r=>setTimeout(r,5000));}
  return budget.section({...request,seed:43,prompt:request.prompt+append},deps);
 };
 const locked=old.character.lockedVisualFacts?.description,performancePrompt=locked&&old.prompt.endsWith(' '+locked)?old.prompt.slice(0,-locked.length-1):old.prompt;
 const result=await new LtxChainedSpeaking({dataDir:data,crop,performancePrompt,resumeManifestSha256:resumeSha,generateSection:section}).sync(old.character,{path:old.source.path,startMs:old.source.sourceStartSample/48,endMs:old.source.sourceEndSample/48},{path:old.reference.path},{requestId,authorizeSubmission:auth.assertCurrent,productionRevision:old.productionRevision});
 if(calls!==1||!result.media||result.cost.usd!==0||result.provenance.provider!=='ltx_local')throw Error('One completed zero-dollar local inference required');
 const m=read(manifestPath);m.sectionPromptOverrides=proofs.map((p:any)=>({index:p.index,seed:p.seed,prompt:p.prompt,origin:'verified_actual_native_sidecar'})).concat([{index:4,seed:43,prompt:old.prompt+append,origin:'actual_new_final_native_section'}]);writeFileSync(manifestPath,JSON.stringify(m,null,2));
 auth.assertCurrent();const attempt=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,'lip_sync',?,'hold_for_review',?,0,?)").run(attempt,shot,result.provenance.provider,result.provenance.model,result.provenance.prompt+' ACTUAL PER-SECTION PROMPTS RECORDED IN LINE MANIFEST',result.media.path,now);
  db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,attempt,now);settleAvatarSpend(db,project,reservation,attempt);bindAttemptRevision(db,project,attempt,auth);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:attempt,reservationId:reservation,result,requiresWholeWindowAv:true},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:attempt,result}));
}finally{sharedLtxTransport().reset();db.close();}
