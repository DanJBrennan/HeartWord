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
// Existing source-scoped additionalCoverage stage; actual retained native endpoint only.
if(shotId!=='dee2961e-724d-4feb-885e-e1a8ec6205ac'||mode!=='final'||durationSeconds!==5)throw Error('Exact five-second continued Herod profile target required');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const extracted=JSON.parse(readFileSync(join(folder,'continuity-frame-extraction.json'),'utf8')),review=JSON.parse(readFileSync(join(folder,'continuity-frame-review.json'),'utf8')),approval=JSON.parse(readFileSync(join(folder,'additional-coverage-request.json'),'utf8'));
const endpoint={assetPath:'preparation/mark6-motion-continuity-20261107/herod-profile-selected-frame143.png',sha256:extracted.imageSha256};
if(review.status!=='accepted_actual_selected_endpoint_as_continuity_guidance_only'||review.sourceFrame!==143||review.imageSha256!==extracted.imageSha256||approval.shotId!==shotId||approval.productionRunId!==plan.id||approval.planningBriefHash!==plan.brief_hash||approval.acceptedAttemptId!==extracted.sourceAttemptId||sha(join(dataDir,'assets',extracted.sourceAsset))!==extracted.sourceSha256||sha(join(dataDir,'assets',endpoint.assetPath))!==endpoint.sha256)throw Error('Actual endpoint/approval provenance mismatch');
const selected=db.prepare('SELECT timeline_start_ms,timeline_end_ms FROM clips WHERE generation_attempt_id=?').get(extracted.sourceAttemptId);
if(!selected||selected.timeline_start_ms!==0||selected.timeline_end_ms!==6000)throw Error('Actual selected6s quiet native range basis required');
const endpointReviewPath=join(folder,'continuity-frame-review.json');
const correctionPath=paths[0],correction=correctionPath?readFileSync(correctionPath,'utf8').trim():'';if(correctionPath&&(!correction||correction.length>1000))throw Error('Correction must be explicit,nonempty and bounded');
const request={...(correctionPath?{motionClarification:{path:correctionPath,text:correction,sha256:createHash('sha256').update(correction).digest('hex')}}:{}),endingGuidance:{reviewPath:endpointReviewPath,path:endpoint.assetPath,sha256:endpoint.sha256},at:new Date().toISOString(),pid:process.pid,projectId,shotId,mode,productionRunId:plan.id,keyframe,risk,backend:'ltx_local',resolution:'720p',fps:24,durationSeconds,freeWebEncoder:true,paidFallback:false,defaultUnmeteredReviewDisabled:true};writeFileSync(join(folder,'request.json'),JSON.stringify(request,null,2),{flag:'wx'});console.log(JSON.stringify({status:'local_native_worker_started',pid:process.pid,shotId,mode,risk}));
const native=mark6NativeBudget(),local=new LtxVideoProvider({dataDir,lazyLoadDownloadedFast:true});
const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}};
const finalProvider=native.video(local),draftProvider=native.draft(local),inject=(r:ShotRequest):ShotRequest=>{
 if(!correction)throw Error('Explicit bounded compiled action required');
 const evidence={at:new Date().toISOString(),productionRunId:plan.id,shotId,sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:correction,mode:'positive_only_same_action',purpose:'Continue selected six-second serious seated Herod listening from its actual final native frame143. The late broad-smile parent suffix remains excluded. Five new seconds target four seconds of additional profile coverage within complete44.0295s original narrator reports. Same supported action and source/canon; actual returned motion and join require review.',sourceAndCanonUnchanged:true};
 writeFileSync(join(folder,'native-prompt-compilation.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
 return{...r,prompt:correction};
};
const final={generateFinal:(...args:Parameters<typeof finalProvider.generateFinal>)=>finalProvider.generateFinal(inject(args[0]),{...args[1],startFrame:{path:endpoint.assetPath},endFrame:{path:endpoint.assetPath}})},draft={...draftProvider,generateDraft:(...args:Parameters<typeof draftProvider.generateDraft>)=>draftProvider.generateDraft(inject(args[0]),args[1])};
const result=await generateNonSpeakingVideoCandidate(db,projectId,shotId,{primaryBackend:'ltx',ltx:final,draft,veo:blocked,kling:blocked},{durationSeconds,allowDraftFallback:false,additionalCoverage:{acceptedAttemptId:approval.acceptedAttemptId,requestNoteId:approval.requestNoteId,reason:approval.reason}});
writeFileSync(join(folder,'result.json'),JSON.stringify({at:new Date().toISOString(),request,result},null,2),{flag:'wx'});console.log(JSON.stringify(result));

