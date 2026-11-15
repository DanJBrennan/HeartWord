import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
import {retainedInitialCreativeProposal} from '../../src/pipeline/creative-direction/crew-store.js';
import {appendReasoningReceipt,assertNoUncertainReasoning} from '../../src/pipeline/creative-direction/reasoning-receipts.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const db=getDb(),projectId='c457a815-d07d-4902-91b5-7b936b549856',runId='f74dc915-e606-4da2-8def-f7a018055237';
const evidence=read(root+'/codex-timeout-reconciliation-evidence.json'),usage=read(root+'/codex-usage-recovery-observation.json');
if(!usage.ordinaryUsageAllowed||usage.hasCredits||usage.creditBalance!=='0'||usage.spendControlReached||usage.rateLimitReachedType)throw Error('Included-usage account observation does not permit this recovery');
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(projectId))throw Error('A worker is still active');
const run=db.prepare('SELECT status,result_json FROM production_runs WHERE id=?').get(runId)!;
if(run.status!=='incomplete'||!JSON.parse(String(run.result_json)).summary.includes('timed out'))throw Error('Expected terminal timeout');
try{process.kill(74008,0);throw Error('Timed-out worker PID is still present; do not reconcile');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
if(existsSync(evidence.requestPath.replace('request.json','response.jsonl')))throw Error('A response exists; inspect it instead of this no-result reconciliation');
const submit=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='submit_crew_reasoning' AND json_extract(payload,'$.eventId')=?").get(projectId,evidence.eventId)!;
const original=JSON.parse(String(submit.payload));
if(original.provider!=='codex_cli'||original.input.sha256!==evidence.inputSha256)throw Error('Submission evidence mismatch');
const retained=retainedInitialCreativeProposal(db,getDataDir(),projectId,loadCrewBrief(db,getDataDir(),projectId,'planning'),'b66c122d-7722-436b-bab7-a09f4091159f');
const receipt={provider:'codex_cli',transport:'terminated_after_local_timeout; worker and child exited; no response retained',
 resultAccepted:false,providerSuccessClaimed:false,actualTokenUsage:null,allowanceUsage:'unreported; not zero',costUsd:null,
 billing:'ChatGPT authenticated route; API keys removed by execution adapter. Ordinary included usage remains allowed; account has no paid credits. No purchase/reset/fallback issued. Account percentages are not per-request billing.',
 accountObservation:usage,submissionRetained:true,physicalRequestsRetained:1,
 recovery:'Do not repeat this lost first-role request. Use the older completed exact-input proposal, revalidated normally, then review different specialist tasks.',
 verifiedRecoveryProposal:retained.provenance};
if(!db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='complete_crew_reasoning' AND json_extract(payload,'$.eventId')=?").get(projectId,evidence.eventId))
 appendReasoningReceipt(db,projectId,evidence.eventId,'complete_crew_reasoning',receipt);
assertNoUncertainReasoning(db,projectId);
writeFileSync(root+'/codex-timeout-terminal-reconciliation.json',JSON.stringify({eventId:evidence.eventId,...receipt,newProviderCalls:0},null,2));
console.log(JSON.stringify({terminalTransportReconciled:true,resultAccepted:false,tokenUsage:'unreported',newProviderCalls:0,exactInputRecoveryReady:true}));
