// Explicitly authorized, one take per role, <=600 existing credits. No production.
import{createHash}from'node:crypto';import{existsSync,readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,join}from'node:path';import{execFileSync}from'node:child_process';import{DatabaseSync}from'node:sqlite';
import{reVoiceAudio}from'../../../src/providers/elevenlabs.js';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const root=resolve('outputs/mark6-preparation/voice-audition-preparation-v1'),out=join(root,'auditions');
const read=(p:string)=>JSON.parse(readFileSync(join(root,p),'utf8')),plan=read('audition-plan.json'),auth=read('authorization.json');
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(existsSync(out))throw Error('Retained generation directory exists; reconcile, no replay');
if(auth.status!=='explicitly_authorized'||auth.creditCap!==600||!auth.existingSubscriptionCreditsOnly||!auth.fullProductionHold||plan.auditions.length!==4||plan.proposedCreditCap!==600)throw Error('Scope/authorization mismatch');
const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('No credential');
const db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
async function api(path:string){const r=await fetch('https://api.elevenlabs.io'+path,{headers:{'xi-api-key':key},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Read-only preflight ${r.status} ${path}`);return r.json();}
function assertBindings(job?:any){
 const packet=JSON.parse(readFileSync(resolve('outputs/mark6-preparation/source-packet-v3/source-packet.json'),'utf8'));
 for(const[k,p]of[['hatam',packet.input.hatam],['reference',packet.input.english],['audio',packet.input.audio]])if(hash(p)!==plan.sourceHashes[k])throw Error('Source hash changed');
 for(const j of job?[job]:plan.auditions){const row=db.prepare('SELECT status,voice_provider,voice_id FROM character_versions WHERE id=? AND character_id=?').get(j.versionId,j.characterId);if(row?.status!=='approved'||row.voice_provider!=='elevenlabs'||row.voice_id!==j.voiceId||hash(j.sourceClip)!==j.sourceClipSha256||hash(j.portrait)!==j.portraitSha256)throw Error('Voice/clip/canon binding changed');}
 const project=db.prepare("SELECT count(*) n FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=6").get();if(project?.n!==0)throw Error('Unexpected Mark 6 production workspace; inspect before spending');
}
assertBindings();
const preflightRequests=['/v1/user/subscription','/v1/models',...plan.auditions.map((j:any)=>'/v1/voices/'+j.voiceId)];
const preflightResults=await Promise.allSettled(preflightRequests.map(api));
const failures=preflightResults.map((r,i)=>r.status==='rejected'?{path:preflightRequests[i],error:String(r.reason).split(key).join('[redacted]')}:null).filter(Boolean);if(failures.length)throw Error(JSON.stringify(failures));
const values=preflightResults.map((r:any)=>r.value),subscription=values[0],model=values[1].find((m:any)=>m.model_id==='eleven_multilingual_sts_v2');
if(subscription.status!=='active'||subscription.character_limit-subscription.character_count<600||subscription.max_credit_limit_extension!==0||!model?.can_do_voice_conversion||model.model_rates?.character_cost_multiplier!==1||model.model_rates?.cost_discount_multiplier!==1)throw Error('Credit headroom/overage/model/rate changed');
for(let i=0;i<plan.auditions.length;i++){const v=values[i+2];if(v.voice_id!==plan.auditions[i].voiceId||(v.sharing&&v.sharing.rate!==1))throw Error('Selected voice/rate changed');}
mkdirSync(out);
const state:any={status:'running',authorizationSha256:hash(join(root,'authorization.json')),planSha256:hash(join(root,'audition-plan.json')),creditCap:600,maximumRequests:4,spentReportedCredits:0,pendingUpperBoundCredits:0,subscriptionBefore:{used:subscription.character_count,limit:subscription.character_limit,remaining:subscription.character_limit-subscription.character_count,maxCreditLimitExtension:subscription.max_credit_limit_extension},calls:[],fullProductionHold:true,automaticRetries:0,voiceOrModelFallback:false,additionalCashAuthorizedUsd:0};
const save=()=>writeFileSync(join(out,'execution.json'),JSON.stringify(state,null,2)+'\n');save();
try{
 for(const job of plan.auditions){
  assertBindings(job);
  if(state.calls.length>=4||state.calls.some((c:any)=>c.id===job.id)||state.spentReportedCredits+state.pendingUpperBoundCredits+job.perRequestCreditReservation>600)throw Error('Per-role or cumulative reservation ceiling');
  const current=await api('/v1/user/subscription');if(current.status!=='active'||current.max_credit_limit_extension!==0||current.character_limit-current.character_count<600-state.spentReportedCredits)throw Error('Included credit/overage preflight changed');
  const output=join(out,job.id+'.mp3'),receipt=join(out,job.id+'.result.json');if(existsSync(output)||existsSync(receipt))throw Error('Retained output; no regeneration');
  const call:any={id:job.id,character:job.character,voiceName:job.voiceName,voiceId:job.voiceId,versionId:job.versionId,sourceClipSha256:job.sourceClipSha256,creditReservation:job.perRequestCreditReservation,startedAt:new Date().toISOString(),status:'submission_started',provider:'elevenlabs',model:'eleven_multilingual_sts_v2'};
  state.calls.push(call);state.pendingUpperBoundCredits=job.perRequestCreditReservation;save();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const response=await Promise.race([reVoiceAudio(job.voiceId,job.sourceClip,{voiceSettings:job.voiceSettings}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Voice request exceeded three-minute observation deadline; reconcile before any retry')),180000);timer.unref();})]).finally(()=>{if(timer)clearTimeout(timer);});
  writeFileSync(output,response.audioBuffer,{flag:'wx'});
  Object.assign(call,{status:'returned_usage_verification_pending',outputPath:output,outputSha256:hash(output),usage:response.usage,requestSettings:response.requestSettings,finishedAt:new Date().toISOString()});save();
  const rawUsage=response.usage?.characterCost;let credits=rawUsage!==null&&rawUsage!==undefined&&rawUsage!==''?Number(rawUsage):NaN;
  if(!Number.isFinite(credits)&&response.usage?.historyItemId){const history=await api('/v1/history/'+encodeURIComponent(response.usage.historyItemId));if(history.voice_id!==job.voiceId)throw Error('History voice mismatch');call.historyUsage={voiceId:history.voice_id,characterCountChangeFrom:history.character_count_change_from,characterCountChangeTo:history.character_count_change_to};credits=Number(history.character_count_change_to)-Number(history.character_count_change_from);call.usageReconciledFromHistory=true;save();}
  if(!Number.isFinite(credits)||credits<0||credits>job.perRequestCreditReservation||state.spentReportedCredits+credits>600)throw Error('Reported credit cost unknown/outside reservation; stop before next request');
  call.reportedCredits=credits;state.spentReportedCredits+=credits;state.pendingUpperBoundCredits=0;save();
  const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8',windowsHide:true}));const a=streams.streams.filter((s:any)=>s.codec_type==='audio');if(a.length!==1||streams.streams.some((s:any)=>s.codec_type==='video'))throw Error('Unexpected returned media');
  execFileSync('ffmpeg',['-v','error','-nostdin','-i',output,'-f','null','-'],{windowsHide:true});
  const decoded=execFileSync('ffmpeg',['-v','error','-nostdin','-i',output,'-f','s16le','-acodec','pcm_s16le','-'],{windowsHide:true,maxBuffer:5*1024*1024});const channels=Number(a[0].channels),rate=Number(a[0].sample_rate);if(!channels||!rate||decoded.length%(channels*2))throw Error('Returned audio sample geometry');
  const samples=decoded.length/(channels*2),duration=samples/rate;let sum=0,peak=0;for(let i=0;i<decoded.length;i+=2){const n=decoded.readInt16LE(i)/32768;sum+=n*n;peak=Math.max(peak,Math.abs(n));}const rms=Math.sqrt(sum/(decoded.length/2));if(duration<=0||rms<.0001)throw Error('Empty or effectively silent candidate');
  Object.assign(call,{status:'complete_candidate_held_for_producer_review',decodedSamples:samples,sampleRate:rate,channels,durationSeconds:duration,sourceDurationSeconds:job.durationSeconds,durationDeltaSeconds:duration-job.durationSeconds,within100ms:Math.abs(duration-job.durationSeconds)<=.1,rmsDbfs:20*Math.log10(rms),peakDbfs:20*Math.log10(peak),localAudioTrimmingOrRateChange:false});writeFileSync(receipt,JSON.stringify(call,null,2)+'\n',{flag:'wx'});save();console.log(JSON.stringify({character:call.character,status:call.status,reportedCredits:credits,durationSeconds:duration,durationDeltaSeconds:call.durationDeltaSeconds,cumulativeCredits:state.spentReportedCredits}));
 }
 assertBindings();const after=await api('/v1/user/subscription');state.subscriptionAfter={used:after.character_count,limit:after.character_limit,remaining:after.character_limit-after.character_count,maxCreditLimitExtension:after.max_credit_limit_extension};state.accountUsageDelta=after.character_count-state.subscriptionBefore.used;state.accountDeltaMatchesReportedUsage=state.accountUsageDelta===state.spentReportedCredits;state.status='four_auditions_complete_held_for_listening_review';state.noRequestsInFlight=true;save();
}catch(error){state.status='held_reconcile_no_retry';state.error=(error as Error).message.split(key).join('[redacted]');state.requestsInFlight='none locally awaited; any timed-out or failed submission remains uncertain until reconciled';save();console.error(state.error);process.exitCode=1;}
finally{db.close();}
