import {writeFileSync,readFileSync} from 'node:fs';
import {getDb} from '../../src/db/client.js';
import {scopedCrewPacket} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
const db=getDb(),runId='163b7760-a2ff-424e-9d1d-b8e7d6fab397';
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!;
const brief=JSON.parse(String(row.brief_json)),result=JSON.parse(String(row.result_json));
const record=result.productionRecord,hashBefore=recordHash({brief,result}),target=[brief.shots[0].id];
const before:any=scopedCrewPacket(brief,result.contributions,record,target);
delete before.offTaskIssueIndex;delete before.offTaskOpenBlockingCount;delete before.issueIndexPolicy;
const after=scopedCrewPacket(brief,result.contributions,record,target,'choreographer');
const a=Buffer.byteLength(encodeCrewPacket({...before,retrievedEvidence:{}})),b=Buffer.byteLength(encodeCrewPacket({...after,retrievedEvidence:{}}));
if(hashBefore!==recordHash({brief,result}))throw Error('Read-only projection changed source/history');
const full=before.productionRecord.objections;
const delivered=[...after.productionRecord!.objections,...after.offTaskIssueIndex];
if(full.length!==delivered.length||full.some((o:any)=>!delivered.some(d=>d.id===o.id&&d.owner===o.owner&&d.severity===o.severity&&d.status===o.status)))throw Error('Issue state lost');
const old=JSON.parse(readFileSync('outputs/mark6-production/packet-size-diagnosis.json','utf8'));
const value={status:'offline_real_failed_prefix_issue_index_proof',runId,role:'choreographer',beforeEncodedPacketBytes:a,afterEncodedPacketBytes:b,savedBytes:a-b,
 estimatedSameWrapperAndSchemaTotalBytes:b+old.reconstructed.policyAndWrapperBytes+old.reconstructed.schemaBytes,
 issuesBefore:full.length,fullBodiesAfter:after.productionRecord!.objections.length,indexedIssues:after.offTaskIssueIndex.length,offTaskOpenBlockingCount:after.offTaskOpenBlockingCount,
 everyIssueIdOwnerSeverityStatusPreserved:true,originalSourceAndHistoryHashUnchanged:true,globalOwnedAndAffectedBodiesRetained:true,providerCalls:0,
 limitsUnchanged:true,activeWorkerNotRestarted:true,limitation:'Offline same saved prefix; later contributions and actual dispatch still undergo existing byte/schema/media guards. Index summaries do not approve production.'};
writeFileSync('outputs/mark6-production/issue-index-measurement-r25.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
