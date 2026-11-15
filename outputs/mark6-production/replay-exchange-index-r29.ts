import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {getDb,getDataDir} from '../../src/db/client.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {dispatchCrewTask,mergeShotTaskOutputs} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {parseCodexEvents,stripOptionalNulls} from '../../src/providers/codex-text.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
const db=getDb(),runId='844299e7-6367-4c90-906b-d051bada1dd0',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(runId)!;
const brief=JSON.parse(String(row.brief_json)),record=JSON.parse(String(row.result_json)).productionRecord;
const contributions=Object.fromEntries(db.prepare('SELECT role,output_json FROM production_events WHERE run_id=? AND error IS NULL').all(runId).map(e=>[String(e.role),JSON.parse(String(e.output_json))]));
const archive=join(getDataDir(),'assets','preparation','crew-reasoning',projectId);
const first=join(archive,runId+'_cinematographer_1_task-1_evidence-0'),request=JSON.parse(readFileSync(join(first,'request.json'),'utf8'));
const prompt=request.prompt.split('TASK CONTEXT:')[0]+'BOUNDED CONTEXT:\n{}\nUse filmChanges'+request.prompt.split('\nUse filmChanges')[1];
const before=recordHash({brief,record,contributions}),sizes:number[]=[],shots:number[]=[];
const decode=(p:string)=>{const v=JSON.parse(p.split('BOUNDED CONTEXT:\n')[1]!.split('\nUse filmChanges')[0]!);const read=(x:any):any=>x&&typeof x==='object'&&x.$ref?read(v.definitions[Number(x.$ref.split('/').at(-1))]):Array.isArray(x)?x.map(read):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,y])=>[k,read(y)])):x;return read(v.payload??v);};
const result=await dispatchCrewTask({prompt,schema:request.schema,media:canonReferenceMedia(db,getDataDir(),brief,{compact:true}),role:'cinematographer',phase:'planning',brief,contributions,record,specialistBytes:200000,chapterBytes:600000,
 onRequest:p=>sizes.push(Buffer.byteLength(p)),validate:raw=>validateContribution(raw,'cinematographer',brief),call:async p=>{const v=decode(p),ids=v.task.shotIds;shots.push(ids.length);return{summary:'Offline fixture only; no actual review',directions:ids.map((shotId:string)=>({shotId,instruction:'Offline preserves source',scriptureBasis:'Supplied source'})),findings:[]};}});
if(result.directions.length!==114||before!==recordHash({brief,record,contributions}))throw Error('Coverage/history invariant lost');
const parts:any[]=[];
for(const folder of readdirSync(archive).filter(f=>f.startsWith(runId+'_cinematographer_1_')).sort((a,b)=>Number(a.match(/task-(\d+)/)![1])-Number(b.match(/task-(\d+)/)![1]))){
 if(!existsSync(join(archive,folder,'response.jsonl')))continue;
 const r=JSON.parse(readFileSync(join(archive,folder,'request.json'),'utf8')),raw=stripOptionalNulls(parseCodexEvents(readFileSync(join(archive,folder,'response.jsonl'),'utf8')).result,r.schema);
 const {contextRequests,...output}=raw;if(contextRequests?.length)continue;parts.push(validateContribution(output,'cinematographer',brief));
}
const merged=mergeShotTaskOutputs(parts);
const value={status:'offline_replay_not_approval',runId,projectedTaskSizes:shots,projectedPhysicalRequests:sizes.length,maxPromptBytes:Math.max(...sizes),all114DirectionsCoveredExactlyOnce:new Set(result.directions.map(d=>d.shotId)).size===114,
 originalHistoryUnchanged:true,retainedRealTaskParts:parts.length,retainedRealDirections:merged.directions.length,retainedDispositions:merged.objectionResponses?.length??0,matchingDispositionsMergeWithoutLosingExplanations:true,newProviderCalls:0,
 limitation:'Current saved prefix replay only. Active worker imported earlier code and is not hot-patched. Later roles still undergo normal guards.'};
writeFileSync('outputs/mark6-production/context-exchange-index-replay-r29.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
