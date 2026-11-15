import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {parseCodexEvents,stripOptionalNulls,CODEX_CREW_MODEL} from '../../src/providers/codex-text.js';
import {validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {appendReasoningReceipt,assertNoUncertainReasoning} from '../../src/pipeline/creative-direction/reasoning-receipts.js';
const projectId='c457a815-d07d-4902-91b5-7b936b549856',runId='7181d4c9-606c-46b1-b482-0976d204d3e6',eventId=runId+':staging_designer:1:task-6:evidence-0',db=getDb();
db.exec('PRAGMA busy_timeout=5000');
const run=db.prepare('SELECT status,brief_json FROM production_runs WHERE id=? AND project_id=?').get(runId,projectId)!;
if(run.status!=='incomplete'||db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(projectId))throw Error('Only the terminal run can reconcile');
const folder=join(getDataDir(),'assets','preparation','crew-reasoning',projectId,eventId.replaceAll(':','_'));
if(existsSync(join(folder,'usage.json')))throw Error('Original usage already exists; inspect rather than overwrite');
const requestBytes=readFileSync(join(folder,'request.json')),request=JSON.parse(requestBytes.toString('utf8')),response=readFileSync(join(folder,'response.jsonl'),'utf8'),parsed=parseCodexEvents(response);
if(request.requestedModel!==CODEX_CREW_MODEL||request.reasoningEffort!=='medium')throw Error('Unexpected original model route');
const {contextRequests,...raw}=stripOptionalNulls(parsed.result,request.schema),output=validateContribution(raw,'staging_designer',JSON.parse(String(run.brief_json)));
const targets:string[]=request.schema.properties.directions.items.properties.shotId.enum;
if(contextRequests?.length||output.directions.length!==targets.length||new Set(output.directions.map(d=>d.shotId)).size!==targets.length||output.directions.some(d=>!targets.includes(d.shotId)))throw Error('Retained reply is not a completed valid task');
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const receipt={provider:'codex_cli',requestedModel:CODEX_CREW_MODEL,reportedModel:parsed.reportedModel,reasoningEffort:'medium',authentication:'chatgpt',billing:'chatgpt_allowance_or_credits',costUsd:null,
 usage:parsed.usage,suppliedTextBytes:request.input.suppliedTextBytes,inputSha256:request.input.sha256,diagnostics:parsed.diagnostics,
 recoveredFromCompletedTransport:true,reason:'Database lock prevented the normal completion receipt after response.jsonl was saved',requestSha256:hash(requestBytes),responseSha256:hash(response),
 limitation:'Usage reconstructed from retained turn.completed, not a fresh model call, invoice, whole-role completion or plan acceptance.'};
writeFileSync(join(folder,'usage-recovered.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
appendReasoningReceipt(db,projectId,eventId,'complete_crew_reasoning',{provider:'codex_cli',requestedModel:CODEX_CREW_MODEL,status:'completed_transport_receipt_recovered_after_database_lock',evidenceDir:folder,receipt,recoveredUsagePath:join(folder,'usage-recovered.json'),newProviderCalls:0});
assertNoUncertainReasoning(db,projectId);
const proof={status:'terminal_database_lock_submission_reconciled',eventId,requestSha256:receipt.requestSha256,responseSha256:receipt.responseSha256,usage:receipt.usage,validRetainedTaskDirections:output.directions.length,
 wholeRoleCompleted:false,sourceRunAccepted:false,newProviderCalls:0,unresolvedReasoningSubmissions:0,usageEvidence:join(folder,'usage-recovered.json')};
writeFileSync('outputs/mark6-production/staging-lock-reconciliation-r33.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
