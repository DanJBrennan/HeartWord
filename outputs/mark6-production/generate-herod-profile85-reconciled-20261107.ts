// Four source-scoped invocations of the existing native non-speaking stage.
// Preparation is not a queue: execute one explicit view only at a safe boundary.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {digest} from '../../src/pipeline/creative-direction/crew-context.js';
import {generateNonSpeakingVideoCandidate,localMotionDirection} from '../../src/pipeline/media-generation/final-video.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
import type {ShotRequest} from '../../src/providers/types.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',prepared=root+'/native-motion/herod-reports-preparation-v1',project='c457a815-d07d-4902-91b5-7b936b549856',view=process.argv[2],choices={profile:{shot:'dee2961e-724d-4feb-885e-e1a8ec6205ac',seconds:10,prompt:'profile'},close:{shot:'5d061b83-d717-4c37-86be-39e3e227585a',seconds:10,prompt:'additional-close'},wide:{shot:'ade62c6b-cc88-4ebc-8436-5dafb8d676a7',seconds:10,prompt:'additional-wide'},intro:{shot:'58ff35a7-c2ea-4f3c-bc49-ed36a4ce6d64',seconds:5,prompt:'intro'}} as const;
if(!view||!(view in choices))throw Error('One explicit profile/close/wide/intro required');
if(!['profile'].includes(view))throw Error('This scoped recovered worker is only for exact profile request');
const selected=choices[view as keyof typeof choices],folder=prepared+'/'+view+'-final-after-reconcile-v2',db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
try{
 const packet=read(prepared+'/prepared-source-and-motion.json'),plan=requireCurrentPlan(db,data,project),native=read(root+'/native-generation/execution.json'),start=packet.views.find((v:any)=>v.id===selected.shot),frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(selected.shot);
 if(!process.env.LTX_TOKEN||existsSync(folder+'/request.json')||native.entries.some((e:any)=>e.status!=='returned_unreviewed')||plan.id!==packet.productionRunId||plan.brief_hash!==packet.planningBriefHash||!frame?.result_asset_path||String(frame.result_asset_path)!==start?.frame||digest(readFileSync(join(data,'assets',String(frame.result_asset_path))))!==start.frameSha256)throw Error('Current prepared view, settled native journal, local credential and unchanged frame/revision required; no duplicate submission');
 const prompt=readFileSync(prepared+'/'+selected.prompt+'-motion.txt','utf8').trim();if(!prompt||prompt.length>1000)throw Error('Bounded existing approved motion required');
 const extension=(view==='close'||view==='wide')?read(prepared+'/additional-coverage-requests.json').requests.find((r:any)=>r.view===view):undefined;
 const endpoint=view==='wide'?read(prepared+'/wide-endpoint-extraction.json'):undefined;
 if(endpoint&&(read(prepared+'/wide-endpoint-review.json').imageSha256!==endpoint.imageSha256||digest(readFileSync(join(data,'assets',endpoint.imageAsset)))!==endpoint.imageSha256))throw Error('Actual wide endpoint changed');
 for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
 mkdirSync(folder,{recursive:true});writeFileSync(folder+'/request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,view,shotId:selected.shot,productionRunId:plan.id,planningBriefHash:plan.brief_hash,frame,frameSha256:start.frameSha256,seconds:selected.seconds,resolution:'720p',fps:24,extension,endpoint,freeWebEncoder:true,paidFallback:false,sourceNarrationAndMusicUnchanged:true},null,2),{flag:'wx'});
 const local=mark6NativeBudget(root).video(new LtxVideoProvider({dataDir:data,lazyLoadDownloadedFast:true}));
 const provider={generateFinal:(r:ShotRequest,o:Parameters<typeof local.generateFinal>[1])=>{writeFileSync(folder+'/native-prompt-compilation.json',JSON.stringify({sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:prompt,mode:'same_approved_action_positive_quiet_motion',noNewNarrative:true},null,2),{flag:'wx'});return local.generateFinal({...r,prompt},endpoint?{...o,startFrame:{path:endpoint.imageAsset}}:o);}};
 const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}},noDraft=async()=>{throw Error('No new draft/fallback authorized for this exact prepared view')};
 const result=await generateNonSpeakingVideoCandidate(db,project,selected.shot,{primaryBackend:'ltx',ltx:provider,veo:blocked,kling:blocked,draft:{generateDraft:noDraft,generateGuided:noDraft}},{durationSeconds:selected.seconds,allowDraftFallback:false,...(extension?{additionalCoverage:{acceptedAttemptId:extension.acceptedAttemptId,requestNoteId:extension.requestNoteId,reason:extension.reason}}:{})});
 writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));
}finally{sharedLtxTransport().reset();db.close();}
