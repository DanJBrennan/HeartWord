// Offline reconstruction of the actual rejected follow-up; never a model call.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {getDataDir} from '../../src/db/client.js';
import {retrieveCrewEvidence} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
import {codexInputBudget,parseCodexEvents} from '../../src/providers/codex-text.js';
import type {CrewContribution} from '../../src/pipeline/creative-direction/crew-types.js';
const root='outputs/mark6-production',data=getDataDir(),db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true}),runId='5466f89f-d556-4144-9e0a-2e234e6e23fe';
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!,brief=JSON.parse(String(row.brief_json)),record=JSON.parse(String(row.result_json)).productionRecord;
const folder=join(data,'assets/preparation/crew-reasoning',brief.project.id,runId+'_creative_director_1_task-1_evidence-0');
const request=JSON.parse(readFileSync(join(folder,'request.json'),'utf8')),reply=parseCodexEvents(readFileSync(join(folder,'response.jsonl'),'utf8')).result as {contextRequests:string[]};
const retained:Record<string,CrewContribution>={};
for(const e of db.prepare('SELECT e.id,e.output_json FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.error IS NULL AND e.output_json IS NOT NULL').all(brief.project.id)){
 if(!record.history.some((h:{id:string})=>h.id===e.id))continue;
 const output=JSON.parse(String(e.output_json));if(output.exchange?.some((h:{id:string})=>h.id===e.id))retained[String(e.id)]=output;
}
const begin=request.prompt.indexOf('BOUNDED CONTEXT:\n')+'BOUNDED CONTEXT:\n'.length,end=request.prompt.indexOf('\nUse filmChanges',begin),wire=JSON.parse(request.prompt.slice(begin,end));
const decode=(v:any):any=>v&&typeof v==='object'&&v.$ref?decode(wire.definitions[Number(v.$ref.split('/').at(-1))]):Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,decode(v)])):v;
const packet=decode(wire.payload??wire),before=recordHash(record),media=request.media.map((m:any)=>({mimeType:m.mimeType,data:readFileSync(m.path).toString('base64'),caption:m.caption}));
const variants=[];
for(const selected of [false,true]){
 const refs=reply.contextRequests.map(ref=>!selected?ref:ref+'#/roleOutput/'+(ref.includes('creative_director')?'emotionalTreatment':ref==='previous_role:script_supervisor'?'findings':'treatmentReview'));
 const evidence=retrieveCrewEvidence(brief,record,refs,retained),prompt=request.prompt.slice(0,begin)+encodeCrewPacket({...packet,retrievedEvidence:evidence})+request.prompt.slice(end);
 let budget:unknown,error:string|null=null;try{budget=codexInputBudget(prompt,request.schema,media,1000000);}catch(e){error=(e as Error).message;}
 variants.push({selectedFields:selected,refs,evidenceBytes:Buffer.byteLength(JSON.stringify(evidence)),promptCharacters:prompt.length,budget,error,missingSelectedFields:Object.values(evidence).filter((e:any)=>e.selection?.present===false).length});
}
if(!variants[0]!.error?.includes('transport character limit')||variants[1]!.error||recordHash(record)!==before)throw Error('Expected rejected full evidence and fitting exact fields without mutation');
writeFileSync(join(root,'field-evidence-preflight-20261105.json'),JSON.stringify({status:'actual_failed_followup_reconstructed_offline',runId,variants,newProviderCalls:0,recordUnchanged:true,limitation:'Selected fields remain historical partial evidence, not full-proposal acknowledgement or current review approval. No model was called.'},null,2));
console.log(JSON.stringify(variants.map(v=>({selectedFields:v.selectedFields,evidenceBytes:v.evidenceBytes,promptCharacters:v.promptCharacters,error:v.error,missingSelectedFields:v.missingSelectedFields}))));db.close();
