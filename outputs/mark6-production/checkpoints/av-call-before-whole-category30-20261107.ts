// Mark 6 operational runner: extends the existing review journal, no new stage.
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {reserveBoundedAttempt} from './attempt-control.js';
import {generateJsonWithImagesMetered,GeminiResponseError,GEMINI_TEXT_MODEL,type GeminiJsonSchema,type GeminiMediaInput} from '../../src/providers/gemini-text.js';
const root=resolve('outputs/mark6-production'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const limits={wholePerformanceAV:20,pairedSceneReviews:4,finalFilmParts:3,correctionReserve:7};
export type AvCategory=keyof typeof limits;
// Contextual extras have explicitly mapped canon boards, even when they are
// outside the principal cast's reference numbering. Unmapped set supplements
// are not character identity inputs and should not expand every review packet.
export function selectMotionReviewReferences(provenance:{prompt:string;generationInputs:Array<{path:string;sha256:string;referenceNumbers:number[]}>}){
 const inputMap=provenance.prompt.split('REFERENCE INPUT MAP:')[1]?.split('\nCONTROLLING SCOPED HISTORICAL')[0]??'';
 const extraMaps=[...provenance.prompt.matchAll(/ADDITIONAL (?:ACTOR|CANON GROUP) MAP: IMAGE(\d+)([^\n]*)/g)];
 const extraIndices=new Set(extraMaps.map(m=>Number(m[1])-1));
 if([...extraIndices].some(i=>!Number.isInteger(i)||i<0||i>=provenance.generationInputs.length))throw Error('Invalid supplementary canon input map');
 return provenance.generationInputs.map((r,i)=>({r,i})).filter(({r,i})=>r.referenceNumbers.length||extraIndices.has(i)).map(({r,i})=>({r,i,caption:'Generation reference IMAGE'+(i+1)+'. Follow mapped CANON versus SET ONLY roles; counts apply to target frame, not reference scenes. '+inputMap+'\n'+extraMaps.filter(m=>Number(m[1])===i+1).map(m=>m[0]).join('\n')}));
}
export function inspectAvBudget(state:any,model:any,category:AvCategory,now=Date.now()){
 if(!Object.hasOwn(limits,category)||state.maximumRequests!==40||state.maximumUsd!==8)throw Error('Unexpected Mark 6 AV limits');
 if(model.model!==GEMINI_TEXT_MODEL||model.inputTokenLimit!==1048576||model.maxReviewOutputTokens!==8192||now>Date.parse('2027-01-01T00:00:00Z')||!Number.isFinite(Date.parse(model.observedAt))||Math.abs(now-Date.parse(model.observedAt))>86400000)throw Error('Fresh model/pricing preflight required');
 let total=0;
 for(const c of state.calls){
  if(!['returned','returned_reconciled','returned_usage_known_result_held'].includes(c.status)||!validReceipt(c))throw Error('Unknown or pending AV charge; no submission');
  total+=c.costUsd;
 }
 total=+total.toFixed(6);
 if(total!==state.estimatedUsd||state.pendingUsd!==0)throw Error('AV journal reconciliation mismatch');
 const reserve=Math.ceil((model.inputTokenLimit*.75+8192*3.75)/1000000*100)/100;
 if(reserve!==model.conservativeRequestReserveUsd||total+reserve>8||state.calls.length>=40||state.calls.filter((c:any)=>c.category===category).length>=limits[category])throw Error('AV request/category/dollar ceiling');
 return {total,reserve};
}
function validReceipt(r:any){
 const u=r.usage;
 if(!(r.model===GEMINI_TEXT_MODEL&&u&&['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)&&u.promptTokenCount>0&&u.totalTokenCount>0&&u.promptTokenCount<=1048576&&u.candidatesTokenCount+u.thoughtsTokenCount<=8192))return false;
 // Preserve reported estimates. The existing provider rounds dollar terms;
 // earlier operator receipts rounded the token-rate sum before dividing.
 // At a half-microdollar these two exact calculations can differ by1micro.
 // Accept only either reproducible estimate, never an arbitrary tolerance.
 const output=u.candidatesTokenCount+u.thoughtsTokenCount;
 const providerCost=Math.round((u.promptTokenCount*.75/1e6+output*3.75/1e6)*1e6)/1e6;
 const integerCost=Math.round(u.promptTokenCount*.75+output*3.75)/1e6;
 return r.costUsd===providerCost||r.costUsd===integerCost;
}
export async function callBoundedAv<T>(input:{id:string;category:AvCategory;prompt:string;schema:GeminiJsonSchema;media:Array<{path:string;sha256:string;mimeType:string;caption:string;fps?:number}>}){
 if(!process.env.GEMINI_API_KEY)throw Error('Explicit AV API configuration required before reservation');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)||!input.media.length)throw Error('AV review needs exact ID and actual media');
 const folder=join(root,'av-review');mkdirSync(folder,{recursive:true});
 const lock=join(folder,'submission.lock'),fd=openSync(lock,'wx');closeSync(fd);
 try{
  const journal=join(root,'voice-review/execution.json'),state=read(journal),model=read(join(root,'av-model-preflight.json'));
  const {total,reserve}=inspectAvBudget(state,model,input.category);
  if(state.calls.some((c:any)=>c.id===input.id))throw Error('Existing AV request; reconcile retained result, never auto-repeat');
  let bytes=0;
  const media:GeminiMediaInput[]=input.media.map(m=>{
   if(!isAbsolute(m.path)||!['video/mp4','audio/wav','audio/mpeg','image/png','image/jpeg'].includes(m.mimeType))throw Error('Unsupported review media');
   const b=readFileSync(m.path);bytes+=b.length;
   if(createHash('sha256').update(b).digest('hex')!==m.sha256)throw Error('Review media changed');
   if(m.fps!==undefined&&(!Number.isFinite(m.fps)||m.fps<1||m.fps>24||m.mimeType!=='video/mp4'))throw Error('Invalid video review sampling');
   return {mimeType:m.mimeType,data:b.toString('base64'),caption:m.caption,...(m.fps?{videoMetadata:{fps:m.fps}}:{})};
  });
  if(bytes>18*1024*1024)throw Error('Prepare a retained review encoding before submission');
  const request={...input,model:GEMINI_TEXT_MODEL,maxOutputTokens:8192,thinkingLevel:'low',reservationUsd:reserve,modelPreflight:model};
  writeFileSync(join(folder,input.id+'-request.json'),JSON.stringify(request,null,2),{flag:'wx'});
  const c:any={id:input.id,category:input.category,status:'submission_started',model:GEMINI_TEXT_MODEL,reservationUsd:reserve,media:input.media,submittedAt:new Date().toISOString()};
  const save=()=>{
   writeFileSync(journal,JSON.stringify(state,null,2));
   const main=read(join(root,'execution.json'));main.geminiAv={requests:state.calls.length,estimatedUsd:state.estimatedUsd,pendingUsd:state.pendingUsd,journal:'voice-review/execution.json'};writeFileSync(join(root,'execution.json'),JSON.stringify(main,null,2));
  };
  reserveBoundedAttempt(root,'geminiAvReviews',input.id);
  state.calls.push(c);state.pendingUsd=reserve;save();
  try{
   const response=await generateJsonWithImagesMetered<T>(input.prompt,media,input.schema,GEMINI_TEXT_MODEL,{maxOutputTokens:8192,thinkingLevel:'low'});
   Object.assign(c,response);
   if(!validReceipt(c)||response.costUsd>reserve)throw Error('Unknown/out-of-bound AV usage; no further call');
   state.estimatedUsd=+(total+response.costUsd).toFixed(6);state.pendingUsd=0;c.status='returned_reconciled';
   writeFileSync(join(folder,input.id+'-response.json'),JSON.stringify(response,null,2),{flag:'wx'});save();return response;
  }catch(e){
   if(e instanceof GeminiResponseError&&validReceipt(e.receipt)&&e.receipt.costUsd<=reserve){Object.assign(c,e.receipt);state.estimatedUsd=+(total+e.receipt.costUsd).toFixed(6);state.pendingUsd=0;c.status='returned_usage_known_result_held';}
   else c.status='held_unknown_no_retry';
   c.error=String((e as Error).message).split(process.env.GEMINI_API_KEY??'__absent_key__').join('[redacted]');save();throw Error(c.error);
  }
 }finally{unlinkSync(lock);}
}
