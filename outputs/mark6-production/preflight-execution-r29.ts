import {writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {loadCrewBrief,crewBriefHash} from '../../src/pipeline/creative-direction/crew-context.js';
import {retainedInitialCreativeProposal,retainedInitialScriptureProposal,retainedInitialCameraProposal} from '../../src/pipeline/creative-direction/crew-store.js';
import {scopedCrewPacket,retrieveCrewEvidence} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
import {assertNoUncertainReasoning} from '../../src/pipeline/creative-direction/reasoning-receipts.js';
const db=getDb(),projectId='c457a815-d07d-4902-91b5-7b936b549856',sourceRunId='4511c6c3-f3cb-4a7f-8b65-936dc9fdac8e';
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(projectId))throw Error('Active worker, do not duplicate');
assertNoUncertainReasoning(db,projectId);
const brief=loadCrewBrief(db,getDataDir(),projectId,'planning');
const creative=retainedInitialCreativeProposal(db,getDataDir(),projectId,brief,'b66c122d-7722-436b-bab7-a09f4091159f');
const scripture=retainedInitialScriptureProposal(db,projectId,brief,sourceRunId,creative.reply);
const camera=retainedInitialCameraProposal(db,getDataDir(),projectId,brief,'844299e7-6367-4c90-906b-d051bada1dd0',creative.reply,scripture.reply);
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(sourceRunId)!;
const b=JSON.parse(String(row.brief_json)),result=JSON.parse(String(row.result_json)),record=result.productionRecord;
const before=recordHash({b,result}),target=[b.shots[0].id];
const full=scopedCrewPacket(b,result.contributions,record,target),scoped=scopedCrewPacket(b,result.contributions,record,target,'cinematographer');
const delivered=[...scoped.productionRecord!.objections,...scoped.offTaskIssueIndex];
if(record.objections.some((o:any)=>!delivered.some(d=>d.id===o.id&&d.owner===o.owner&&d.status===o.status&&d.severity===o.severity)))throw Error('Issue state lost');
for(const entry of scoped.offTaskIssueIndex)retrieveCrewEvidence(b,record,[entry.evidenceRef]);
if(before!==recordHash({b,result}))throw Error('Source history changed');
const value={status:'read_only_exact_input_and_context_verified',briefHash:crewBriefHash(brief,'planning'),creative:creative.provenance,scripture:scripture.provenance,camera:camera.provenance,cameraDirections:camera.reply.directions.length,
 beforeContextBytes:Buffer.byteLength(encodeCrewPacket({...full,retrievedEvidence:{}})),afterContextBytes:Buffer.byteLength(encodeCrewPacket({...scoped,retrievedEvidence:{}})),
 allIssueStatesPreserved:true,originalHistoryUnchanged:true,allIndexedEvidenceRetrievable:true,fullBodies:scoped.productionRecord!.objections.length,indexedIssues:scoped.offTaskIssueIndex.length,
 newProviderCalls:0,limitations:'Saved prefix replay, not actual dispatch or accepted plan. Runtime byte/schema/ownership checks remain.'};
writeFileSync('outputs/mark6-production/preflight-execution-r29.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
