// Explicit expected count; preserve every receipt/counter, no API call or approval.
import {readFileSync,writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
const root='outputs/mark6-production',project='c457a815-d07d-4902-91b5-7b936b549856',expected=Number(process.argv[2]),text=readFileSync(root+'/voice-review/execution.json','utf8'),journal=JSON.parse(text),main=JSON.parse(readFileSync(root+'/execution.json','utf8')),native=JSON.parse(readFileSync(root+'/native-generation/execution.json','utf8'));
if(!Number.isSafeInteger(expected)||expected<=0||expected>journal.maximumRequests||journal.maximumRequests!==main.limits.geminiAvRequests||journal.calls.length!==expected||journal.pendingUsd!==0||new Set(journal.calls.map((c:any)=>c.id)).size!==expected)throw Error('Exact expected settled unique AV count and controlled ceiling required');
if(native.entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Reconcile at settled native boundary; do not open long planning snapshot during live inference');
let total=0;
for(const c of journal.calls){
 const u=c.usage;
 if(!['returned','returned_reconciled','returned_usage_known_result_held'].includes(c.status)||!u||!['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)||u.totalTokenCount<=0||(Math.round(u.promptTokenCount*.75+(u.candidatesTokenCount+u.thoughtsTokenCount)*3.75)/1e6!==c.costUsd&&Math.round((u.promptTokenCount*.75/1e6+(u.candidatesTokenCount+u.thoughtsTokenCount)*3.75/1e6)*1e6)/1e6!==c.costUsd))throw Error('Unknown or inconsistent actual metered receipt; no invented charge');
 total+=c.costUsd;
}
if(+total.toFixed(6)!==journal.estimatedUsd)throw Error('Actual AV total mismatch');
const db=getDb(),added:Array<{id:string;costUsd:number}>=[];
try{
 db.exec('PRAGMA busy_timeout=5000');db.exec('BEGIN IMMEDIATE');
 try{
  const before=crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning');
  for(const c of journal.calls){
   const id='mark6-production-audio-review-'+c.id,old=db.prepare('SELECT project_id,amount_usd FROM cost_ledger_entries WHERE id=?').get(id);
   if(old){if(old.project_id!==project||old.amount_usd!==c.costUsd)throw Error('Existing receipt authority/amount changed');continue;}
   db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,NULL,?,?)').run(id,project,c.costUsd,Date.now());added.push({id,costUsd:c.costUsd});
  }
  const after=crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning');
  if(before!==after||readFileSync(root+'/voice-review/execution.json','utf8')!==text||JSON.parse(readFileSync(root+'/native-generation/execution.json','utf8')).entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Creative inputs, receipt journal or settled native boundary changed; rollback');
  db.exec('COMMIT');
  const report={at:new Date().toISOString(),status:'all_known_expected_receipts_in_film_ledger',expectedCalls:expected,added,addedUsd:+added.reduce((n,c)=>n+c.costUsd,0).toFixed(6),totalAvUsd:journal.estimatedUsd,planningBriefHash:after,allCountersRetained:true,sourceAlignmentAndReserveUnchanged:true,knownHeldResultsRemainHeld:true,providerCalls:0};
  const path=root+`/known-av-ledger-reconciliation-count${expected}-${Date.now()}.json`;writeFileSync(path,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({...report,path}));
 }catch(e){db.exec('ROLLBACK');throw e;}
}finally{db.close();}
