import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {planningCorrectionProposals} from '../../src/pipeline/creative-direction/crew-store.js';
import {newProductionRecord,recordHash} from '../../src/pipeline/creative-direction/production-record.js';
import {crewBriefHash} from '../../src/pipeline/creative-direction/crew-context.js';
import {runCrew} from '../../src/pipeline/creative-direction/crew.js';
import {codexInputBudget} from '../../src/providers/codex-text.js';
function decodePacket(prompt:string):any{const p=JSON.parse(prompt.split('BOUNDED CONTEXT:\n')[1]!.split('\n')[0]!),read=(v:any):any=>{if(v&&typeof v==='object'&&v.$ref)return read(p.definitions[Number(v.$ref.split('/').at(-1))]);if(p.idPrefixEncoding==='crew_id_v1'&&v&&typeof v==='object'&&v.$crewId)return p.idPrefixes[v.$crewId[0]]+v.$crewId[1];if(p.objectRowsEncoding==='prefix_columns_v1'&&v&&typeof v==='object'&&v.$columns&&v.$rows){const columns=read(v.$columns);return read(v.$rows).map((row:any[])=>Object.fromEntries(row.map((x,i)=>[columns[i],x])));}return Array.isArray(v)?v.map(read):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,read(x)])):v;};return read(p.payload??p);}
const dataDir='C:/Users/danbr/HeartWordData',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const db=new DatabaseSync(dataDir+'/db/heartword.sqlite',{readOnly:true});
const manifest=JSON.parse(readFileSync('outputs/mark6-production/palace-native-light-review-inputs-20261105.json','utf8'));
const media=manifest.media.map((ref:any)=>({mimeType:ref.mimeType,data:readFileSync(ref.path).toString('base64'),caption:`REFERENCE ${ref.key}; SHA256:${ref.sha256}. ${ref.caption} These supplemental references were not seen by retained initial proposals; they require actual current owner review.`,...(ref.characterIds?{characterIds:ref.characterIds}:{})}));
const brief=loadCrewBrief(db,dataDir,projectId,'planning');
const source=process.argv[2]??'83bb529a-f448-44f9-97ed-78bd21e463ff',correction=planningCorrectionProposals(db,projectId,brief,source);
const maximumNativeImages=media.length+canonReferenceMedia(db,dataDir,brief,{compact:true,includeBody:true}).length;const maximumNativeImageBytes=[...media,...canonReferenceMedia(db,dataDir,brief,{compact:true,includeBody:true})].reduce((n,m)=>n+Buffer.byteLength(m.data,"base64"),0);if(maximumNativeImages>16||maximumNativeImageBytes>16*1024*1024)throw Error("Native image attachment budget exceeded");
const prior=JSON.parse(String(db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(source)!.result_json)).productionRecord;
const sourceBrief=JSON.parse(String(db.prepare('SELECT brief_json FROM production_runs WHERE id=?').get(source)!.brief_json));
const core=(b:any)=>({project:b.project,source:b.source,audio:b.audio,canon:b.canon,shots:b.shots.map((x:any)=>({...x,clip:null}))});if(JSON.stringify(core(sourceBrief))!==JSON.stringify(core(brief)))throw Error('Protected production core changed');
const record=newProductionRecord(brief,'00000000-0000-4000-8000-000000000000',crewBriefHash(brief,'planning'));record.history=structuredClone(prior.history);record.objections=structuredClone(prior.objections);
let proof:any;
const result=await runCrew({phase:'planning',brief,productionRecord:record,planningProposals:correction.proposals,retainedContributions:Object.fromEntries(Object.values(correction.proposals).map((c:any)=>[c.exchange.find((h:any)=>h.kind==='proposal'||h.kind==='revision').id,c])),media,visualMedia:canonReferenceMedia(db,dataDir,brief,{compact:true,includeBody:true}),creativeFeedback:true,scopedContext:true,boundedContext:true,maxCalls:30,maxInferenceCalls:74,maxSuppliedTextBytes:550000,maxReviewTextBytes:1100000,log:()=>{},call:async(prompt,schema,images)=>{
const packet=decodePacket(prompt),checks=Object.fromEntries(['source','shots','audio','canon','producerNotes'].map(k=>[k,JSON.stringify(packet.brief[k])===JSON.stringify((brief as any)[k])]));
if(!Object.values(checks).every(Boolean))throw Error('PROTECTED_INPUT_MISMATCH');
proof={at:new Date().toISOString(),provenance:correction.provenance,protectedCoreExact:true,checks,maximumNativeImages,maximumNativeImageBytes,budget:codexInputBudget(prompt,schema,images,1100000),images:images.length,sourceContribution:packet.recordedProposalReview?.sourceContributionId,acceptedContributionIds:record.acceptedContributionIds,newProviderCalls:0};throw Error('OFFLINE_ONLY_NO_PROVIDER_CALL');
}});
if(!proof||!result.summary.includes('OFFLINE_ONLY_NO_PROVIDER_CALL'))throw Error('Preflight failed before fresh owner request: '+result.summary);
writeFileSync(process.argv[3]??'outputs/mark6-production/palace-owner-correction-preflight-20261105.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));db.close();
