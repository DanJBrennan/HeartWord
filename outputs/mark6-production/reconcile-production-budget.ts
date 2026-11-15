import {readFileSync,writeFileSync} from 'node:fs';
import {getDb} from '../../src/db/client.js';
import {reconcileAvatarBudget,checkFilmSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),projectId=read(root+'/workspace.json').projectId,db=getDb(),reviews=read(root+'/voice-review/execution.json');
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(projectId))throw Error('Reconcile after the current worker has settled, without another writer.');
if(reviews.pendingUsd!==0||reviews.calls.length!==3)throw Error('Uncertain external AV request');
db.exec('BEGIN IMMEDIATE');try{
 for(const c of reviews.calls){if(!['returned','returned_reconciled'].includes(c.status)||c.usage.totalTokenCount<=0)throw Error('Unknown review usage');
  db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,NULL,?,?) ON CONFLICT(id) DO NOTHING').run('mark6-production-audio-review-'+c.id,projectId,c.costUsd,Date.now());}
 // Carry forward the known source-alignment estimate separately from the
 // additional $8 AV allowance. Retain its historical uncertain .03 reserve.
 db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,NULL,?,?) ON CONFLICT(id) DO NOTHING').run('mark6-preparation-retained-source-alignment',projectId,1.320741,Date.now());
 reconcileAvatarBudget(db,{projectId,actor:'HeartWord production reconciliation',evidence:'Recorded source alignment estimate1.320741, historical uncertain reserve.03 retained. New3 AV receipts total.013801 with no pending requests. ElevenLabs14 conversions2640 existing credits reconcile to history/account with overage disabled; credit units are retained separately, not converted to invented dollars. Two Codex role calls used verified ChatGPT login, no API-key route or fallback; allowance/credit usage retained without a fabricated dollar price. No production image or LTX request yet. The separate4000/20,64,180,$8/30 limits remain controlling.',unreportedUpperBoundUsd:.03,outstandingUpperBoundUsd:0,idempotencyKey:'mark6-production-budget-after-'+String(db.prepare('SELECT id FROM production_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 1').get(projectId)?.id??'initial')});
 db.prepare("UPDATE projects SET stage='casting',status='held',updated_at=? WHERE id=?").run(Date.now(),projectId);
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
const result={additionalAvUsd:reviews.estimatedUsd,additionalAvRequests:3,retainedSourceAlignmentEstimateUsd:1.320741,retainedUnknownSourceReserveUsd:.03,existingVoiceCredits:2640,existingVoiceRequests:14,filmSpendGate:checkFilmSpend(db,projectId,0),noNewProviderRequests:true};
writeFileSync(root+'/production-budget-reconciliation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
