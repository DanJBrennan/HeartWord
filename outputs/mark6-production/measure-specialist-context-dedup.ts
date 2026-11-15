import {readFileSync,writeFileSync} from 'node:fs';
import {getDb} from '../../src/db/client.js';
import {scopedCrewPacket} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {type CrewBrief,type CrewContribution} from '../../src/pipeline/creative-direction/crew-types.js';
import {type ProductionRecord} from '../../src/pipeline/creative-direction/production-record.js';
const db=getDb(),runId='163b7760-a2ff-424e-9d1d-b8e7d6fab397';
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!;
const brief=JSON.parse(String(row.brief_json)) as CrewBrief;
const record=(JSON.parse(String(row.result_json)) as {productionRecord:ProductionRecord}).productionRecord;
const contributions:Partial<Record<string,CrewContribution>>={};
for(const event of db.prepare('SELECT role,output_json FROM production_events WHERE run_id=? AND error IS NULL ORDER BY sequence').all(runId)){
 if(['creative_director','scripture_cultural_reviewer'].includes(String(event.role)))contributions[String(event.role)]=JSON.parse(String(event.output_json));
}
// Freeze the same successful prefix; this is read-only and submits no model call.
if(Object.keys(contributions).length!==2)throw Error('Expected exact saved two-role prefix');
const results=[8,16,32].map(count=>{
 const packet=scopedCrewPacket(brief,contributions,record,brief.shots.slice(0,count).map(s=>s.id));
 const legacy={...packet,contributions:Object.fromEntries(Object.entries(packet.contributions).map(([role,output])=>[role,{...output,exchange:contributions[role]!.exchange}]))};
 const beforeBytes=Buffer.byteLength(encodeCrewPacket(legacy)),afterBytes=Buffer.byteLength(encodeCrewPacket(packet));
 if(!Object.values(packet.contributions).every(c=>c!.exchange===undefined))throw Error('Duplicate exchange remained');
 return {targetShots:count,beforePacketBytes:beforeBytes,afterPacketBytes:afterBytes,savedBytes:beforeBytes-afterBytes,reductionPercent:100*(beforeBytes-afterBytes)/beforeBytes};
});
const value={status:'offline_identical_prefix_projection_comparison_no_dispatch',runId,successfulRoles:Object.keys(contributions),results,
 preserved:'Task directions, applicable findings, scoped production history, open objections and exact retrieval; no approval/source/canon change',
 limitation:'Packet bytes only; actual request policy/schema/media captions and later roles still count against existing ceilings. Active worker retains already loaded r22 code.',providerCalls:0};
writeFileSync('outputs/mark6-production/specialist-context-dedup-measurement.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
