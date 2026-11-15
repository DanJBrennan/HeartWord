import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {getDataDir} from '../../src/db/client.js';
import {dispatchCrewTask} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewSchema,validateContribution,runCrew} from '../../src/pipeline/creative-direction/crew.js';
import {codexInputBudget} from '../../src/providers/codex-text.js';
import {recordHash,newProductionRecord} from '../../src/pipeline/creative-direction/production-record.js';
import type {CrewBrief,CrewResult,CrewRole,ReviewMedia} from '../../src/pipeline/creative-direction/crew-types.js';
const data=getDataDir(),db=new DatabaseSync(join(data,'db','heartword.sqlite'),{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
const runId='5eeda48e-84a7-4e78-bb5d-fc727134d46c',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const run=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!;
const brief=JSON.parse(String(run.brief_json)) as CrewBrief,originalRecord=JSON.parse(String(run.result_json)).productionRecord,originalHash=recordHash(originalRecord);
let record=originalRecord,contributions:CrewResult['contributions']={};
for(const e of db.prepare('SELECT role,output_json FROM production_events WHERE run_id=? AND round=1 AND error IS NULL').all(runId))contributions[e.role as CrewRole]=JSON.parse(String(e.output_json));
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND phase='planning' AND status='approved'").get(projectId))throw Error('Probe must preserve actual accepted lineage');
const simulatedRecord=newProductionRecord(brief,'00000000-0000-4000-8000-000000000039',record.briefHash);
simulatedRecord.history=structuredClone(record.history);simulatedRecord.objections=structuredClone(record.objections);
const wire=(role:CrewRole)=>{const {exchange:_exchange,...reply}=contributions[role]!;return reply;};
const simulated=await runCrew({phase:'planning',brief,productionRecord:simulatedRecord,maxCalls:6,scopedContext:true,maxSuppliedTextBytes:200000,maxReviewTextBytes:600000,maxInferenceCalls:180,
 retainedInitialCreativeReply:wire('creative_director'),retainedInitialScriptureReply:wire('scripture_cultural_reviewer'),retainedInitialCameraReply:wire('cinematographer'),retainedInitialChoreographyReply:wire('choreographer'),retainedInitialStagingReply:wire('staging_designer'),retainedInitialCostumeReply:wire('costume_designer'),
 call:async()=>{throw Error('Offline prefix must never infer');},log:()=>{}});
if(simulated.inferenceCalls!==0||Object.keys(simulated.contributions).length!==6)throw Error('Offline six-role reconstruction failed');
record=simulated.productionRecord;contributions=simulated.contributions;const before=recordHash(record);
const original=JSON.parse(readFileSync(join(data,'assets','preparation','crew-reasoning',projectId,`${runId}_lighting_designer_1_task-1_evidence-0`,'request.json'),'utf8'));
const prompt=String(original.prompt).replace(/TASK CONTEXT:[^\n]+\n/g,'').replace(/If exact earlier evidence is required,[^\n]+\n/g,'');
const schema={...original.schema,properties:{...original.schema.properties,directions:(crewSchema('lighting_designer').properties as any).directions}};
const media:ReviewMedia[]=[],tasks:Array<{shots:number;suppliedTextBytes:number;images:number}>=[];
await dispatchCrewTask({prompt,schema,media,role:'lighting_designer',phase:'planning',brief,contributions,record,specialistBytes:200000,chapterBytes:600000,onRequest:()=>{},validate:raw=>validateContribution(raw,'lighting_designer',brief),call:async(p,s,m)=>{
 const budget=codexInputBudget(p,s,m,200000),ids=Object.keys((s.properties as any).directions.anyOf[0].properties);
 tasks.push({shots:ids.length,suppliedTextBytes:budget.suppliedTextBytes,images:m.length});
 // Offline placeholder only to enumerate task sizes. Never saved as a role
 // proposal, provider response, review, or production event.
 return{summary:'OFFLINE SIZE PROBE; not a lighting review',directions:Object.fromEntries(ids.map(id=>[id,{instruction:'Size probe only',scriptureBasis:'No verdict'}])),findings:[]};
}});
if(recordHash(originalRecord)!==originalHash||recordHash(record)!==before)throw Error('Probe mutated production record');
const value={status:'offline_packet_sizing_not_review_or_approval',sourceRunId:runId,tasks,totalTaskShots:tasks.reduce((n,t)=>n+t.shots,0),maximumSuppliedTextBytes:Math.max(...tasks.map(t=>t.suppliedTextBytes)),newProviderCalls:0,sourceAndRecordUnchanged:true,visualAttachmentsUsed:false,includesSimulatedNewRunPrefix:true};
writeFileSync('outputs/mark6-production/lighting-preflight-r39.json',JSON.stringify(value,null,2));console.log(JSON.stringify({status:value.status,tasks:value.tasks.length,totalTaskShots:value.totalTaskShots,maximumSuppliedTextBytes:value.maximumSuppliedTextBytes,newProviderCalls:0,includesSimulatedNewRunPrefix:true}));db.close();
