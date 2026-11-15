// Offline size/coverage probe. Synthetic replies are never saved as reviews.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {getDataDir} from '../../src/db/client.js';
import {dispatchCrewTask} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewSchema,validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {codexInputBudget,codexOutputSchema} from '../../src/providers/codex-text.js';
import {recordHash} from '../../src/pipeline/creative-direction/production-record.js';
import {retainedInitialCreativeProposal,retainedInitialScriptureProposal,retainedInitialCameraProposal,retainedInitialChoreographyProposal,retainedInitialStagingProposal,retainedInitialCostumeProposal,retainedInitialLightingProposal} from '../../src/pipeline/creative-direction/crew-store.js';
import type {CrewBrief,CrewContribution,CrewResult,CrewRole} from '../../src/pipeline/creative-direction/crew-types.js';
const root='outputs/mark6-production',data=getDataDir(),db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true});
db.exec('PRAGMA busy_timeout=5000');
const id='25ed817f-cae7-4a39-86af-8ce9429295e7',row=db.prepare('SELECT * FROM production_runs WHERE id=?').get(id)!;
const brief=JSON.parse(String(row.brief_json)) as CrewBrief,saved=JSON.parse(String(row.result_json)) as CrewResult,record=saved.productionRecord!,original=recordHash(record);
const p:Partial<CrewResult['contributions']>={};
p.creative_director=retainedInitialCreativeProposal(db,data,brief.project.id,brief,'b66c122d-7722-436b-bab7-a09f4091159f').reply;
p.scripture_cultural_reviewer=retainedInitialScriptureProposal(db,brief.project.id,brief,'4511c6c3-f3cb-4a7f-8b65-936dc9fdac8e',p.creative_director).reply;
p.cinematographer=retainedInitialCameraProposal(db,data,brief.project.id,brief,'844299e7-6367-4c90-906b-d051bada1dd0',p.creative_director,p.scripture_cultural_reviewer).reply;
p.choreographer=retainedInitialChoreographyProposal(db,brief.project.id,brief,'7181d4c9-606c-46b1-b482-0976d204d3e6',p.creative_director,p.scripture_cultural_reviewer,p.cinematographer).reply;
p.staging_designer=retainedInitialStagingProposal(db,data,brief.project.id,brief,'9298c395-6570-444d-8b08-71244b1c8fc1',p).reply;
p.costume_designer=retainedInitialCostumeProposal(db,brief.project.id,brief,'5eeda48e-84a7-4e78-bb5d-fc727134d46c',p).reply;
const lighting=retainedInitialLightingProposal(db,brief.project.id,brief,id,p);p.lighting_designer=lighting.reply;
const event=db.prepare("SELECT prompt FROM production_events WHERE run_id=? AND role='script_supervisor' AND round=1").get(id)!;
const prompt=String(event.prompt),contributions=saved.contributions,role:CrewRole='script_supervisor',variants:any[]=[];
const folder=join(root,'packet-preflight-r41');mkdirSync(folder,{recursive:true});
for(const cap of [600000,1600000]){
 const requests:any[]=[];
 await dispatchCrewTask({prompt,schema:crewSchema(role),media:[],role,phase:'planning',brief,contributions,record,specialistBytes:200000,chapterBytes:cap,onRequest:()=>{},validate:r=>validateContribution(r,role,brief),call:async(text,schema,media)=>{
  const budget=codexInputBudget(text,schema,media,cap),mode=text.match(/TASK CONTEXT: ([^;]+)/)![1]!,path=join(folder,`${cap}-${requests.length+1}.txt`);
  writeFileSync(path,text+'\n'+JSON.stringify(codexOutputSchema(schema)));
  const wire:any=(schema.properties as any).directions,ids=wire.anyOf?.[0]?.type==='object'?Object.keys(wire.anyOf[0].properties):brief.shots.map(s=>s.id);
  requests.push({mode,path,suppliedTextBytes:budget.suppliedTextBytes,targetShots:ids.length});
  const directions=mode==='chapter-rollup'?[]:ids.map(shotId=>({shotId,instruction:'OFFLINE PROBE ONLY. Not a review, direction or acceptance.',scriptureBasis:'No model was called.'}));
  return{summary:'OFFLINE SIZE PROBE ONLY',directions,findings:[]};
 }});
 variants.push({cap,requests,totalSuppliedTextBytes:requests.reduce((n,r)=>n+r.suppliedTextBytes,0),limitation:'Fixed actual incoming chapter state; synthetic local replies only enumerate packet sizes. Later real replies and evidence requests can increase inputs.'});
}
if(recordHash(record)!==original)throw Error('Offline probe changed record');
const result={status:'offline_comparison_not_review_or_approval',sourceRunId:id,verifiedRetainedRoles:Object.keys(p),lightingProvenance:lighting.provenance,variants,newProviderCalls:0,recordUnchanged:true};
writeFileSync(join(root,'chapter-preflight-r41.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({verifiedRetainedRoles:Object.keys(p).length,variants:variants.map(v=>({cap:v.cap,requests:v.requests.length,totalSuppliedTextBytes:v.totalSuppliedTextBytes})),newProviderCalls:0}));db.close();
