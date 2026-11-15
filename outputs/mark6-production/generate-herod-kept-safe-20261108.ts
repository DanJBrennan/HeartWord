// One explicit existing-stage retrospective view, after whole John quote08 acceptance.
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
const root='outputs/mark6-production',prepared=root+'/native-motion/herodias-and-herod-narration-preparation-20261108',project='c457a815-d07d-4902-91b5-7b936b549856',view='herod_kept_safe';
const folder=prepared+'/herod-kept-safe-native-v1',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),db=getDb(),data=getDataDir();
try{
 const packet=read(prepared+'/prepared-source-and-reference-index.json'),plan=requireCurrentPlan(db,data,project),native=read(root+'/native-generation/execution.json'),v=packet.views.find((v:any)=>v.shot.id==='523cef6e-b51d-4021-8969-b3b5d8118512'),q=read(root+'/complete-john-rebuke-source-window-20261108/selection-and-assembly.json');
 if(!v||!process.env.LTX_TOKEN||existsSync(folder+'/request.json')||native.entries.some((e:any)=>e.status!=='returned_unreviewed')||plan.id!==packet.productionRunId||plan.brief_hash!==packet.planningBriefHash||q.status!=='accepted_complete_john_rebuke_and_assembled')throw Error('Local credential, current scoped packet, accepted q07, settled native and no prior request required');
 validateAttemptRevision(db,data,project,q.attemptId);
 if(!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND status='accepted' AND operation='lip_sync'").get(q.attemptId))throw Error('Actual whole John quote08 must be accepted');
 const frame=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(v.shot.id);
 if(!frame||frame.id!==v.frameAttemptId||frame.result_asset_path!==v.frame||digest(readFileSync(join(data,'assets',v.frame)))!==v.frameSha256)throw Error('Exact accepted starting frame changed');
 const inspection=read(prepared+'/direct-five-starting-reference-review.json').views.find((i:any)=>i.shotId===v.shot.id);
 if(inspection?.frameAttemptId!==v.frameAttemptId||inspection.sha256!==v.frameSha256||inspection.nativeApproved!==false||JSON.stringify(packet.narratorRun.sourceMs)!=='[269900,340954]'||packet.narratorRun.samples!==1705296||packet.narratorRun.actorPlacementsOverlap!==false)throw Error('Exact inspected still and unchanged full original narrator run required');
 const previous=read(prepared+'/herod-fear-native-v1/selection-and-assembly.json');validateAttemptRevision(db,data,project,previous.attemptId);if(!db.prepare("SELECT ga.id FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id WHERE ga.id=? AND ga.shot_id=? AND ga.status='accepted' AND c.id=?").get(previous.attemptId,'a06ee818-2a55-42a8-a535-295ae5e6baf9',previous.selection.clipId))throw Error('Actual preceding planned view must be accepted and selected');
 const seconds=5 as const,prompt="One mature Papuan king remains supported in this exact raised royal chair in the supplied wider side view. His watchful eyes stay image-left, lips naturally together, brows slightly drawn, while ordinary brief blinks and quiet chest breathing provide living motion. Separate low hands rest on the same chair arms and both sandaled feet remain on the same footboard. Preserve bare salt-and-pepper curls and short beard, long cream bound-neck tunic, burgundy narrow-gold mantle and sash. Keep complete hair, hands, feet, chair and support visible. Fixed camera, same square stone piers, curtain, urns, steps and clear hall floor, warm hall-left source and weaker bounce, stable exposure. One restrained photographic take.";
 if(prompt.length>1000)throw Error('Bounded native motion required');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 mkdirSync(folder,{recursive:true});writeFileSync(folder+'/request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,view,shotId:v.shot.id,productionRunId:plan.id,planningBriefHash:plan.brief_hash,frame,frameSha256:v.frameSha256,seconds,fps:24,resolution:'720p',freeWebEncoder:true,paidFallback:false,sourceNarrationAndMusicUnchanged:true,sourceNarratorWindowMs:[269900,340954],requestedContainerNotWordAllocation:true,seed:43,governingDirector:v.exactApprovedDirector,endingGuidance:{path:v.frame,sha256:v.frameSha256,kind:'exact_accepted_start_reference_only_not_native_endpoint',reason:'Same fixed quiet pose; breathing/blinks allowed. Actual native movement/ending must be independently reviewed.'}},null,2),{flag:'wx'});
 const local=mark6NativeBudget(root).video(new LtxVideoProvider({dataDir:data,lazyLoadDownloadedFast:true}));
 const provider={generateFinal:(r:ShotRequest,o:Parameters<typeof local.generateFinal>[1])=>{writeFileSync(folder+'/native-prompt-compilation.json',JSON.stringify({sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:prompt,mode:'same_approved_action_positive_quiet_motion',sourceProseRetainedInScopedPacket:true,noNewNarrative:true},null,2),{flag:'wx'});return local.generateFinal({...r,prompt},{...o,seed:43,endFrame:{path:v.frame}});}};
 const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}},noDraft=async()=>{throw Error('Prepare a bounded local draft through existing draft stage if required; no fallback')};
 const result=await generateNonSpeakingVideoCandidate(db,project,v.shot.id,{primaryBackend:'ltx',ltx:provider,veo:blocked,kling:blocked,draft:{generateDraft:noDraft,generateGuided:noDraft}},{durationSeconds:seconds,allowDraftFallback:false});
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));
}finally{sharedLtxTransport().reset();db.close();}
