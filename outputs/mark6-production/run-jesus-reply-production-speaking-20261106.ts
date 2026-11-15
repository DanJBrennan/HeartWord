// Operational invocation of the EXISTING production lip-sync stage; no test provenance.
import {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {runVoiceLipSync} from '../../src/pipeline/voice-lipsync/index.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {mark6NativeBudget} from './native-budget.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
const root='outputs/mark6-production',folder=root+'/speaking-execution/jesus-prophet-reply-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='3fab03da-fa97-475c-bb32-d2d4c1f749ba',db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const plan=requireCurrentPlan(db,data,project),preflight=read(root+'/speaking-source-preflight/jesus-prophet-reply/preflight.json'),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='accepted'").get('22ae5575-c251-414e-a16e-0c150eb2be00',shot);
if(!frame?.result_asset_path||hash(join(data,'assets',String(frame.result_asset_path)))!=='7adcb9e2ab1ec78be9458116e4daa4d16b6857922bf78409fe928dc99ca4ecb3'||preflight.fullLineSamples!==431520||preflight.sampleRate!==48000||preflight.plan.sections.length!==3||hash(join(data,'assets',preflight.audio.path))!==preflight.sourceSha256||plan.id!==preflight.productionRunId)throw Error('Current exact frame/audio/source/plan required');
mkdirSync(folder,{recursive:true});
const crop={x:16,y:0,width:1248,height:702,evidenceRef:folder+'/framing-preflight.json'};
const evidence={at:new Date().toISOString(),status:'prepared_for_existing_stage_not_submitted',shotId:shot,productionRunId:plan.id,frame:frame.result_asset_path,frameSha256:'7adcb9e2ab1ec78be9458116e4daa4d16b6857922bf78409fe928dc99ca4ecb3',crop,reason:'Shot-specific accepted chest-up frame inspected, whole hair/face visible above modest margin. Symmetric16px native side trim and y0 retain top headroom;702height fits known1280x704 and1280x720 local canvases. Actual returned dimensions, captions, hair/mouth and full-line joins remain UNVERIFIED, never guaranteed by this proposed recipe.',completeAudioSamples:431520,sampleRate:48000,shortSections:3,nativeExpectedCalls:3,newVoiceCallsAuthorized:0,paidFallback:false,needsActualFullLineAV:true};writeFileSync(folder+'/framing-preflight.json',JSON.stringify(evidence,null,2));
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
 const prompt='One exact approved Papuan Jesus in the supplied synagogue speaking frame. Preserve face, shoulder-length curls, beard, body-authoritative center-front slit and cream/indigo cloth, room and soft daylight. Upright settled posture, near-frontal gaze just beside lens toward listeners. He delivers the COMPLETE supplied Hatam speech, following actual timing/pauses/emphasis, sober response to hometown rejection without a smile or theatrical extra gesture. Natural lips and jaw, restrained head/brow movement and breathing. Locked camera, full hair and mouth stay in frame, hands below face. After recorded speech ends lips rest; no invented delay or added words. No text, subtitles, captions, transcription, translations, titles, logos, music, new people, pointing or healing. Continue immediately from actual last retained speaker frame between sections, no pose/framing reset or progressive zoom.';
 try{const result=await runVoiceLipSync(project,[shot],{provider:'ltx',pictureCrops:{[shot]:crop},performancePrompts:{[shot]:prompt},generateLtxSection:section});writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result},null,2),{flag:'wx'});console.log(JSON.stringify(result));}finally{sharedLtxTransport().reset();db.close();}
}
