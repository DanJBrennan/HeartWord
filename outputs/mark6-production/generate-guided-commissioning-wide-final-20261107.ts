import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {ShotRequest} from '../../src/providers/types.js';
import {getDb,getDataDir} from '../../src/db/client.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
import {generateShotDraft} from '../../src/pipeline/media-generation/draft-room.js';
import {generateNonSpeakingVideoCandidate,localMotionDirection} from '../../src/pipeline/media-generation/final-video.js';
import {shotRiskFor} from '../../src/pipeline/media-generation/shot-risk-lookup.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {checkFilmSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',projectId='c457a815-d07d-4902-91b5-7b936b549856',shotId=process.argv[2],mode=process.argv[3],folder=process.argv[4];
if(!shotId||!mode||!['draft','final'].includes(mode)||!folder)throw Error('Explicit shotId,draft/final,evidence folder required');
const extra=process.argv.slice(5),durationFlags=extra.filter(x=>x.startsWith('--seconds=')),paths=extra.filter(x=>!x.startsWith('--'));
if(durationFlags.length>1||paths.length>1||extra.some(x=>x.startsWith('--')&&!x.startsWith('--seconds=')))throw Error('At most one correction file and one --seconds=5/8/10 required');
const requestedSeconds=durationFlags.length?Number(durationFlags[0]!.slice('--seconds='.length)):(mode==='draft'?5:8);
if(![5,8,10].includes(requestedSeconds)||(mode==='draft'&&requestedSeconds!==5))throw Error('Drafts remain five seconds; local finals support explicit five/eight/ten seconds');
const durationSeconds=requestedSeconds as 5|8|10;
// Existing entrypoints include a default Gemini review. Remove its credential
// in this worker so it fails before any paid request; actual AV review uses
// the separately bounded Mark6 av-call journal, never an implicit fallback.
for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
if(!process.env.LTX_TOKEN)throw Error('Local Desktop credential required');
const db=getDb(),dataDir=getDataDir(),plan=requireCurrentPlan(db,dataDir,projectId),risk=shotRiskFor(db,shotId);
checkFilmSpend(db,projectId,0);mkdirSync(folder,{recursive:true});
if(existsSync(join(folder,'request.json'))||existsSync(join(folder,'result.json')))throw Error('Existing operation requires reconciliation, not repeated generation');
const keyframe=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shotId);
if(!keyframe)throw Error('Accepted current starting frame required');
// Scoped operational use of existing provider first/last-image support; no pipeline-stage change.
if(shotId!=='2408a829-dba4-43d6-89d3-09b02d9b77a0'||mode!=='final'||durationSeconds!==10)throw Error('This guided operator is limited to the exact ten-second13-person commissioning establishment');
const endpointReviewPath=join(root,'keyframes/scene2-shot1-commissioning-ending-reuse-v1/endpoint-review.json'),endpoint=JSON.parse(readFileSync(endpointReviewPath,'utf8'));
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(endpoint.status!=='accepted_guidance_endpoint_only'||endpoint.shotId!==shotId||endpoint.productionRunId!==plan.id||endpoint.notStartingFrame!==true||endpoint.notCanon!==true||endpoint.kind!=='exact_accepted_still_as_guidance_endpoint'||endpoint.sourceStartAttemptId!==keyframe.id||sha(join(dataDir,'assets',String(keyframe.result_asset_path)))!==endpoint.sourceStartSha256||endpoint.assetPath!=='preparation/mark6-guidance-endpoints/scene2-shot1-commissioning-ending-reuse-v1.png'||sha(join(dataDir,'assets',endpoint.assetPath))!==endpoint.sha256)throw Error('Exact reviewed endpoint/current original starting frame required');
const correctionPath=paths[0],correction=correctionPath?readFileSync(correctionPath,'utf8').trim():'';if(correctionPath&&(!correction||correction.length>1000))throw Error('Correction must be explicit,nonempty and bounded');
const request={...(correctionPath?{motionClarification:{path:correctionPath,text:correction,sha256:createHash('sha256').update(correction).digest('hex')}}:{}),endingGuidance:{reviewPath:endpointReviewPath,path:endpoint.assetPath,sha256:endpoint.sha256},at:new Date().toISOString(),pid:process.pid,projectId,shotId,mode,productionRunId:plan.id,keyframe,risk,backend:'ltx_local',resolution:'720p',fps:24,durationSeconds,freeWebEncoder:true,paidFallback:false,defaultUnmeteredReviewDisabled:true};writeFileSync(join(folder,'request.json'),JSON.stringify(request,null,2),{flag:'wx'});console.log(JSON.stringify({status:'local_native_worker_started',pid:process.pid,shotId,mode,risk}));
const native=mark6NativeBudget(),local=new LtxVideoProvider({dataDir,lazyLoadDownloadedFast:true});
const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}};
const finalProvider=native.video(local),draftProvider=native.draft(local),inject=(r:ShotRequest):ShotRequest=>{
 if(!correction)throw Error('Explicit bounded compiled action required');
 const evidence={at:new Date().toISOString(),productionRunId:plan.id,shotId,sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:correction,mode:'positive_only_same_action',purpose:'First10s establishing Jesus plus twelve within17.510s shared6:7 narration. Same approved quiet calling/attention, current original13-person frame and zero-call samepose endpoint. Full direction/source/canon remain pinned and govern actual review; no new spokenwords, sourceboundary, departure or supernatural effect.',sourceAndCanonUnchanged:true};
 writeFileSync(join(folder,'native-prompt-compilation.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
 return{...r,prompt:correction};
};
const final={generateFinal:(...args:Parameters<typeof finalProvider.generateFinal>)=>finalProvider.generateFinal(inject(args[0]),{...args[1],endFrame:{path:endpoint.assetPath}})},draft={...draftProvider,generateDraft:(...args:Parameters<typeof draftProvider.generateDraft>)=>draftProvider.generateDraft(inject(args[0]),args[1])};
const result=await generateNonSpeakingVideoCandidate(db,projectId,shotId,{primaryBackend:'ltx',ltx:final,draft,veo:blocked,kling:blocked},{durationSeconds,allowDraftFallback:false});
writeFileSync(join(folder,'result.json'),JSON.stringify({at:new Date().toISOString(),request,result},null,2),{flag:'wx'});console.log(JSON.stringify(result));

