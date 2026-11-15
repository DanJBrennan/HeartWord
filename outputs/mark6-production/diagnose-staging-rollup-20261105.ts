import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chapterCrewPacket,normalizeTaskDirections,shotTaskResponseReconciliation} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {stripOptionalNulls} from '../../src/providers/codex-text.js';
const run='072e435b-b0f8-465b-b87f-1b730f5d1345',project='c457a815-d07d-4902-91b5-7b936b549856',root='outputs/mark6-production';
const db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(run)!;
const brief=JSON.parse(String(row.brief_json)),saved=JSON.parse(String(row.result_json));
const base='C:/Users/danbr/HeartWordData/assets/preparation/crew-reasoning/'+project,tasks:any[]=[];
for(const name of readdirSync(base).filter(n=>[run,'3ab233d2-3a87-4f28-af66-5ea8e6c2341f'].some(r=>n.startsWith(r+'_staging_designer_1_task-')))){
 const dir=join(base,name),request=JSON.parse(readFileSync(join(dir,'request.json'),'utf8'));
 const events=readFileSync(join(dir,'response.jsonl'),'utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l));
 const raw=JSON.parse(events.find(e=>e.type==='item.completed'&&e.item?.type==='agent_message').item.text);
 const ids=Object.keys(request.schema.properties.directions.anyOf[0].properties);
 const {contextRequests,...body}=stripOptionalNulls(raw,request.schema);
 tasks.push(validateContribution(normalizeTaskDirections(body,ids),'staging_designer',brief));
}
const {proposal,candidates}=shotTaskResponseReconciliation(tasks);
const packet:any=chapterCrewPacket(brief,{...saved.contributions,staging_designer:proposal},saved.productionRecord,'staging_designer');
packet.contributions=Object.fromEntries(Object.entries(packet.contributions).map(([owner,c]:any)=>{const{directions,taskSummaries,...rest}=c;return[owner,{...rest,directions:owner==='staging_designer'?directions:[]}]}));
packet.shotTaskResponseReconciliation={candidates};
const bytes=(x:any)=>Buffer.byteLength(JSON.stringify(x),'utf8'),size=(o:any)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,bytes(v)]));
const compact={...packet,chapterIssueIndex:packet.chapterIssueIndex.map(({id,owner,shotId,severity,status,globalAdvisoryRequest}:any)=>({id,owner,shotId,severity,status,...(globalAdvisoryRequest?{globalAdvisoryRequest}:{})}))};
const proof={compactIndexEncodedCharacters:encodeCrewPacket(compact).length,compactIndexEncodedBytes:Buffer.byteLength(encodeCrewPacket(compact),'utf8'),runId:run,sourceTasks:tasks.length,uniqueDirections:new Set(proposal.directions.map(d=>d.shotId)).size,packetEncodedCharacters:encodeCrewPacket(packet).length,packetEncodedBytes:Buffer.byteLength(encodeCrewPacket(packet),'utf8'),topLevelBytes:size(packet),contributionBytes:Object.fromEntries(Object.entries(packet.contributions).map(([k,v])=>[k,size(v)])),recordBytes:size(packet.productionRecord),candidatesBytes:bytes(candidates),newProviderCalls:0,databaseWrites:0,limitation:'Offline structural diagnostic, not a review or approved continuation.'};
writeFileSync(root+'/staging-rollup-packet-diagnosis-20261105.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));db.close();
