import {readFileSync,writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';

// Reconcile known receipts only. Cost writes are excluded from visual brief
// hashes; retain and verify that contract even while the review worker runs.
const root='outputs/mark6-production',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const text=readFileSync(root+'/voice-review/execution.json','utf8');
const journal=JSON.parse(text);
if(journal.calls.length!==39||journal.pendingUsd!==0)throw Error('Expected thirty_nine settled AV receipts; inspect changed journal');
let total=0;
for(const call of journal.calls){
  const u=call.usage;
  if(!['returned','returned_reconciled'].includes(call.status)||!u||
    !['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)||u.totalTokenCount<=0||
    (Math.round(u.promptTokenCount*.75+(u.candidatesTokenCount+u.thoughtsTokenCount)*3.75)/1e6!==call.costUsd&&Math.round((u.promptTokenCount*.75/1e6+(u.candidatesTokenCount+u.thoughtsTokenCount)*3.75/1e6)*1e6)/1e6!==call.costUsd))throw Error('Unknown or inconsistent actual AV usage');
  total+=call.costUsd;
}
if(+total.toFixed(6)!==journal.estimatedUsd)throw Error('AV journal total mismatch');
const db=getDb(),added:Array<{id:string;costUsd:number}>=[];
try{
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('BEGIN IMMEDIATE');
  try{
    const before=crewBriefHash(loadCrewBrief(db,getDataDir(),projectId,'planning'),'planning');
    for(const call of journal.calls){
      const id='mark6-production-audio-review-'+call.id;
      const old=db.prepare('SELECT project_id,amount_usd FROM cost_ledger_entries WHERE id=?').get(id);
      if(old){if(old.project_id!==projectId||old.amount_usd!==call.costUsd)throw Error('Existing receipt ID has different authority or amount');continue;}
      db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,NULL,?,?)').run(id,projectId,call.costUsd,Date.now());
      added.push({id,costUsd:call.costUsd});
    }
    const after=crewBriefHash(loadCrewBrief(db,getDataDir(),projectId,'planning'),'planning');
    if(after!==before)throw Error('Cost reconciliation changed creative inputs; rolling back');
    if(readFileSync(root+'/voice-review/execution.json','utf8')!==text)throw Error('AV journal changed during reconciliation; rolling back');
    db.exec('COMMIT');
    const report={at:new Date().toISOString(),status:'all_thirty_nine_known_av_receipts_in_film_ledger',added,
      addedUsd:+added.reduce((n,c)=>n+c.costUsd,0).toFixed(6),totalAvUsd:journal.estimatedUsd,
      sourceAlignmentAndReserveUnchanged:true,allCountersRetained:true,planningBriefHash:after,
      currentReviewInputsUnchanged:true,providerCalls:0};
    writeFileSync(root+'/known-av-ledger-reconciliation-commissioning-quiet-tail-20261107.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  }catch(error){db.exec('ROLLBACK');throw error;}
}finally{db.close();}



