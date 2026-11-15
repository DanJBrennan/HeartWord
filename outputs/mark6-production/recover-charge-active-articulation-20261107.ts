// Keep reviewed native55/57 exactly; replace held58 and continue remaining
// source sections with the successful bounded articulation direction.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {productionAuthorization,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {settleAvatarSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',project='c457a815-d07d-4902-91b5-7b936b549856',shot='0b7d5eb1-cf5d-4327-8480-c61d29583430',reservation='c3a380d5-825a-4b0e-9482-37eccdeca1f0',verify=process.argv.includes('--verify-prefix'),requestId=verify?'charge-window1-active-articulation-prefix-proof-20261107':'charge-window1-active-articulation-recovery-20261107',folder=root+'/speaking-execution/'+requestId,oldFolder=root+'/speaking-execution/charge-window1-section1-seed43-20261107',db=getDb(),data=getDataDir(),oldRoot=join(data,'assets/generated/lip-sync/ltx-charge-window1-section1-seed43-20261107'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pixels=(p:string)=>execFileSync('ffmpeg',['-v','error','-i',p,'-map','0:v:0','-an','-pix_fmt','yuv420p','-c:v','rawvideo','-f','hash','-hash','sha256','-'],{encoding:'utf8',windowsHide:true}).trim();
try{
 const old=read(join(oldRoot,'line.json')),auth=productionAuthorization(db,data,project),hold=read(oldFolder+'/section-2-speech-hold.json'),diagnostic=read(root+'/speaking-execution/charge-articulation-diagnostic-20261107/av-review.json'),diagnosticManifest=read(root+'/speaking-execution/charge-articulation-diagnostic-20261107/manifest.json'),native=read(root+'/native-generation/execution.json'),firstReview=read(oldFolder+'/section-1-continuation-clearance.json'),priorRequest=read(oldFolder+'/request.json');
 if(old.status!=='held_reconcile_before_retry'||old.sections.length!==3||old.sections[2].rawSha256!==hold.rawSha256||hash(old.sections[2].rawPath)!==hold.rawSha256||old.plan.sampleCount!==700000||old.crop.width!==1024||old.crop.height!==576||old.productionRevision.runId!==auth.runId||old.productionRevision.briefHash!==auth.briefHash||native.entries.some((e:any)=>e.status!=='returned_unreviewed')||(!verify&&!process.env.LTX_TOKEN)||existsSync(folder+'/request.json'))throw Error('Exact held58/settled native journal/current production authority required; no duplicate recovery');
 const d=diagnostic.response.result;if(d.keptPrefixUsable!==true||['clip1_section0_speech_correspondence','clip1_section1_retake_speech_correspondence','clip1_join_3_125_seconds'].some(k=>d.checks[k].status!=='clear')||d.checks.clip2_held_speech_correspondence.status!=='hold'||diagnosticManifest.sourceSha256!==old.fullLineAudioSha256||diagnosticManifest.sections.slice(0,3).some((s:any,i:number)=>s.rawSha256!==old.sections[i].rawSha256))throw Error('Actual successful prefix/held58 AV diagnosis required');
 for(const m of diagnostic.media)if(hash(m.path)!==m.sha256)throw Error('Actual reviewed diagnostic video changed');
 const receiptId='mark6-production-audio-review-m6_charge_articulation_diagnostic_ready_20261107';if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get(receiptId,project,diagnostic.response.costUsd))throw Error('Actual known diagnostic receipt must be reconciled before native continuation');
 const b=db.prepare('SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?').get(shot);if(!b||b.character_version_id!==old.character.characterVersionId||Math.round((Number(b.source_end_ms)-Number(b.source_start_ms))*48)!==700000||!db.prepare("SELECT id FROM character_versions WHERE id=? AND status='approved'").get(String(b.character_version_id)))throw Error('Current approved source/voice binding differs');
 const saved=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation);if(!saved||JSON.parse(String(saved.payload)).shotId!==shot||JSON.parse(String(saved.payload)).upperBoundUsd!==0||db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='settle_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation))throw Error('Same unsettled zero-dollar local reservation required');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 const append=priorRequest.actualSection1Override.append;if(!String(append).includes('lips and jaw visibly articulate'))throw Error('Same successful bounded speaking direction required');
 mkdirSync(folder,{recursive:true});writeFileSync(folder+'/request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,verifyOnly:verify,requestId,reservationId:reservation,oldManifestSha256:hash(join(oldRoot,'line.json')),keptNativeSections:[55,57],heldNative58:hold,diagnosticReviewId:'m6_charge_articulation_diagnostic_ready_20261107',diagnosticCostUsd:diagnostic.response.costUsd,remainingSectionOverrides:[2,3,4].map(index=>({index,append,seed:43})),newNativeMaximum:verify?0:3,sourceAndCanonUnchanged:true,paidFallback:false},null,2),{flag:'wx'});
 const budget=mark6NativeBudget(root),pending=root+'/native-speaking-allowance-pending.json',proofs:any[]=[];let index=0;
 const section:typeof budget.section=async(request,dependencies)=>{
  const part=index++,prepared=read(join(request.directory,'..','line.json'));
  if(part>4||JSON.stringify(prepared.plan)!==JSON.stringify(old.plan)||prepared.fullLineAudioSha256!==old.fullLineAudioSha256||request.prompt!==old.prompt)throw Error('Exact original source partition/base prompt required');
  if(part<2){
   const s=old.sections[part],attemptPath=join(dirname(s.rawPath),'attempt.json'),a=read(attemptPath);
   if(hash(request.image)!==s.inputImageSha256||hash(request.audio)!==s.submittedAudioSha256||hash(s.rawPath)!==s.rawSha256||a.status!=='downloaded_unreviewed'||a.rawSha256!==s.rawSha256||a.imageSha256!==s.inputImageSha256||a.audioSha256!==s.submittedAudioSha256||a.apiCostUsd!==0)throw Error('Actual native55/57 prefix source/image/provenance changed');
   proofs.push({index:part,rawSha256:s.rawSha256,inputImageSha256:s.inputImageSha256,audioSha256:s.submittedAudioSha256,attemptPath,actualNativeId:a.id,actualSeed:a.request.seed,actualPrompt:a.request.prompt});
   return{rawPath:s.rawPath,attemptPath,id:a.id};
  }
  if(part===2){
   for(let i=0;i<2;i++){const s=prepared.sections[i],before=old.sections[i];if(s.rawSha256!==before.rawSha256||pixels(s.picturePath)!==pixels(before.picturePath)||hash(s.carryImagePath)!==before.carryImageSha256)throw Error('Decoded kept prefix or actual carry changed during reconstruction');}
   if(hash(request.image)!==firstReview.carryImageSha256||hash(request.audio)!==old.sections[2].submittedAudioSha256)throw Error('Held58 retake changed actual prior57 ending or exact section2 audio');
   writeFileSync(folder+'/prefix-proof.json',JSON.stringify({at:new Date().toISOString(),status:'two_actual_kept_native_sections_and_failed58_source_verified',manifest:join(request.directory,'..','line.json'),keptNativeSections:proofs,decodedPictureFrameParity:true,carryByteParity:true,section2InputImageSha256:hash(request.image),section2AudioSha256:hash(request.audio),providerCalls:0,containerNote:'Rebuilt FFV1 Matroska container bytes may differ; every decoded frame plus original native raw/carry/audio byte hashes verified.'},null,2),{flag:'wx'});
   if(verify)throw Error('TWO_PREFIX_SECTIONS_VERIFIED_NO_NEW_NATIVE');
  }
  const clearance=folder+'/section-'+(part-1)+'-continuation-clearance.json';let announced=false;
  while(true){
   let reviewed=part===2;
   if(part>2&&existsSync(clearance)){const c=read(clearance),previous=read(join(request.directory,'..','line.json')).sections[part-1];if(c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual speaking/crop/join continuation clearance mismatch');reviewed=true;}
   const q=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(q.observedAt);
   if(reviewed&&q.source==='actual_host_get_usage_limits'&&q.ordinaryUsageAllowed===true&&Number.isFinite(q.usedPercent)&&q.usedPercent>=0&&q.usedPercent<=100&&age>=0&&age<60000)break;
   if(!announced){writeFileSync(pending,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_active_articulation_section_review_and_fresh_allowance',directory:request.directory,previousSectionIndex:part-1,clearanceRequired:part>2,clearancePath:clearance}));console.log(JSON.stringify({status:'waiting_for_actual_active_articulation_section_review_and_fresh_allowance',part,pid:process.pid}));announced=true;}await new Promise(r=>setTimeout(r,5000));
  }
  if(announced&&existsSync(pending))unlinkSync(pending);return budget.section({...request,seed:43,prompt:request.prompt+append},dependencies);
 };
 const locked=old.character.lockedVisualFacts?.description,performancePrompt=locked&&old.prompt.endsWith(' '+locked)?old.prompt.slice(0,-locked.length-1):old.prompt;
 try{
  const result=await new LtxChainedSpeaking({dataDir:data,crop:old.crop,performancePrompt,generateSection:section}).sync(old.character,{path:old.source.path,startMs:old.source.sourceStartSample/48,endMs:old.source.sourceEndSample/48},{path:old.reference.path},{requestId,authorizeSubmission:auth.assertCurrent,productionRevision:old.productionRevision});
  if(verify||!result.media||result.provenance.provider!=='ltx_local'||result.cost.usd!==0||index!==5)throw Error('Actual complete local line required');
  const manifestPath=join(data,'assets/generated/lip-sync/ltx-'+requestId+'/line.json'),m=read(manifestPath);if(m.fullLineAudioSha256!==old.fullLineAudioSha256||m.sections.slice(0,2).some((s:any,i:number)=>s.rawSha256!==old.sections[i].rawSha256))throw Error('Recovered line changed kept raw prefix or source');m.sectionPromptOverrides=[{index:1,append,seed:43,origin:'kept native57'},...[2,3,4].map(index=>({index,append,seed:43}))];writeFileSync(manifestPath,JSON.stringify(m,null,2));
  auth.assertCurrent();const attempt=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
   db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,'lip_sync',?,'hold_for_review',?,0,?)").run(attempt,shot,result.provenance.provider,result.provenance.model,result.provenance.prompt+' SECTION1-4 ACTUAL OVERRIDES:'+append,result.media.path,now);
   db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,attempt,now);settleAvatarSpend(db,project,reservation,attempt);bindAttemptRevision(db,project,attempt,auth);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:attempt,reservationId:reservation,result,requiresWholeWindowAv:true},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:attempt,result}));
 }catch(e){if(verify&&(e as Error).message==='TWO_PREFIX_SECTIONS_VERIFIED_NO_NEW_NATIVE')console.log(JSON.stringify({status:'two_actual_kept_native_sections_and_failed58_source_verified',newNativeCalls:0}));else throw e;}
}finally{sharedLtxTransport().reset();db.close();}
