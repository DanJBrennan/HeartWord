import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {getDb} from '../../src/db/client.js';
import {runSceneBreakdown} from '../../src/pipeline/scene-breakdown/index.js';
import {runCastingWithPlanner} from '../../src/pipeline/casting/index.js';
import {generateCodexJson} from '../../src/providers/codex-text.js';
import type {generateJson} from '../../src/providers/gemini-text.js';
// The production authorization is retained as itself, never converted into
// a claim that Dan personally listened to or certified every source boundary.
// Do not manufacture a source_alignment_reviews entry to clear that gate.
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const id=read(root+'/workspace.json').projectId,db=getDb();
process.env.HEARTWORD_CREW_REASONING_PROVIDER='codex';
process.env.HEARTWORD_CREW_AV_REVIEW_PROVIDER='gemini';
process.env.HEARTWORD_LIPSYNC_PROVIDER='ltx';
const sourceReview=db.prepare('SELECT id FROM source_alignment_reviews WHERE project_id=?').get(id);
if(!sourceReview)throw Error('Existing named source-acceptance gate remains unresolved. No storyboard dispatch and no human attestation invented.');
const sceneResult=await runSceneBreakdown(id);writeFileSync(root+'/scene-breakdown.json',JSON.stringify(sceneResult,null,2));if(!sceneResult.ok)throw Error(sceneResult.reasoning);
let index=0;mkdirSync(root+'/planning',{recursive:true});
const facts=`CURRENT PRODUCTION DIRECTION: Dan lifted the production hold. Existing limits: 64 included images, 180 LOCAL LTX requests including retakes; bounded crew reasoning through Codex only. Three original-narrator reports are quote-04/05/06 Mark 6:14–15; do not add reporter voices. Peter represents collective disciples, not a Scripture-named speaker. Approved crowd spokesperson represents Nazareth. Preserve all source words, spoken chapter title and quiet, original timing and approved music v3 level. No native attestation or publishing. Local speech uses short ~3s/up to4s pieces, five-second tail-padded containers and one uninterrupted full-line soundtrack; no new expression experiments. Bareheaded Herod, approved banquet wardrobe, modest nonsexual daughter dance. No literal returned John/Elijah or ghost. Film source determines events; reuse the accepted preparation’s source corrections. No paid fallback.`;
const planner:typeof generateJson=async<T>(prompt,schema)=>{
 const n=++index;if(n>6)throw Error('Initial scene reasoning ceiling');const path=root+'/planning/scene-'+n;
 if(existsSync(path+'.response.json')){const r=read(path+'.response.json');if(r.prompt!==prompt+'\n'+facts)throw Error('Retained prompt changed; reconcile');return r.result as T;}
 if(existsSync(path+'.request.json'))throw Error('Unreconciled prior initial-planning submission; no retry');
 const full=prompt+'\n'+facts;
 const response=await generateCodexJson(full,schema,[],{maxSuppliedTextBytes:200000,beforeSubmit:budget=>writeFileSync(path+'.request.json',JSON.stringify({prompt:full,schema,budget},null,2),{flag:'wx'}),retainResponse:raw=>writeFileSync(path+'.response.jsonl',raw,{flag:'wx'})});
 writeFileSync(path+'.response.json',JSON.stringify({prompt:full,...response},null,2),{flag:'wx'});return response.result as T;
};
const result=await runCastingWithPlanner(id,planner);writeFileSync(root+'/planning/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
