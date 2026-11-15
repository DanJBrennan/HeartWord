import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectAvBudget} from './av-call.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(root+'/'+p,'utf8')),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const lock=root+'/av-review/submission.lock',fd=openSync(lock,'wx');closeSync(fd);
try{
 const paths=['voice-review/execution.json','execution.json','bounded-resume-20261104.json','av-call.ts'],originals=Object.fromEntries(paths.map(p=>[p,readFileSync(root+'/'+p,'utf8')]));
 const j=JSON.parse(originals[paths[0]!]!),main=JSON.parse(originals[paths[1]!]!),bounded=JSON.parse(originals[paths[2]!]!),authority=read('full-production-resumption-20261105.json');
 if(!authority.internalLimitExtensionsAuthorized||j.maximumRequests!==40||j.maximumUsd!==8||j.calls.length!==40||j.pendingUsd!==0||main.limits.geminiAvRequests!==40||main.limits.additionalGeminiAvUsd!==8||bounded.limits.geminiAvReviews!==40)throw Error('Wrong actual count boundary/dollar authority');
 const reservations=bounded.reservations.filter((r:any)=>r.kind==='geminiAvReviews');
 if(reservations.length!==bounded.usage.geminiAvReviews||j.calls.filter((c:any)=>reservations.some((r:any)=>r.id===c.id)).length!==reservations.length||j.calls.filter((c:any)=>!reservations.some((r:any)=>r.id===c.id)).map((c:any)=>c.id).sort().join(',')!=='batch-1,batch-2,batch-3')throw Error('Original legacy versus bounded reservations do not reconcile');
 let held='';try{inspectAvBudget(j,read('av-model-preflight.json'),'finalFilmParts');}catch(e){held=(e as Error).message;}
 if(held!=='AV request/category/dollar ceiling'||j.calls.filter((c:any)=>c.category==='finalFilmParts').length>=3||j.estimatedUsd+.82>8)throw Error('Count is not sole actual hold');
 const before=originals['av-call.ts']!,after=before.replace('state.maximumRequests!==40','state.maximumRequests!==80').replace('state.calls.length>=40','state.calls.length>=80');
 if(after===before||after.includes('state.maximumRequests!==40')||after.includes('state.calls.length>=40'))throw Error('Expected exact prior runtime limit');
 writeFileSync(root+'/checkpoints/av-total-count80-prior-20261107.json',JSON.stringify({at:new Date().toISOString(),originals},null,2),{flag:'wx'});
 const receipts=JSON.stringify(j.calls),usage=JSON.stringify(bounded.usage),reserved=JSON.stringify(bounded.reservations);
 j.maximumRequests=80;main.limits.geminiAvRequests=80;bounded.limits.geminiAvReviews=80;
 writeFileSync(root+'/'+paths[0],JSON.stringify(j,null,2));writeFileSync(root+'/'+paths[1],JSON.stringify(main,null,2));writeFileSync(root+'/'+paths[2],JSON.stringify(bounded,null,2));writeFileSync(root+'/av-call.ts',after);
 if(JSON.stringify(j.calls)!==receipts||JSON.stringify(bounded.usage)!==usage||JSON.stringify(bounded.reservations)!==reserved)throw Error('Cumulative usage/receipts changed');
 const report={at:new Date().toISOString(),authority:'full-production-resumption-20261105.json',verifiedPriorHold:held,priorFiniteCount:40,newFiniteCount:80,actualSettledCalls:40,boundedReservationsRetained:reservations.length,threeLegacyCallsRetained:true,maximumUsdUnchanged:8,estimatedUsd:j.estimatedUsd,pendingUsd:0,categoryLimitsUnchanged:true,receiptsSha256:hash(receipts),allUsageAndReservationsUnchanged:true,priorRuntimeSha256:hash(before),newRuntimeSha256:hash(after),providerCalls:0,noPurchaseOrFallback:true};
 writeFileSync(root+'/av-total-count80-extension-20261107.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}finally{unlinkSync(lock);}
