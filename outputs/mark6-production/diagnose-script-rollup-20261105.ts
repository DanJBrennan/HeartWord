import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chapterCrewPacket,normalizeTaskDirections,shotTaskResponseReconciliation} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {stripOptionalNulls} from '../../src/providers/codex-text.js';
const run='de1770c9-f575-46f5-9260-bc4128a9f7cd',project='c457a815-d07d-4902-91b5-7b936b549856',root='outputs/mark6-production';
const db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(run)!;
const brief=JSON.parse(String(row.brief_json)),saved=JSON.parse(String(row.result_json));
const base='C:/Users/danbr/HeartWordData/assets/preparation/crew-reasoning/'+project,tasks:any[]=[];
for(const name of readdirSync(base).filter(n=>[run].some(r=>n.startsWith(r+'_script_supervisor_1_chapter-detail_task-')))){
 const dir=join(base,name),request=JSON.parse(readFileSync(join(dir,'request.json'),'utf8'));
 const events=readFileSync(join(dir,'response.jsonl'),'utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l));
 const raw=JSON.parse(events.find(e=>e.type==='item.completed'&&e.item?.type==='agent_message').item.text);
 const ids=Object.keys(request.schema.properties.directions.anyOf[0].properties);
 const {contextRequests,...body}=stripOptionalNulls(raw,request.schema);
 tasks.push(validateContribution(normalizeTaskDirections(body,ids),'script_supervisor',brief));
}
const {proposal,candidates}=shotTaskResponseReconciliation(tasks);
const packet:any=chapterCrewPacket(brief,{...saved.contributions,script_supervisor:proposal},saved.productionRecord,'script_supervisor');
packet.contributions=Object.fromEntries(Object.entries(packet.contributions).map(([owner,c]:any)=>{const{directions,taskSummaries,...rest}=c;return[owner,{...rest,directions:owner==='script_supervisor'?directions:[]}]}));
packet.shotTaskResponseReconciliation={candidates};
const bytes=(x:any)=>Buffer.byteLength(JSON.stringify(x),'utf8'),size=(o:any)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,bytes(v)]));
const compact={...packet,chapterIssueIndex:packet.chapterIssueIndex.map(({id,owner,shotId,severity,status,globalAdvisoryRequest}:any)=>({id,owner,shotId,severity,status,...(globalAdvisoryRequest?{globalAdvisoryRequest}:{})}))};
const slim={...packet,historyIndex:packet.historyIndex.filter((h:any)=>['proposal','revision'].includes(h.kind)),contributions:Object.fromEntries(Object.entries(packet.contributions).map(([owner,c]:any)=>[owner,owner==='script_supervisor'?c:{...c,objectionResponses:[],objectionResponseIndex:(c.objectionResponses??[]).map(({objectionId,outcome}:any)=>({objectionId,outcome})),objectionResponseSource:{sha256:'0'.repeat(64),access:'previous_role:'+owner+'#/roleOutput/objectionResponses'}}]))};
const proof={slimEncodedCharacters:encodeCrewPacket(slim).length,slimEncodedBytes:Buffer.byteLength(encodeCrewPacket(slim),'utf8'),compactIndexEncodedCharacters:encodeCrewPacket(compact).length,compactIndexEncodedBytes:Buffer.byteLength(encodeCrewPacket(compact),'utf8'),runId:run,sourceTasks:tasks.length,uniqueDirections:new Set(proposal.directions.map(d=>d.shotId)).size,packetEncodedCharacters:encodeCrewPacket(packet).length,packetEncodedBytes:Buffer.byteLength(encodeCrewPacket(packet),'utf8'),topLevelBytes:size(packet),contributionBytes:Object.fromEntries(Object.entries(packet.contributions).map(([k,v])=>[k,size(v)])),recordBytes:size(packet.productionRecord),candidatesBytes:bytes(candidates),newProviderCalls:0,databaseWrites:0,limitation:'Offline structural diagnostic, not a review or approved continuation.'};
writeFileSync(root+'/script-rollup-packet-diagnosis-20261105.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));db.close();
