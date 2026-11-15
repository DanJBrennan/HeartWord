import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {generateCodexJson,codexInputBudget} from '../../../src/providers/codex-text.js';
import {reserveBoundedAttempt} from '../attempt-control.js';
import {repairPermit} from './repair-budget.js';
const root=resolve('outputs/mark6-production'),folder=join(root,'bounded-context-repair'),id=process.argv[2],packetFile=process.argv[3],paths=process.argv.slice(4);
if(!id||!packetFile||!/^[a-z0-9-]+$/.test(id)||paths.length>3)throw Error('Exact unique request ID, packet and atmost3images required');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),state=read(join(folder,'execution.json')),packet=read(packetFile),out=join(folder,id);mkdirSync(out,{recursive:true});
if(state.calls.some((c:any)=>c.id===id))throw Error('Retained repair request; no replay');
const schema:any={type:'object',properties:{status:{type:'string',enum:['clear','hold']},summary:{type:'string'},sceneRules:{type:'array',items:{type:'string'},maxItems:8},shotExceptions:{type:'array',maxItems:2,items:{type:'object',properties:{shotId:{type:'string'},change:{type:'string'}},required:['shotId','change']}},evidenceUsed:{type:'array',items:{type:'string'}},unresolved:{type:'array',items:{type:'string'},maxItems:8}},required:['status','summary','sceneRules','shotExceptions','evidenceUsed','unresolved']};
const media=paths.map((p,i)=>({mimeType:'image/png' as const,data:readFileSync(p).toString('base64'),caption:i===0?'Actual corrected candidate to review; not approved.':'Approved identity/body reference; old set decoration does not govern historical correction.'}));
const prompt='Act only as the assigned HeartWord repair role. Follow the scoped packet; do not re-plan the chapter or replay other roles. Source/canon/audio/music and unchanged work remain fixed. Return concise shared scene rules and at most two changed-shot exceptions. Cite evidence IDs actually supplied. Missing necessary evidence means hold; no invented archaeology, native-language certification or approval. This reply is advisory, not chapter acceptance.\n'+JSON.stringify(packet);
const budget=codexInputBudget(prompt,schema,media,24000),reservation=budget.suppliedTextBytes+8000+paths.length*32000;repairPermit(state,reservation);
writeFileSync(join(out,'preflight.json'),JSON.stringify({suppliedTextBytes:budget.suppliedTextBytes,conservativeReservedInputTokens:reservation,images:paths.length,limits:{calls:6,inputTokens:200000},limitation:'Conservative predispatch reserve includes text-byte bound,8000instruction margin and32000/image. Actual reported input is authoritative; unknown or larger result holds further calls.'},null,2),{flag:'wx'});
writeFileSync(join(out,'request.json'),JSON.stringify({packet,prompt,schema,mediaPaths:paths,input:budget},null,2),{flag:'wx'});
let entry:any;const save=()=>writeFileSync(join(folder,'execution.json'),JSON.stringify(state,null,2));
try{
 const response=await generateCodexJson(prompt,schema,media,{maxSuppliedTextBytes:24000,beforeSubmit:()=>{reserveBoundedAttempt(root,'crewRequests','bounded-repair:'+id);entry={id,status:'submitted',reservedInputTokens:reservation,submittedAt:new Date().toISOString()};state.calls.push(entry);state.pendingInputTokens=reservation;save();},retainResponse:(raw,transport)=>writeFileSync(join(out,'response.jsonl'),raw,{flag:'wx'})});
 const input=response.receipt.usage.inputTokens;if(!Number.isSafeInteger(input)||input<1)throw Error('Unknown input usage');
 entry.receipt=response.receipt;entry.status='returned_usage_known';state.knownInputTokens+=input;state.pendingInputTokens=0;writeFileSync(join(out,'result.json'),JSON.stringify(response,null,2),{flag:'wx'});save();
 if(input>reservation||state.knownInputTokens>200000){entry.status='known_usage_exceeded_reserve_hold';save();throw Error('Known usage exceeds bound; no further call');}
 console.log(JSON.stringify({id,status:response.result,inputTokens:input,cumulativeInputTokens:state.knownInputTokens,calls:state.calls.length}));
}catch(error){if(entry&&entry.status==='submitted'){entry.status='held_unknown_no_retry';entry.error=String((error as Error).message);save();}throw error;}
