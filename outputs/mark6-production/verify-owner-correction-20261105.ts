import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {planningCorrectionProposals} from '../../src/pipeline/creative-direction/crew-store.js';
import {newProductionRecord,recordHash} from '../../src/pipeline/creative-direction/production-record.js';
import {crewBriefHash} from '../../src/pipeline/creative-direction/crew-context.js';
import {runCrew} from '../../src/pipeline/creative-direction/crew.js';
import {codexInputBudget} from '../../src/providers/codex-text.js';
function decodePacket(prompt:string):any{const p=JSON.parse(prompt.split('BOUNDED CONTEXT:\n')[1]!.split('\n')[0]!),read=(v:any):any=>{if(v&&typeof v==='object'&&v.$ref)return read(p.definitions[Number(v.$ref.split('/').at(-1))]);if(p.objectRowsEncoding==='prefix_columns_v1'&&v&&typeof v==='object'&&v.$columns&&v.$rows){const columns=read(v.$columns);return read(v.$rows).map((row:any[])=>Object.fromEntries(row.map((x,i)=>[columns[i],x])));}return Array.isArray(v)?v.map(read):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,read(x)])):v;};return read(p.payload??p);}
const dataDir='C:/Users/danbr/HeartWordData',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const db=new DatabaseSync(dataDir+'/db/heartword.sqlite',{readOnly:true});
const manifest=JSON.parse(readFileSync('outputs/mark6-production/current-canon-reference-review-inputs-20261105-v2.json','utf8'));
const media=manifest.media.map((ref:any)=>({mimeType:ref.mimeType,data:readFileSync(ref.path).toString('base64'),caption:`REFERENCE ${ref.key}; SHA256:${ref.sha256}. ${ref.caption} These supplemental references were not seen by retained initial proposals; they require actual current owner review.`,...(ref.characterIds?{characterIds:ref.characterIds}:{})}));
const brief=loadCrewBrief(db,dataDir,projectId,'planning');
const source='af003997-265d-4bb3-90a9-879ea75cd2cd',correction=planningCorrectionProposals(db,projectId,brief,source);
const prior=JSON.parse(String(db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(source)!.result_json)).productionRecord;
const record=newProductionRecord(brief,'offline-correction',crewBriefHash(brief,'planning'));record.history=structuredClone(prior.history);record.objections=structuredClone(prior.objections);
let proof:any;
const result=await runCrew({phase:'planning',brief,productionRecord:record,planningProposals:correction.proposals,retainedContributions:Object.fromEntries(Object.values(correction.proposals).map((c:any)=>[c.exchange.find((h:any)=>h.kind==='proposal'||h.kind==='revision').id,c])),media,visualMedia:canonReferenceMedia(db,dataDir,brief,{compact:true,includeBody:true}),creativeFeedback:true,scopedContext:true,boundedContext:true,maxCalls:30,maxInferenceCalls:51,maxSuppliedTextBytes:550000,maxReviewTextBytes:1100000,log:()=>{},call:async(prompt,schema,images)=>{
const packet=decodePacket(prompt),checks=Object.fromEntries(['source','shots','audio','canon','producerNotes'].map(k=>[k,JSON.stringify(packet.brief[k])===JSON.stringify((brief as any)[k])]));
if(!Object.values(checks).every(Boolean))throw Error('PROTECTED_INPUT_MISMATCH');
proof={at:new Date().toISOString(),provenance:correction.provenance,checks,budget:codexInputBudget(prompt,schema,images,1100000),images:images.length,sourceContribution:packet.recordedProposalReview?.sourceContributionId,acceptedContributionIds:record.acceptedContributionIds,newProviderCalls:0};throw Error('OFFLINE_ONLY_NO_PROVIDER_CALL');
}});
if(!proof||!result.summary.includes('OFFLINE_ONLY_NO_PROVIDER_CALL'))throw Error('Preflight failed before fresh owner request: '+result.summary);
writeFileSync('outputs/mark6-production/owner-correction-preflight-20261105.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));db.close();
