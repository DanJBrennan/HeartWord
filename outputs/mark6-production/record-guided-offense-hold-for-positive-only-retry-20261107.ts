import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const root='outputs/mark6-production',folder=join(root,'native-motion/scene1-shot7-offense-guided-final-v3'),id='3a237685-0f43-441e-91fc-e6c123872eb5',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const held=JSON.parse(readFileSync(join(folder,'root-direct-hold.json'),'utf8')),endpoint=JSON.parse(readFileSync(join(root,'keyframes/scene1-shot7-ending-guidance-v1/endpoint-review.json'),'utf8'));
const db=getDb(),data=getDataDir(),plan=requireCurrentPlan(db,data,projectId);
try{
 validateAttemptRevision(db,data,projectId,id);
 const row=db.prepare('SELECT shot_id,status,operation,result_asset_path FROM generation_attempts WHERE id=?').get(id);
 if(!row||row.shot_id!==endpoint.shotId||row.status!=='hold_for_review'||row.operation!=='generate_final_video'||held.attemptId!==id||held.status!=='held_by_direct_actual_review'||!held.observedDefects?.length||endpoint.status!=='accepted_guidance_endpoint_only'||endpoint.productionRunId!==plan.id)throw Error('Exact retained failed take and reviewed correction required');
 if(db.prepare('SELECT id FROM clips WHERE generation_attempt_id=?').get(id))throw Error('Cannot invalidate selected footage through this operator');
 const evidenceHash=createHash('sha256').update(readFileSync(join(folder,'root-direct-hold.json'))).digest('hex');
 const decision={at:new Date().toISOString(),attemptId:id,status:'retry_modified',reason:held.observedDefects,evidenceHash,scope:'Only known failed take; preserve raw media, actual cost, source, canon and original K1',next:'Existing normal local final stage with reviewed first/last guidance; no paid fallback or acceptance bypass'};
 db.exec('BEGIN IMMEDIATE');try{
  if(db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=? AND status='hold_for_review'").run(id).changes!==1)throw Error('Changed held take');
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(randomUUID(),projectId,String(row.shot_id),'Actual reaction take '+id+' rejected for collective middle bow despite upright endpoint. Full4.36s required source picture not usable. Retry modified with shorter positive-only prose and same seed/start/end/settings; original directive retained as actual-review authority. Retained evidence '+folder+'/root-direct-hold.json; no AV expenditure for known failure; no native audio accepted.',Date.now());
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(join(folder,'retry-modified-decision.json'),JSON.stringify(decision,null,2),{flag:'wx'});console.log(JSON.stringify(decision));
}finally{db.close();}
