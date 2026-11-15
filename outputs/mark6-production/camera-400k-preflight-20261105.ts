// Synthetic size/coverage probe only; never submits or saves a camera review.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {getDataDir} from '../../src/db/client.js';
import {dispatchCrewTask} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewSchema} from '../../src/pipeline/creative-direction/crew.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {codexInputBudget} from '../../src/providers/codex-text.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
const root='outputs/mark6-production',data=getDataDir(),db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true}),run='ab24a1b4-972d-417c-a270-89a4290e5337';
const row=db.prepare('SELECT brief_json,result_json FROM production_runs WHERE id=?').get(run)!,brief=JSON.parse(String(row.brief_json)),saved=JSON.parse(String(row.result_json)),record=saved.productionRecord;
const contributions=Object.fromEntries(db.prepare('SELECT role,output_json FROM production_events WHERE run_id=? AND error IS NULL').all(run).map(e=>[String(e.role),JSON.parse(String(e.output_json))]));
const prompt=String(db.prepare("SELECT prompt FROM production_events WHERE run_id=? AND role='cinematographer'").get(run)!.prompt);
const manifest=JSON.parse(readFileSync(join(root,'supplemental-reference-review-inputs-20261105.json'),'utf8'));
const media=[...manifest.media.map((m:any)=>({mimeType:m.mimeType,data:readFileSync(m.path).toString('base64'),caption:`REFERENCE ${m.key}; SHA256:${m.sha256}. ${m.caption}`,...(m.characterIds?{characterIds:m.characterIds}:{})})),...canonReferenceMedia(db,data,brief,{compact:true,includeBody:true})];
const before=recordHash(record),requests:any[]=[];
const result=await dispatchCrewTask({prompt,schema:crewSchema('cinematographer'),media,role:'cinematographer',phase:'planning',brief,contributions,record,specialistBytes:400000,chapterBytes:1000000,onRequest:()=>{},validate:r=>r as any,call:async(p,schema,m)=>{
 const budget=codexInputBudget(p,schema,m,400000),wire=(schema.properties as any).directions,ids=Object.keys(wire.anyOf[0].properties);
 requests.push({bytes:budget.suppliedTextBytes,shots:ids.length,images:m.length});
 return{summary:'OFFLINE PROBE ONLY; no camera review',directions:Object.fromEntries(ids.map(id=>[id,{instruction:'OFFLINE PROBE ONLY',scriptureBasis:'No model called'}])),findings:[]};
}});
if(result.directions.length!==114||new Set(result.directions.map(d=>d.shotId)).size!==114||recordHash(record)!==before)throw Error('Size probe changed state or lost coverage');
const proof={status:'offline_size_probe_not_camera_review',specialistBytes:400000,requests,completeUniqueShotCoverage:114,recordUnchanged:true,newProviderCalls:0};
writeFileSync(join(root,'camera-400k-preflight-20261105.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));db.close();
