import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {sha256,assetPath} from '../../src/pipeline/media-generation/external-keyframes.js';
import {reserveBoundedAttempt} from './attempt-control.js';
const root='outputs/mark6-production',folder=root+'/keyframes/daughter-demand-actual-return-20261109-v2',file='C:/Users/danbr/HeartWordData/exports/keyframe-briefs/43a5ed10-3c40-4bc1-820f-d32873fcb696/brief.json',id='mark6-daughter-demand-return-112-20261109',read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,'')),brief=read(file),j=read(root+'/images/execution.json'),bounded=read(root+'/bounded-resume-20261104.json'),db=getDb(),data=getDataDir();
try{
 const plan=requireCurrentPlan(db,data,'c457a815-d07d-4902-91b5-7b936b549856');
 if(brief.productionRunId!==plan.id||brief.context.shot.id!=='35d20b02-5771-45b3-9d44-27f92e2d518f'||brief.promptHash!=='a3bc98e5a73b1c30d1333c7d776071a6526583e2adda17d2f5d87629fa6aa65a'||sha256(brief.prompt)!==brief.promptHash||sha256(readFileSync(folder+'/prompt.txt'))!==brief.promptHash||existsSync(folder+'/request.json')||j.calls.length!==111||j.calls.some((c:any)=>!String(c.status).startsWith('returned'))||bounded.reservations.some((c:any)=>c.id===id)||read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Exact retained prepared brief/current plan and no image112 reservation/submission required');
 for(const input of brief.generationInputs)if(sha256(readFileSync(assetPath(data,input.path)))!==input.sha256)throw Error('Actual input changed');
 writeFileSync(folder+'/stale-preparation-no-submission-proof.json',JSON.stringify({at:new Date().toISOString(),status:'prior_preparation_stopped_before_reservation_stale_host_snapshot',idAbsentFromBothJournals:true,priorProviderCalls:0,retainedExactBrief:file,retainedPromptSha256:brief.promptHash},null,2),{flag:'wx'});
 reserveBoundedAttempt(root,'includedStartingFrameGenerations',id);
 const req={id,briefFile:file,prompt:brief.prompt,promptSha256:brief.promptHash,referenced_image_paths:brief.generationInputs.map((r:any)=>assetPath(data,r.path)),generationInputs:brief.generationInputs,sourceMotionAttemptId:'166a4039-dd7b-405c-ba08-e38ffa2761dc',fullHistoryPreserved:true,apiFallback:false};writeFileSync(folder+'/request.json',JSON.stringify(req,null,2),{flag:'wx'});
 j.calls.push({id,route:'included_builtin_imagegen',status:'pending_builtin',shotId:brief.context.shot.id,referenceEvidence:folder+'/request.json',apiFallback:false,providerModel:'not reported by builtin tool'});writeFileSync(root+'/images/execution.json',JSON.stringify(j,null,2));console.log(JSON.stringify({id,briefFile:file,promptCharacters:brief.prompt.length,referenced_image_paths:req.referenced_image_paths}));
}finally{db.close();}
