import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectAvBudget} from './av-call.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),j=read(root+'/voice-review/execution.json'),a=read(root+'/full-production-resumption-20261105.json');
if(j.pendingUsd!==0||j.calls.filter((x:any)=>x.category==='pairedSceneReviews').length!==4||!a.internalLimitExtensionsAuthorized)throw Error('Wrong settled category boundary or authority');
let held='';try{inspectAvBudget(j,read(root+'/av-model-preflight.json'),'pairedSceneReviews');}catch(e){held=(e as Error).message;}
if(held!=='AV request/category/dollar ceiling'||j.calls.length>=40||j.estimatedUsd+.82>8)throw Error('Category not sole constraint');
const path=root+'/av-call.ts',before=readFileSync(path,'utf8'),after=before.replace('pairedSceneReviews:4','pairedSceneReviews:8');if(before===after)throw Error('Expected exact prior finite category limit');
writeFileSync(root+'/checkpoints/av-call-before-paired-category8-20261107.ts',before,{flag:'wx'});
writeFileSync(path,after);
writeFileSync(root+'/paired-av-category-extension-20261107.json',JSON.stringify({at:new Date().toISOString(),authority:root+'/full-production-resumption-20261105.json',verifiedPriorHold:held,actualSettledRequests:j.calls.length,actualPairedReviews:4,priorCategoryLimit:4,newCategoryLimit:8,maximumRequestsUnchanged:40,maximumUsdUnchanged:8,estimatedUsd:j.estimatedUsd,pendingUsd:0,otherCategoriesUnchanged:true,usageAndReceiptsUnchanged:true,noProviderCalls:true,beforeSha256:createHash('sha256').update(before).digest('hex'),afterSha256:createHash('sha256').update(after).digest('hex')},null,2),{flag:'wx'});
console.log('Finite pairedSceneReviews category extended4 to8; total40 and8USD unchanged.');
