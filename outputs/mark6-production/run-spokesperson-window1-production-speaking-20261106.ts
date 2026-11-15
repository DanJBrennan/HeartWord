// Operational invocation of the EXISTING production lip-sync stage; no test provenance.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {mark6NativeBudget} from './native-budget.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/spokesperson-questions-window1-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='1a3ecc10-00c7-4d1f-b0bc-0b276f4f1045',db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const plan=requireCurrentPlan(db,data,project),preflight=read(root+'/speaking-source-preflight/spokesperson-questions/preflight.json'),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='accepted'").get('073b2f4e-e07c-4895-af43-f1289194023d',shot);
if(!frame?.result_asset_path||hash(join(data,'assets',String(frame.result_asset_path)))!=='98c59ed3bc6405e7a45ef4a611572a404d53aed34f3d8c7d06b355763a7c033c'||preflight.fullLineSamples!==874000||preflight.sampleRate!==48000||preflight.plan.sections.length!==6||hash(join(data,'assets',preflight.audio.path))!==preflight.sourceSha256||plan.id!==preflight.productionRunId)throw Error('Current exact frame/audio/source/plan required');
mkdirSync(folder,{recursive:true});
const crop={x:160,y:0,width:960,height:540,evidenceRef:folder+'/framing-preflight.json'};
const evidence={at:new Date().toISOString(),status:'prepared_for_existing_stage_not_submitted',shotId:shot,productionRunId:plan.id,frame:frame.result_asset_path,frameSha256:'98c59ed3bc6405e7a45ef4a611572a404d53aed34f3d8c7d06b355763a7c033c',crop,reason:'Actual accepted spokesperson chest-up frame inspected: full curls/beard/mouth visible, narrow top margin. Proposed centered960x540 at native x160y0 retains face while removing common lower caption area; not universal or guaranteed. Actual raw hair/head movement/captions and source-bound joins require inspection. This is first874000 samples of ONE1456848-sample quotation; second picture allocation MUST start from actual last RETAINED frame, not reset to this still. Final external soundtrack remains the full unchanged quote-01 master. No semantic or emotional boundary is inferred from the shared quiet picture cut.',completeAudioSamples:874000,sampleRate:48000,shortSections:6,nativeExpectedCalls:6,newVoiceCallsAuthorized:0,paidFallback:false,needsActualFullLineAV:true};writeFileSync(folder+'/framing-preflight.json',JSON.stringify(evidence,null,2));
if(!process.argv.includes('--execute')){console.log(JSON.stringify(evidence));db.close();}else{
 if(!process.env.LTX_TOKEN||existsSync(folder+'/result.json'))throw Error('Local credential required and retained result cannot be repeated');
 if(read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Another native request pending; do not start speech yet');
 for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[key];
 const budget=mark6NativeBudget(root),pending=root+'/native-speaking-allowance-pending.json';
 const section:typeof budget.section=async(request,dependencies)=>{
  let announced=false;
  while(true){const s=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(s.observedAt);if(s.source==='actual_host_get_usage_limits'&&s.ordinaryUsageAllowed===true&&Number.isFinite(age)&&age>=0&&age<60000)break;if(!announced){writeFileSync(pending,JSON.stringify({at:new Date().toISOString(),pid:process.pid,status:'waiting_for_fresh_actual_host_allowance_no_submission',directory:request.directory}));console.log(JSON.stringify({status:'waiting_for_fresh_actual_host_allowance',directory:request.directory}));announced=true;}await new Promise(r=>setTimeout(r,5000));}
  if(announced&&existsSync(pending))unlinkSync(pending);return budget.section(request,dependencies);
 };
 const prompt='The single approved Papuan spokesperson in this exact supplied synagogue close-up speaks the supplied Hatam audio. Keep his full beard, short curls, brown tunic with two dark-indigo clavi and pale outside mantle, position, near-lens eyeline toward Jesus, and warm entrance daylight unchanged. Static camera, whole hair and mouth visible, resting hands below face. Searching attentive questioning follows astonishment; natural lips, jaw, breathing and restrained head movement follow the actual audio. Carry on from the previous last retained frame without pose reset or progressive zoom. Add no pointing, step, smile override, newly timed emotional change, other person, speech, music, captions, subtitles, transcription or text. Stop mouth movement only when the supplied audio rests. The source quotation continues beyond this picture allocation; no resolved reaction or performance ending is implied.';
 try{const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));}finally{sharedLtxTransport().reset();db.close();}
}
