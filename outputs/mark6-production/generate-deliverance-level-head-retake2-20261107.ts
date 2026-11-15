import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {ShotRequest} from '../../src/providers/types.js';
import {getDb,getDataDir} from '../../src/db/client.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
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
if(shotId!=='2d139176-2b3a-4baf-9534-99f9013d7192'||mode!=='final'||durationSeconds!==5||risk.draftFirst)throw Error('Exact routine five-second deliverance retake only');
const parentId='64357570-43c0-4b0e-9a9d-791249b980ef',parentPath=join(dataDir,'assets/generated/video/2d139176-2b3a-4baf-9534-99f9013d7192-ltx-819a52d6-70b6-4c95-a0a2-3f3fda57f2c6.mp4.json'),parent=JSON.parse(readFileSync(parentPath,'utf8')),startPath=String(keyframe.result_asset_path),startSha256=createHash('sha256').update(readFileSync(join(dataDir,'assets',startPath))).digest('hex');
if(!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND shot_id=? AND status='retry_modified'").get(parentId,shotId)||parent.status!=='complete'||parent.generationId!=='819a52d6-70b6-4c95-a0a2-3f3fda57f2c6'||parent.seed!==2013499806||parent.sourceKeyframe!==startPath||keyframe.id!=='9f570cc5-fcf2-411b-bc27-13889a65b5a0'||startSha256!=='2382a4794044c46ba14e18f59167f644f70205111baad5e685b71f39888ac68a'||parent.model!=='ltx-2.5-fast'||parent.resolution!=='720p'||parent.durationSeconds!==5||parent.fps!==24)throw Error('Actual settled failed take/current exact original start required');
const endingGuidance={kind:'prospective_original_start_image_as_level_pose_ending_guide',path:startPath,sha256:startSha256,parentAttemptId:parentId,seed:689502263,notAnActualNativeEnding:true,newImageGenerationCalls:0,limitation:'Same approved still is prospective ending guidance, not proof of actual continuity or successful motion. Full actual output review remains required.'};
const correctionPath=paths[0],correction=correctionPath?readFileSync(correctionPath,'utf8').trim():'';if(correctionPath&&(!correction||correction.length>1000))throw Error('Correction must be explicit,nonempty and bounded');
const request={endingGuidance,...(correctionPath?{motionClarification:{path:correctionPath,text:correction,sha256:createHash('sha256').update(correction).digest('hex')}}:{}),at:new Date().toISOString(),pid:process.pid,projectId,shotId,mode,productionRunId:plan.id,keyframe,risk,backend:'ltx_local',resolution:'720p',fps:24,durationSeconds,freeWebEncoder:true,paidFallback:false,defaultUnmeteredReviewDisabled:true};writeFileSync(join(folder,'request.json'),JSON.stringify(request,null,2),{flag:'wx'});console.log(JSON.stringify({status:'local_native_worker_started',pid:process.pid,shotId,mode,risk}));
const native=mark6NativeBudget(),local=new LtxVideoProvider({dataDir,lazyLoadDownloadedFast:true});
const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}};
const finalProvider=native.video(local),inject=(r:ShotRequest):ShotRequest=>{if(!correction)throw Error('Explicit short positive level-gaze action required');writeFileSync(join(folder,'native-prompt-compilation.json'),JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,shotId,parentAttemptId:parentId,sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:correction,mode:'positive_only_same_approved_individual_aftermath',endingGuidance,changedVariables:['short positive level-head gaze prose in native encoder only','same approved start also used as prospective ending guidance','seed689502263 reused from actually successful level-head preaching77'],unchanged:'current source/canon/start/model/resolution/duration/fps ; priorseed2013499806 deliberatelychanged to successfulpreachseed689502263',limitations:'Not a single-variable causal test; no successful output or native pose match inferred from inputs.'},null,2),{flag:'wx'});return{...r,prompt:correction};};
const final={generateFinal:(...args:Parameters<typeof finalProvider.generateFinal>)=>finalProvider.generateFinal(inject(args[0]),{...args[1],endFrame:{path:startPath},seed:689502263})},draft=native.draft(local);
const result=await generateNonSpeakingVideoCandidate(db,projectId,shotId,{primaryBackend:'ltx',ltx:final,draft,veo:blocked,kling:blocked},{durationSeconds,allowDraftFallback:false});
writeFileSync(join(folder,'result.json'),JSON.stringify({at:new Date().toISOString(),request,result},null,2),{flag:'wx'});console.log(JSON.stringify(result));

