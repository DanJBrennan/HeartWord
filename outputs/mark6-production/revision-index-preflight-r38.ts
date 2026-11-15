import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {getDataDir} from '../../src/db/client.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {dispatchCrewTask} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewSchema,validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {codexOutputSchema} from '../../src/providers/codex-text.js';
import {crewInputBudget} from '../../src/providers/input-budget.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
import type {CrewBrief,CrewResult,CrewRole} from '../../src/pipeline/creative-direction/crew-types.js';
const data=getDataDir(),db=new DatabaseSync(join(data,'db','heartword.sqlite'),{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
const runId='13820767-89ef-409c-9d0b-1c37e44d8bd9',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const run=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!;
const brief=JSON.parse(String(run.brief_json)) as CrewBrief,record=JSON.parse(String(run.result_json)).productionRecord,before=recordHash(record),contributions:CrewResult['contributions']={};
for(const e of db.prepare('SELECT role,output_json FROM production_events WHERE run_id=? AND round=1 AND error IS NULL').all(runId))contributions[e.role as CrewRole]=JSON.parse(String(e.output_json));
const original=JSON.parse(readFileSync(join(data,'assets','preparation','crew-reasoning',projectId,`${runId}_costume_designer_1_task-1_evidence-0`,'request.json'),'utf8'));
const prompt=String(original.prompt).replace(/TASK CONTEXT:[^\n]+\n/g,'').replace(/If exact earlier evidence is required,[^\n]+\n/g,'');
const schema={...original.schema,properties:{...original.schema.properties,directions:(crewSchema('costume_designer').properties as any).directions}};
const media=canonReferenceMedia(db,data,brief,{compact:true,includeBody:true}),tasks:Array<{shots:number;suppliedTextBytes:number;images:number}>=[];
await dispatchCrewTask({prompt,schema,media,role:'costume_designer',phase:'planning',brief,contributions,record,specialistBytes:200000,chapterBytes:600000,onRequest:()=>{},validate:raw=>validateContribution(raw,'costume_designer',brief),call:async(p,s,m)=>{
 const input='Return only the requested JSON. Do not call tools, inspect files, browse, delegate or read any history. All evidence is supplied in this request.\n'+m.map((v,i)=>`Attached image ${i+1}: ${v.caption??'No caption supplied'}`).join('\n')+'\n'+p;
 const budget=crewInputBudget(input,codexOutputSchema(s),200000),ids=Object.keys((s.properties as any).directions.anyOf[0].properties);
 tasks.push({shots:ids.length,suppliedTextBytes:budget.suppliedTextBytes,images:m.length});
 // Offline placeholder only to enumerate task sizes. Never saved as a role
 // proposal, provider response, review, or production event.
 return{summary:'OFFLINE SIZE PROBE; not a costume review',directions:Object.fromEntries(ids.map(id=>[id,{instruction:'Size probe only',scriptureBasis:'No verdict'}])),findings:[]};
}});
if(recordHash(record)!==before)throw Error('Probe mutated production record');
const value={status:'offline_packet_sizing_not_review_or_approval',sourceRunId:runId,tasks,totalTaskShots:tasks.reduce((n,t)=>n+t.shots,0),maximumSuppliedTextBytes:Math.max(...tasks.map(t=>t.suppliedTextBytes)),newProviderCalls:0,sourceAndRecordUnchanged:true,includesPreparedBodyViews:true};
writeFileSync('outputs/mark6-production/revision-index-preflight-r38.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));db.close();
