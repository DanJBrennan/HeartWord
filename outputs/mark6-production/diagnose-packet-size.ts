import {writeFileSync} from 'node:fs';
import {getDb} from '../../src/db/client.js';
import {crewSchema} from '../../src/pipeline/creative-direction/crew.js';
import {scopedCrewPacket} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
const db=getDb(),runId='163b7760-a2ff-424e-9d1d-b8e7d6fab397',bytes=(s:string)=>Buffer.byteLength(s);
const run=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!;
const brief=JSON.parse(String(run.brief_json)),result=JSON.parse(String(run.result_json));
const record=structuredClone(result.productionRecord);record.status='proposed';
const failed=db.prepare("SELECT prompt,error FROM production_events WHERE run_id=? AND role='choreographer' AND error IS NOT NULL").get(runId)!;
const target=brief.shots[0].id,current=scopedCrewPacket(brief,result.contributions,record,[target]);
const legacy={...current,contributions:Object.fromEntries(Object.entries(current.contributions).map(([role,out])=>[role,{...out,exchange:result.contributions[role].exchange}]))};
const encoded=encodeCrewPacket({...legacy,retrievedEvidence:{}}),newEncoded=encodeCrewPacket({...current,retrievedEvidence:{}});
const schema:any=crewSchema('choreographer','planning',false,true);
for(const field of ['creativeResponses','ownerResponses','withdrawals','objectionResponses'])schema.properties[field].maxItems=0;
schema.properties.contextRequests={type:'array',items:{type:'string'},maxItems:12};
function pin(node:any){if(!node||typeof node!=='object')return;if(node.properties?.shotId)node.properties.shotId={...node.properties.shotId,enum:brief.shots.map((s:any)=>s.id)};if(node.properties?.shotIds?.items)node.properties.shotIds.items={...node.properties.shotIds.items,enum:brief.shots.map((s:any)=>s.id)};for(const v of Object.values(node))if(Array.isArray(v))v.forEach(pin);else if(v&&typeof v==='object')pin(v);}
pin(schema);schema.properties.directions.items.properties.shotId.enum=[target];
const original=String(failed.prompt),begin=original.indexOf('BOUNDED CONTEXT:\n'),end=original.indexOf('\nUse filmChanges',begin);
let policy=original.slice(0,begin).replace('Review the whole chapter and preceding contributions.','Design the TASK shots using chapter overview and preceding contributions; whole-chapter review remains with the chapter reviewers.')
 .replace(/Your directions array must contain exactly [^\n]+\n/,`Your directions array must contain exactly 1 distinct entries, one per TASK shotId: ${JSON.stringify([target])}.\n`).replace('every shot, including continuity','every TASK shot, including continuity');
const suffix=end<0?'':original.slice(end);
const wrapper=policy+'TASK CONTEXT: specialist; batch 1/9; evidence 0/2.\n'+'If exact earlier evidence is required, return contextRequests with saved refs and provisional empty directions/findings; this is not a contribution. At most two evidence rounds. Never claim omitted records were reviewed.\n'+'BOUNDED CONTEXT:\n'+'\n'+suffix;
const fullBytes=bytes(encoded),marginals=[];
for(const key of ['brief.producerNotes','brief.source','brief.shots','brief.canon','brief.audio','contributions','productionRecord.history','productionRecord.objections','task','audit','stateReadPolicy','archiveAccess']){
 const copy:any=structuredClone({...legacy,retrievedEvidence:{}}),path=key.split('.');let parent=copy;for(const k of path.slice(0,-1))parent=parent[k];const val=parent[path.at(-1)!];delete parent[path.at(-1)!];
 marginals.push({section:key,rawJsonBytes:val===undefined?0:bytes(JSON.stringify(val)),encodedBytesSavedIfOnlyThisSectionRemoved:fullBytes-bytes(encodeCrewPacket(copy))});
}
const parsed=JSON.parse(encoded);let stringValueBytes=0;
function stringContent(v:any){if(typeof v==='string')stringValueBytes+=bytes(JSON.stringify(v))-2;else if(v&&typeof v==='object')Object.values(v).forEach(stringContent);}
stringContent(parsed);
const history:any[]=legacy.productionRecord?.history??[],context=new Set(current.task.continuityShotIds.concat(current.task.shotIds));
const candidates=history.filter(h=>!h.scope.shotIds.some((id:string)=>context.has(id))&&!h.proposedChanges.length);
const value={status:'read_only_failed_packet_attribution_not_runtime_change',runId,recordedFailure:failed.error,
 reconstructed:{taskShotCount:1,continuityShotCount:current.task.continuityShotIds.length,packetBytes:fullBytes,policyAndWrapperBytes:bytes(wrapper),schemaBytes:bytes(JSON.stringify(schema)),totalTextSchemaBytes:fullBytes+bytes(wrapper)+bytes(JSON.stringify(schema)),effectiveLimitBytes:195904,localSpecialistSettingBytes:200000,headroomReservedBytes:4096,chapterSettingBytes:600000},
 duplicateExchangeFix:{oldEncodedPacketBytes:fullBytes,newEncodedPacketBytes:bytes(newEncoded),savedBytes:fullBytes-bytes(newEncoded)},
 encodedComposition:{stringValueContentBytes:stringValueBytes,keysPunctuationAndNonStringValuesBytes:fullBytes-stringValueBytes,note:'Exact serialized string-content vs remaining bytes. Identifier/hash strings and prose are both string content; remaining bytes include key names and references, not just braces.'},
 sectionRemovalExperiments:marginals.sort((a,b)=>b.encodedBytesSavedIfOnlyThisSectionRemoved-a.encodedBytesSavedIfOnlyThisSectionRemoved),
 relevance:{currentTargetAndNeighbors:context.size,chapterShots:brief.shots.length,retainedHistoryEntries:history.length,retainedHistoryWithoutTargetShotScopeOrFactChanges:candidates.length,examples:candidates.slice(0,6).map(h=>({id:h.id,kind:h.kind,owner:h.owner,rationale:h.rationale.slice(0,250)})),caution:'No target shot scope is not proof of irrelevance. These may be global blockers or linked evidence. Count is a review lead, not permission to drop records.'},
 interpretation:'Section removal is a marginal experiment, not an additive allocation: shared values are deduplicated across sections. No field has been removed from a submitted request by this diagnostic.',providerCalls:0};
writeFileSync('outputs/mark6-production/packet-size-diagnosis.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
