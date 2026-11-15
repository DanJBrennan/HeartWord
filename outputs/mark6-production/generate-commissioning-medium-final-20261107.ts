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
const root='outputs/mark6-production',folder=join(root,'native-motion/scene2-shot2-commissioning-medium-final-v1'),project='c457a815-d07d-4902-91b5-7b936b549856',shot='62288e58-86c4-4766-a567-f43d67d41573',execute=process.argv.includes('--execute');
if(process.argv.slice(2).some(a=>a!=='--execute'))throw Error('Only explicit --execute supported');
const db=getDb(),data=getDataDir(),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
try{
 const plan=requireCurrentPlan(db,data,project),risk=shotRiskFor(db,shot),k=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shot);
 if(k?.id!=='706e1acd-cdba-4c7d-8dad-69ad325955e9'||risk.draftFirst)throw Error('Current routine medium and exact accepted original reference required');
 const startSha256=hash(join(data,'assets',String(k.result_asset_path)));
 const prompt='Exactly the original three visible people in this medium view: teacher back and shoulder at LEFT, older rust-mantled listener at center-left and bareheaded green-trimmed listener at RIGHT. Both listeners remain planted facing the teacher, with the same staff ownership and original relaxed grips. Concentrated quiet attention, independently timed blinks, ordinary breathing and tiny natural eye adjustments; lips rest quietly closed. Keep their faces, hair, beard, tunic openings, colored stripes, mantle folds, belts and hand positions consistent. Preserve the plain plank doorway, north stone boundary, trees and same soft daylight and exposure. A very short slow physical camera push through the clear foreground air keeps both faces focused and heads comfortably in frame. Retain actual parallax and stable human proportions. End with unchanged attentive positions. Real subtle continuous motion throughout.';
 if(prompt.length>1000)throw Error('Bounded positive action exceeded');
 mkdirSync(folder,{recursive:true});
 const preflight={at:new Date().toISOString(),shotId:shot,productionRunId:plan.id,briefHash:plan.brief_hash,keyframe:k,startSha256,risk,durationSeconds:10,sourceGroupStartMs:98679,sourceGroupEndMs:116189,sourceGroupDurationMs:17510,nativeMotionPrompt:prompt,explicitNoGeneration:!execute,paidFallback:false,readiness:'Requires reviewed actual wide ending and cut-continuity gate before execution; no exact adjacency/hidden camera clearance certified by a still.'};
 if(!execute){writeFileSync(join(folder,'preflight.json'),JSON.stringify(preflight,null,2));console.log(JSON.stringify(preflight));process.exitCode=0;}
 else{
  const gate=read(join(folder,'wide-to-medium-continuity-review.json'));
  if(gate.status!=='accepted_cut_to_current_medium_for_review'||gate.productionRunId!==plan.id||gate.mediumStartAttemptId!==k.id||gate.mediumStartSha256!==startSha256||hash(gate.wideEnd.path)!==gate.wideEnd.sha256)throw Error('Missing actual reviewed wide-to-medium continuity');
  const wide=db.prepare("SELECT ga.result_asset_path,c.id clip_id FROM generation_attempts ga JOIN clips c ON c.generation_attempt_id=ga.id WHERE ga.id=? AND ga.status='accepted' AND c.id=?").get(gate.wideAttemptId,gate.wideSelectedClipId);
  if(!wide||hash(join(data,'assets',String(wide.result_asset_path)))!==gate.wideSourceSha256)throw Error('Wide is not actually selected/current reviewed source');
  if(existsSync(join(folder,'request.json'))||existsSync(join(folder,'result.json')))throw Error('Existing medium operation: reconcile, never repeat');
  if(!process.env.LTX_TOKEN)throw Error('Stored local Desktop credential required');
  for(const name of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[name];
  checkFilmSpend(db,project,0);writeFileSync(join(folder,'request.json'),JSON.stringify({...preflight,pid:process.pid,backend:'ltx_local',resolution:'720p',fps:24,freeWebEncoder:true,defaultUnmeteredReviewDisabled:true,continuityGate:gate},null,2),{flag:'wx'});
  const local=mark6NativeBudget().video(new LtxVideoProvider({dataDir:data,lazyLoadDownloadedFast:true}));
  const provider={generateFinal:(r:ShotRequest,o:Parameters<typeof local.generateFinal>[1])=>{
   writeFileSync(join(folder,'native-prompt-compilation.json'),JSON.stringify({productionRunId:plan.id,shotId:shot,sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:prompt,mode:'positive_only_same_action',sourceAndCanonUnchanged:true,noNewDialogueOrNarrative:true},null,2),{flag:'wx'});
   return local.generateFinal({...r,prompt},o);
  }};
  const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}};
  const noDraft=async()=>{throw Error('Routine medium has no authorized extra draft or fallback')};
  const result=await generateNonSpeakingVideoCandidate(db,project,shot,{primaryBackend:'ltx',ltx:provider,veo:blocked,kling:blocked,draft:{generateDraft:noDraft,generateGuided:noDraft}},{durationSeconds:10,allowDraftFallback:false});
  writeFileSync(join(folder,'result.json'),JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{db.close();}
