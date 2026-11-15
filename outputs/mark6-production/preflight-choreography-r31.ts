import {writeFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {dispatchCrewTask} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewSchema,validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {crewInputBudget} from '../../src/providers/input-budget.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
const db=getDb(),runId='99d9d506-f6bd-44fc-b5bb-76d8511b5b4e';
const run=db.prepare('SELECT * FROM production_runs WHERE id=?').get(runId)!;
if(run.status!=='incomplete')throw Error('Only terminal failed input may replay');
const brief=JSON.parse(String(run.brief_json)),result=JSON.parse(String(run.result_json));
const failed=db.prepare("SELECT prompt,error FROM production_events WHERE run_id=? AND role='choreographer' AND error IS NOT NULL").get(runId)!;
let observed:any;
try{
 await dispatchCrewTask({prompt:String(failed.prompt),schema:crewSchema('choreographer','planning',false,true),media:canonReferenceMedia(db,getDataDir(),brief,{compact:true}),role:'choreographer',phase:'planning',brief,contributions:result.contributions,record:result.productionRecord,
 specialistBytes:200000,chapterBytes:600000,onRequest:()=>{},validate:raw=>validateContribution(raw,'choreographer',brief),call:async(prompt,schema,media)=>{
  observed={...crewInputBudget(prompt+media.map(m=>m.caption??'').join('\n'),schema,195904),taskSize:Number(prompt.match(/exactly (\d+) distinct entries/)![1]),imageCount:media.length,promptBytes:Buffer.byteLength(prompt),schemaBytes:Buffer.byteLength(JSON.stringify(schema)),contextStart:Buffer.byteLength(prompt.split('BOUNDED CONTEXT:\n')[0]!),contextBytes:Buffer.byteLength(prompt.split('BOUNDED CONTEXT:\n')[1]!.split('\nUse filmChanges')[0]!)};
  const encoded=JSON.parse(prompt.split('BOUNDED CONTEXT:\n')[1]!.split('\nUse filmChanges')[0]!);
  const decode=(v:any):any=>v&&typeof v==='object'&&v.$ref?decode(encoded.definitions[Number(v.$ref.split('/').at(-1))]):Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
  const packet=decode(encoded.payload??encoded),base=Buffer.byteLength(encodeCrewPacket(packet));
  observed.sectionSavings=Object.fromEntries(Object.keys(packet).map(key=>{const copy={...packet};delete copy[key];return[key,base-Buffer.byteLength(encodeCrewPacket(copy))];}));
  throw Error('OFFLINE_REACHED_SUBMISSION_NO_PROVIDER_CALL');
 }});
}catch(e){if((e as Error).message!=='OFFLINE_REACHED_SUBMISSION_NO_PROVIDER_CALL')throw e;}
if(!observed)throw Error('No submission reached');
const value={status:'saved_choreography_failure_now_passes_original_guard',sourceRunId:runId,priorFailure:failed.error,observed,newProviderCalls:0,limitsUnchanged:true,notAnApproval:true};
writeFileSync('outputs/mark6-production/preflight-choreography-r31.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
