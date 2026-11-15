// One explicit existing-stage retrospective view, after whole q07 acceptance.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {digest} from '../../src/pipeline/creative-direction/crew-context.js';
import {generateNonSpeakingVideoCandidate,localMotionDirection} from '../../src/pipeline/media-generation/final-video.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
import type {ShotRequest} from '../../src/providers/types.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',prepared=root+'/native-motion/herod-retrospective-preparation-v1',project='c457a815-d07d-4902-91b5-7b936b549856',view=process.argv[2];
if(!view||!['responsibility','marriage','rebuke_tableau','royal_listener'].includes(view))throw Error('One explicit prepared retrospective view required');
if(view!=='royal_listener')throw Error('Only reviewed106 listening repair is allowed');
const folder=prepared+'/'+view+'-neutral-guided-v2',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),db=getDb(),data=getDataDir();
try{
 const packet=read(prepared+'/prepared-source-and-motion.json'),plan=requireCurrentPlan(db,data,project),native=read(root+'/native-generation/execution.json'),v=packet.views.find((v:any)=>v.view===view),q=read(root+'/complete-herod-assertion-source-window-20261108/selection-and-assembly.json');
 if(!v||!process.env.LTX_TOKEN||existsSync(folder+'/request.json')||native.entries.some((e:any)=>e.status!=='returned_unreviewed')||plan.id!==packet.productionRunId||plan.brief_hash!==packet.planningBriefHash||q.status!=='accepted_complete_assertion_and_assembled')throw Error('Local credential, current scoped packet, accepted q07, settled native and no prior request required');
 validateAttemptRevision(db,data,project,q.attemptId);
 if(!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND status='accepted' AND operation='lip_sync'").get(q.attemptId))throw Error('Actual whole q07 must be accepted');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(v.shotId);
 if(!frame||frame.id!==v.frameAttemptId||frame.result_asset_path!==v.frame||digest(readFileSync(join(data,'assets',v.frame)))!==v.frameSha256)throw Error('Exact accepted starting frame changed');
 const held=read(prepared+'/royal_listener-final-guided-v1/root-direct-hold.json');
 if(held.attemptId!=='10bea855-ebf8-4b1f-9fec-80e3d515ba68'||held.status!=='held_by_direct_actual_review'||!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND status='retry_modified'").get(held.attemptId))throw Error('Reviewed106 failure must be retained before replacement');
 const motion=v.nativeMotionPreparation,seconds=motion.requestedNativeContainerSeconds;
 const prompt='One mature Papuan king quietly listens in this exact supported royal chair. His relaxed closed lips maintain level mouth corners and his cheeks remain settled throughout. Steady attentive eyes stay slightly image-left, with ordinary brief blinks and subtle chest breathing. Separate hands rest low on the same chair arms. Preserve the supplied bare salt-and-pepper curls, short beard, cream bound neckline, burgundy mantle with narrow gold borders and matching sash. Complete hair, eyes and jaw remain clear at the same framing. The royal curtain and square rectangular stone piers remain unchanged in fixed warm hall-left light. Locked camera, one restrained photographic take.';
 if(![5,8].includes(seconds)||!prompt||prompt.length>1000||digest(readFileSync(motion.path))!==motion.sha256||!v.directStartingFrameInspection?.finding)throw Error('Prepared inspected bounded motion required');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 mkdirSync(folder,{recursive:true});writeFileSync(folder+'/request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,view,shotId:v.shotId,productionRunId:plan.id,planningBriefHash:plan.brief_hash,frame,frameSha256:v.frameSha256,seconds,fps:24,resolution:'720p',freeWebEncoder:true,paidFallback:false,sourceNarrationAndMusicUnchanged:true,seed:43,changedVariables:'Positive physical neutral listening prompt and seed43; same accepted start/end reference, duration, source, canon and action',previousHeldAttemptId:held.attemptId,endingGuidance:{path:v.frame,sha256:v.frameSha256,kind:'exact_accepted_start_reference_only_not_native_endpoint',reason:'Same fixed quiet pose; breathing/blinks allowed. Actual native movement/ending must be independently reviewed.'}},null,2),{flag:'wx'});
 const local=mark6NativeBudget(root).video(new LtxVideoProvider({dataDir:data,lazyLoadDownloadedFast:true}));
 const provider={generateFinal:(r:ShotRequest,o:Parameters<typeof local.generateFinal>[1])=>{writeFileSync(folder+'/native-prompt-compilation.json',JSON.stringify({sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:prompt,mode:'same_approved_action_positive_quiet_motion',sourceProseRetainedInScopedPacket:true,noNewNarrative:true},null,2),{flag:'wx'});return local.generateFinal({...r,prompt},{...o,seed:43,endFrame:{path:v.frame}});}};
 const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}},noDraft=async()=>{throw Error('Prepare a bounded local draft through existing draft stage if required; no fallback')};
 const result=await generateNonSpeakingVideoCandidate(db,project,v.shotId,{primaryBackend:'ltx',ltx:provider,veo:blocked,kling:blocked,draft:{generateDraft:noDraft,generateGuided:noDraft}},{durationSeconds:seconds,allowDraftFallback:false});
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));
}finally{sharedLtxTransport().reset();db.close();}
