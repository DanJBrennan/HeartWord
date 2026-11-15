// Same source-bound stage, exact reviewed native prefix reused; only failed
// section1 is retaken. No new voice, alignment, image or paid provider.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {LtxChainedSpeaking} from '../../src/pipeline/voice-lipsync/ltx-speaking.js';
import {productionAuthorization,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {settleAvatarSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',project='c457a815-d07d-4902-91b5-7b936b549856',shot='0b7d5eb1-cf5d-4327-8480-c61d29583430',reservation='c3a380d5-825a-4b0e-9482-37eccdeca1f0',verify=process.argv.includes('--verify-prefix'),requestId=verify?'charge-window1-section1-prefix-proof-v2-20261107':'charge-window1-section1-seed43-20261107',folder=root+'/speaking-execution/'+requestId,db=getDb(),data=getDataDir(),oldRoot=join(data,'assets/generated/lip-sync/ltx-'+reservation),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pixelHash=(p:string)=>execFileSync('ffmpeg',['-v','error','-i',p,'-map','0:v:0','-an','-pix_fmt','yuv420p','-c:v','rawvideo','-f','hash','-hash','sha256','-'],{encoding:'utf8',windowsHide:true}).trim();
try{
 const old=read(join(oldRoot,'line.json')),auth=productionAuthorization(db,data,project),hold=read(root+'/speaking-execution/jesus-travel-charge-window1-v1/corrected-section-1-speech-hold.json'),clear=read(root+'/speaking-execution/jesus-travel-charge-window1-v1/corrected-section-0-continuation-clearance.json'),native=read(root+'/native-generation/execution.json');
 if(old.status!=='held_reconcile_before_retry'||old.sections.length!==2||old.sections[1].rawSha256!==hold.rawSha256||hash(old.sections[1].rawPath)!==hold.rawSha256||old.plan.sampleCount!==700000||old.crop.width!==1024||old.crop.height!==576||old.productionRevision.runId!==auth.runId||old.productionRevision.briefHash!==auth.briefHash||native.entries.some((e:any)=>e.status!=='returned_unreviewed')||(!verify&&!process.env.LTX_TOKEN)||existsSync(folder+'/request.json'))throw Error('Exact held speaking defect/settled native calls/current source-plan authority required; no replay');
 const saved=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation);
 if(!saved||JSON.parse(String(saved.payload)).shotId!==shot||JSON.parse(String(saved.payload)).upperBoundUsd!==0||db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='settle_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation))throw Error('Same unsettled local zero-dollar reservation required');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 mkdirSync(folder,{recursive:true});
 const append=' During the supplied voiced words, his lips and jaw visibly articulate the actual speech: natural changing open and rounded mouth shapes, returning to quiet only with the actual audio quiet. Start from this same quiet ending; keep his head, shoulders and gaze steady while the mouth speaks. A held smile without articulation is not the requested action.';
 writeFileSync(folder+'/request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,verifyOnly:verify,requestId,reservationId:reservation,oldManifestSha256:hash(join(oldRoot,'line.json')),reusedPrefixNative55:true,rejectedNative56:hold,actualSection1Override:{append,seed:43},newNativeMaximum:verify?0:4,sourceAndCanonUnchanged:true,paidFallback:false},null,2),{flag:'wx'});
 const budget=mark6NativeBudget(root),pending=root+'/native-speaking-allowance-pending.json';let index=0;
 const section:typeof budget.section=async(request,dependencies)=>{
  const part=index++,prepared=read(join(request.directory,'..','line.json'));
  if(part>4||JSON.stringify(prepared.plan)!==JSON.stringify(old.plan)||prepared.fullLineAudioSha256!==old.fullLineAudioSha256||request.prompt!==old.prompt)throw Error('Exact existing source partition/prompt required');
  if(part===0){
   const s=old.sections[0],a=read(join(oldRoot,'attempt-0/attempt.json'));
   if(hash(request.image)!==s.inputImageSha256||hash(request.audio)!==s.submittedAudioSha256||hash(s.rawPath)!==s.rawSha256||s.rawSha256!==clear.rawSha256||hash(s.picturePath)!==clear.pictureSha256||hash(s.carryImagePath)!==clear.carryImageSha256||a.status!=='downloaded_unreviewed'||a.rawSha256!==s.rawSha256||a.apiCostUsd!==0)throw Error('Reviewed native55 actual source/image/raw/picture/carry changed');
   return{rawPath:s.rawPath,attemptPath:join(oldRoot,'attempt-0/attempt.json'),id:a.id};
  }
  if(part===1){
   const previous=prepared.sections[0],decodedPictureSha256=pixelHash(previous.picturePath);if(previous.rawSha256!==clear.rawSha256||decodedPictureSha256!==pixelHash(old.sections[0].picturePath)||hash(request.image)!==clear.carryImageSha256||hash(request.audio)!==old.sections[1].submittedAudioSha256)throw Error('Retake changed source or actual reviewed prior endpoint');
   writeFileSync(folder+'/prefix-proof.json',JSON.stringify({at:new Date().toISOString(),status:'exact_native55_prefix_and_failed_section1_source_verified',manifest:join(request.directory,'..','line.json'),reusedNativeSections:1,rawSha256:previous.rawSha256,pictureSha256:hash(previous.picturePath),originalPictureSha256:clear.pictureSha256,decodedPictureSha256,pictureDecodedFrameParity:true,containerNote:'FFV1 Matroska regenerated container UID need not be byte-identical; every decoded yuv420p frame is identical, and native raw/carry/source bytes match exactly.',carrySha256:hash(request.image),section1AudioSha256:hash(request.audio),newProviderCalls:0},null,2),{flag:'wx'});
   if(verify)throw Error('PREFIX_VERIFIED_NO_NEW_NATIVE');
  }
  const clearance=folder+'/section-'+(part-1)+'-continuation-clearance.json';let announced=false;
  while(true){
   let reviewed=part===1;
   if(part>1&&existsSync(clearance)){const c=read(clearance),previous=read(join(request.directory,'..','line.json')).sections[part-1];if(c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.carryImagePath)!==c.carryImageSha256||hash(previous.picturePath)!==c.pictureSha256)throw Error('Actual retake/continuation picture clearance mismatch');reviewed=true;}
   const s=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(s.observedAt);
   if(reviewed&&s.source==='actual_host_get_usage_limits'&&s.ordinaryUsageAllowed===true&&Number.isFinite(s.usedPercent)&&s.usedPercent>=0&&s.usedPercent<=100&&age>=0&&age<60000)break;
   if(!announced){writeFileSync(pending,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status:'waiting_for_actual_speaking_retake_review_and_fresh_allowance',directory:request.directory,previousSectionIndex:part-1,clearanceRequired:part>1,clearancePath:clearance}));console.log(JSON.stringify({status:'waiting_for_actual_speaking_retake_review_and_fresh_allowance',part,pid:process.pid}));announced=true;}await new Promise(r=>setTimeout(r,5000));
  }
  if(announced&&existsSync(pending))unlinkSync(pending);
  return budget.section(part===1?{...request,seed:43,prompt:request.prompt+append}:request,dependencies);
 };
 const locked=old.character.lockedVisualFacts?.description,performancePrompt=locked&&old.prompt.endsWith(' '+locked)?old.prompt.slice(0,-locked.length-1):old.prompt;
 try{
  const result=await new LtxChainedSpeaking({dataDir:data,crop:old.crop,performancePrompt,generateSection:section}).sync(old.character,{path:old.source.path,startMs:old.source.sourceStartSample/48,endMs:old.source.sourceEndSample/48},{path:old.reference.path},{requestId,authorizeSubmission:auth.assertCurrent,productionRevision:old.productionRevision});
  if(verify||!result.media||result.provenance.provider!=='ltx_local'||result.cost.usd!==0||index!==5)throw Error('Actual complete local candidate required');
  const manifestPath=join(data,'assets/generated/lip-sync/ltx-'+requestId+'/line.json'),manifest=read(manifestPath);if(manifest.fullLineAudioSha256!==old.fullLineAudioSha256||manifest.sections[0].rawSha256!==old.sections[0].rawSha256)throw Error('Retake changed exact source/native prefix');manifest.sectionPromptOverrides=[{index:1,append,seed:43,reason:'Actual native56 failed visible speaking; held unselected'}];writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  auth.assertCurrent();const attempt=randomUUID(),now=Date.now();db.exec('BEGIN IMMEDIATE');try{
   db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,'lip_sync',?,'hold_for_review',?,0,?)").run(attempt,shot,result.provenance.provider,result.provenance.model,result.provenance.prompt+' SECTION1 OVERRIDE:'+append,result.media.path,now);
   db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,attempt,now);settleAvatarSpend(db,project,reservation,attempt);bindAttemptRevision(db,project,attempt,auth);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),attemptId:attempt,reservationId:reservation,result,requiresWholeWindowAv:true},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:attempt,result}));
 }catch(e){if(verify&&(e as Error).message==='PREFIX_VERIFIED_NO_NEW_NATIVE')console.log(JSON.stringify({status:'exact_native55_prefix_and_failed_section1_source_verified',newNativeCalls:0}));else throw e;}
}finally{sharedLtxTransport().reset();db.close();}
