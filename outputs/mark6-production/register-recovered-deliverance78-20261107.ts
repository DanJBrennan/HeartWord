import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const root='outputs/mark6-production',folder=join(root,'native-motion/scene2-mission-preparation-v1/shot-9-final'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const saved=read(join(folder,'recovered-provider-result.json')),result=saved.result,attemptId='342f6982-50c9-4c95-8269-4124e62e3058',project='c457a815-d07d-4902-91b5-7b936b549856',shot='2d139176-2b3a-4baf-9534-99f9013d7192',jobId='27f308ae-36d9-4a5f-8b41-268c9554f897',nativeId='video:'+shot+':d0f0305a-3e5f-4643-9ea2-af41063b5140';
const db=getDb(),data=getDataDir(),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 const plan=requireCurrentPlan(db,data,project),meta=result.metadata;
 if(result.provenance.provider!=='ltx_local'||result.cost.usd!==0||meta.generationId!==attemptId||meta.shotId!==shot||meta.status!=='complete'||meta.productionRevision.runId!==plan.id||meta.productionRevision.briefHash!==plan.brief_hash||hash(join(data,'assets',result.media.path))!==saved.outputSha256||meta.recovery.providerResubmissions!==0)throw Error('Wrong recovered current local output');
 const original=read(join(folder,'metadata-before-recovery.json'));if(original.status!=='submission_uncertain'||original.generationId!==attemptId)throw Error('Original interrupted receipt missing');
 const old=db.prepare('SELECT status,result_asset_path FROM generation_attempts WHERE id=?').get(attemptId);
 if(old){if(old.result_asset_path!==result.media.path)throw Error('Recovered ID has different media');}
 else{
  db.exec('BEGIN IMMEDIATE');try{
   const job=db.prepare('SELECT status FROM video_generation_jobs WHERE id=? AND project_id=? AND shot_id=?').get(jobId,project,shot);if(job?.status!=='held')throw Error('Unexpected interrupted job state');
   db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,?,?,'generate_final_video','720p',?,'hold_for_review',?,0,?)").run(attemptId,shot,result.provenance.provider,result.provenance.model,result.provenance.prompt,result.media.path,Date.now());
   bindAttemptRevision(db,project,attemptId,{runId:plan.id,briefHash:plan.brief_hash});
   db.prepare("UPDATE video_generation_jobs SET status='completed',metadata_json=?,updated_at=? WHERE id=?").run(JSON.stringify({attemptId,...meta}),Date.now(),jobId);
   db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run('mark6-native-recovery-'+attemptId,project,attemptId,Date.now());
   db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run('mark6-recovered-picture-hold-'+attemptId,project,shot,'Recovered ORIGINAL local render after observer SQLite lock. No resubmission. Picture remains hold_for_review pending actual native whole-motion/count/canon/geometry checks. Original generated audio and extracted ambience are unreviewed/unselected; external approved source mix controls film. No implicit model review or paid fallback.',Date.now());
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 const lock=resolve(root,'native-generation/journal.lock'),fd=openSync(lock,'wx');closeSync(fd);
 try{
  const path=join(root,'native-generation/execution.json'),j=read(path),entry=j.entries.find((e:any)=>e.id===nativeId);
  if(j.entries.length!==78||!entry||!['uncertain_reconcile_before_retry','returned_unreviewed'].includes(entry.status))throw Error('Unexpected original native reservation');
  if(entry.status==='returned_unreviewed'&&entry.artifact!==result.media.path)throw Error('Reservation settled to other media');
  entry.status='returned_unreviewed';entry.artifact=result.media.path;entry.recoveryEvidence=join(folder,'terminal-existing-render-receipt.json');
  writeFileSync(path,JSON.stringify(j,null,2));const main=read(join(root,'execution.json'));if(main.limits.localLtxGenerations!==220||main.productionHold!==false)throw Error('Changed production authority');
  main.ltx={...main.ltx,calls:j.entries.length,pending:j.entries.filter((e:any)=>e.status!=='returned_unreviewed').length,journal:'native-generation/execution.json'};writeFileSync(join(root,'execution.json'),JSON.stringify(main,null,2));
 }finally{unlinkSync(lock);}
 const report={at:new Date().toISOString(),status:'original_render_registered_pending_picture_review',attemptId,jobId,nativeId,providerResubmissions:0,nativeGenerationsRetained:78,pictureSelected:false,nativeAudioSelected:false,productionRunId:plan.id,planningBriefHash:plan.brief_hash,media:result.media,outputSha256:saved.outputSha256};
 writeFileSync(join(folder,'recovery-registration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{db.close();}
