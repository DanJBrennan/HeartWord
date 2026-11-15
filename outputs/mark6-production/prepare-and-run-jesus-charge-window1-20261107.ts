// Operational invocation of the EXISTING production lip-sync stage; no test provenance.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {mark6NativeBudget} from './native-budget.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/jesus-travel-charge-window1-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='0b7d5eb1-cf5d-4327-8480-c61d29583430',db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const plan=requireCurrentPlan(db,data,project),preflight=read(root+'/speaking-source-preflight/jesus-travel-charge-window1/preflight.json'),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='accepted'").get('a8063208-91f9-44a4-a99b-7e32c6c45203',shot);
if(!frame?.result_asset_path||hash(join(data,'assets',String(frame.result_asset_path)))!=='d4cb3e940008d03a01fc96214db852e743d2d39f863ad81ae994f8fdaec504b8'||preflight.fullLineSamples!==700000||preflight.sampleRate!==48000||preflight.plan.sections.length!==5||hash(join(data,'assets',preflight.audio.path))!==preflight.sourceSha256||plan.id!==preflight.productionRunId)throw Error('Current exact frame/audio/source/plan required');
mkdirSync(folder,{recursive:true});
const crop={x:80,y:0,width:1120,height:630,evidenceRef:folder+'/framing-preflight.json'};
const evidence={at:new Date().toISOString(),shotId:shot,productionRunId:plan.id,frame:frame.result_asset_path,frameSha256:'d4cb3e940008d03a01fc96214db852e743d2d39f863ad81ae994f8fdaec504b8',crop,...{"status": "prepared_for_existing_stage_not_submitted", "reason": "Actual accepted headroom-safe charge frame80 and diagnostic expected native crop inspected: full hair/beard/mouth/shoulders, about17-20percent uppermargin, current central-slit/indigo wardrobe and westfacade/daylight remain. Explicit x80y0/1120x630 recipe at expected1280x720 output removes only outer/bottom area where prior native text occurred; no universal caption guarantee. Carry smears only discarded border pixels; retained interior stays in the same native coordinates without repeatedzoom. All actual returned frames/captions/headroom/source joins require review. First700000 of2239200stereo48k samples in one46.65s quotation; windows2/3 MUST use each actual last RETAINED native ending, not this original still or paddedtail. Complete unchanged quote-03 remains external soundtrack. Optionalstaffinsert omitted unless later source-safe need is demonstrated, no extra timing/pauses or semantic boundary inferred.", "completeAudioSamples": 700000, "wholeChargeSamples": 2239200, "sampleRate": 48000, "shortSections": 5, "nativeExpectedCalls": 5, "newVoiceCallsAuthorized": 0, "paidFallback": false, "needsActualFullLineAV": true, "requiresActualPictureContinuityClearanceBetweenSections": true}};
const framingFile=folder+'/framing-preflight.json';if(!existsSync(framingFile))writeFileSync(framingFile,JSON.stringify(evidence,null,2),{flag:'wx'});else{const old=read(framingFile);if(old.frameSha256!==evidence.frameSha256||old.productionRunId!==evidence.productionRunId||JSON.stringify(old.crop)!==JSON.stringify(crop))throw Error('Existing preparation changed; reconcile first');}
if(!process.argv.includes('--execute')){console.log(JSON.stringify(evidence));db.close();}else{
 if(!process.env.LTX_TOKEN||existsSync(folder+'/result.json')||existsSync(folder+'/execution-request.json'))throw Error('Local credential required and retained result cannot be repeated');
 if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Another native request pending; do not start speech yet');
 for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
 const budget=mark6NativeBudget(root),pending=root+'/native-speaking-allowance-pending.json';
 let sectionIndex=0;
 writeFileSync(folder+'/execution-request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,shotId:shot,productionRunId:plan.id,sourceSamples:700000,expectedSections:5,paidFallback:false},null,2),{flag:'wx'});
 const section:typeof budget.section=async(request,dependencies)=>{
  const index=sectionIndex++,manifest=join(request.directory,'..','line.json'),line=read(manifest);if(index>=5||line.plan.sampleCount!==700000||JSON.stringify(line.plan)!==JSON.stringify(preflight.plan)||line.reference.sha256!==evidence.frameSha256)throw Error('Actual source plan/current reference changed');
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
 const prompt='The single person in this exact supplied exterior head-and-shoulders view speaks the supplied Hatam audio. Keep his face, full shoulder-length curls/beard, cream central front-slit tunic, indigo shoulder bands, upright relaxed stance and near-camera disciple eyeline. Natural lips and jaw follow only the actual audio with comfortable conversational articulation and its genuine quiet; restrained head and brow movement, quiet shoulders and hands below the picture. Preserve the same roughstone west facade, plain plank doorway, sky/trees, daylight and exposure. Hold the camera fixed and complete hair/mouth visible. Continue directly from the previous actual last retained frame in the same native coordinates, without pose reset or progressive zoom. Keep other people offscreen. No new speech, pointing, counting, sandal or tunic handling, smile override, music, captions, subtitles, transcription, labels or text. This charge continues beyond this picture window; no new emotional ending or departure is implied.';
 try{const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));}finally{sharedLtxTransport().reset();db.close();}
}
