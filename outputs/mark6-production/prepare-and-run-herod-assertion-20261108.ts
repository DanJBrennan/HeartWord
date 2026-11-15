// Operational invocation of the EXISTING production lip-sync stage; no test provenance.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {mark6NativeBudget} from './native-budget.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/herod-assertion-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='b86afce1-84b5-4518-accb-7853b7e5e9a0',db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const plan=requireCurrentPlan(db,data,project),preflight=read(root+'/speaking-source-preflight/herod-assertion/preflight.json'),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='accepted'").get('5d7a3d47-f5a9-4a48-94cf-ab244729ce35',shot);
if(!frame?.result_asset_path||hash(join(data,'assets',String(frame.result_asset_path)))!=='d599e05231678ee42ae9b264a1c9ad34a81939b51586e4708f001efb5990a3ca'||preflight.fullLineSamples!==513600||preflight.sampleRate!==48000||preflight.plan.sections.length!==4||hash(join(data,'assets',preflight.audio.path))!==preflight.sourceSha256||plan.id!==preflight.productionRunId)throw Error('Current exact frame/audio/source/plan required');
mkdirSync(folder,{recursive:true});
const crop={x:80,y:0,width:1120,height:630,evidenceRef:folder+'/framing-preflight.json'};
const evidence={at:new Date().toISOString(),shotId:shot,productionRunId:plan.id,frame:frame.result_asset_path,frameSha256:'d599e05231678ee42ae9b264a1c9ad34a81939b51586e4708f001efb5990a3ca',crop,...{"status":"prepared_for_existing_stage_not_submitted","reason":"Exactacceptedheadroomreuse5d7a of923sourceviewed: fullbarecurls/beard/eyes/lips/jaw/shoulders, currentcream-boundneck/burgundynarrowgold/chair/curtain/stone/warmleftlight andreal11-12percent uppermargin. Predictedsame-coordinate nativecropx80y0w1120h630 removesouter/bottomcaption-riskborderwhilekeepingfullhair/mouth. Diagnoseboth1280x720and1280x704expectedrastersbeforeexecution; actualnativeoutputnotyetknown. No universalcaptionguarantee, no progressivecrop/zoom; carryonlyactualpreviousLASTRETAINEDnativeframe. Completeoriginal10.7s513600stereo48kq07Rajanthrough4measuredsourcequietsections. Source229368.5-240068.5ms unchanged, originalnarratorreportsremainbefore; retrospectiveonlyaftercompleteassertion. No newvoice/alignment/imagegeneration/sourcepause/guessedHatamwordtiming. Actualintro93->speechcut/persectionandfull-lineAVstillrequired.","completeAudioSamples":513600,"wholeAssertionSamples":513600,"sampleRate":48000,"shortSections":4,"nativeExpectedCalls":4,"newVoiceCallsAuthorized":0,"paidFallback":false,"needsActualFullLineAV":true,"requiresActualPictureContinuityClearanceBetweenSections":true}};
const framingFile=folder+'/framing-preflight.json';if(!existsSync(framingFile))writeFileSync(framingFile,JSON.stringify(evidence,null,2),{flag:'wx'});else{const old=read(framingFile);if(old.frameSha256!==evidence.frameSha256||old.productionRunId!==evidence.productionRunId||JSON.stringify(old.crop)!==JSON.stringify(crop))throw Error('Existing preparation changed; reconcile first');}
if(!process.argv.includes('--execute')){console.log(JSON.stringify(evidence));db.close();}else{
 if(!process.env.LTX_TOKEN||existsSync(folder+'/result.json')||existsSync(folder+'/execution-request.json'))throw Error('Local credential required and retained result cannot be repeated');
 if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Another native request pending; do not start speech yet');
 for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
 const direct=read(folder+'/framing-direct-review.json');if(direct.status!=='accepted_scene_specific_crop_for_native_trial'||direct.frameSha256!==evidence.frameSha256||JSON.stringify(direct.crop)!==JSON.stringify(crop))throw Error('Actualscene-specificcropinspection required');
 const budget=mark6NativeBudget(root),pending=root+'/native-speaking-allowance-pending.json';
 let sectionIndex=0;
 writeFileSync(folder+'/execution-request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,shotId:shot,productionRunId:plan.id,sourceSamples:513600,expectedSections:4,paidFallback:false},null,2),{flag:'wx'});
 const section:typeof budget.section=async(request,dependencies)=>{
  const index=sectionIndex++,manifest=join(request.directory,'..','line.json'),line=read(manifest);if(index>=4||line.plan.sampleCount!==513600||JSON.stringify(line.plan)!==JSON.stringify(preflight.plan)||line.reference.sha256!==evidence.frameSha256)throw Error('Actual source plan/current reference changed');
  const clearance=folder+'/section-'+(index-1)+'-continuation-clearance.json';
  let announced=false;
  while(true){
   let clear=index===0;
   if(index>0&&existsSync(clearance)){const c=read(clearance),previous=read(manifest).sections[index-1];if(!previous||c.status!=='clear_for_next_native_section'||!String(c.reviewer??'').trim()||c.rawSha256!==previous.rawSha256||c.carryImageSha256!==previous.carryImageSha256||hash(previous.carryImagePath)!==c.carryImageSha256||c.pictureSha256!==hash(previous.picturePath))throw Error('Previous actual picture continuation clearance mismatch');clear=true;}
   const snapshot=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(snapshot.observedAt);
   if(clear&&snapshot.source==='actual_host_get_usage_limits'&&snapshot.ordinaryUsageAllowed===true&&Number.isFinite(snapshot.usedPercent)&&snapshot.usedPercent>=0&&snapshot.usedPercent<=100&&Number.isFinite(age)&&age>=0&&age<60000)break;
   if(!announced){const status='waiting_for_actual_section_review_and_fresh_allowance';writeFileSync(pending,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status,directory:request.directory,previousSectionIndex:index-1,clearanceRequired:index>0,clearancePath:clearance}));console.log(JSON.stringify({status,index,pid:process.pid}));announced=true;}await new Promise(r=>setTimeout(r,5000));
  }
  if(announced&&existsSync(pending))unlinkSync(pending);return budget.section(request,dependencies);
 };
 const prompt="One single mature seated man in this exact royal head-and-shoulders view speaks only the supplied Hatam audio. Preserve his mature Papuan salt-and-pepper face, complete bare curls/beard, clean cream bound neckline, burgundy mantle with narrow gold edging, supported upright royal posture and report-directed gaze just left of camera. Lips and jaw follow the actual audio and its genuine quiet with comfortable restrained conversational articulation. His expression stays troubled and serious, cheeks and brow settled, head movement minimal, shoulders quiet and hands below the picture. Natural soft blinks and breathing. Keep the same royal chair posts, burgundy curtain, rectangular stone piers, warm hall-left key and weaker bounce with stable exposure. Fixed camera and full hair, unobscured eyes/lips/jaw. Each section continues directly from the previous actual LAST RETAINED native frame in the same coordinates. One continuous whole assertion precedes the retrospective account. No extra speech, smile override, invented guilt gesture, prop, other person, music, captions, subtitles, transcription, logos, labels or text.";
 try{const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));}finally{sharedLtxTransport().reset();db.close();}
}
