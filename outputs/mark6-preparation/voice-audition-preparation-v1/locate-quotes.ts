// Four alignment-only requests within the existing $10 authorization.
import{createHash}from'node:crypto';import{readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';import{join,resolve}from'node:path';import{execFileSync}from'node:child_process';
import{generateJsonWithImagesMetered,GeminiResponseError}from'../../../src/providers/gemini-text.js';
import{detectSilences}from'../../../src/pipeline/ingestion/detect-silences.js';
const base=resolve('outputs/mark6-preparation'),root=join(base,'voice-audition-preparation-v1'),out=join(root,'quote-location');
if(existsSync(out))throw Error('Retained localization exists; no replay');
const read=(p:string)=>JSON.parse(readFileSync(join(base,p),'utf8')),packet=read('source-packet-v3/source-packet.json'),prior=read('continuation-status.json');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
if(!prior.noRequestsInFlight||prior.totalGeminiAlignmentRequests!==161||prior.maximumExposureUsd!==.968293)throw Error('Prior state unresolved');
for(const[k,p]of[['hatam',packet.input.hatam],['reference',packet.input.english],['audio',packet.input.audio]])if(sha(readFileSync(p))!==packet.input.sourceHashes[k])throw Error('Pinned input changed');
if(new Date()>=new Date('2027-01-01'))throw Error('Pinned rate verification expired');
const inputs=[{id:'herod',verse:22,startMs:331000,endMs:352000,quoteIndex:0},{id:'john-the-baptist',verse:18,startMs:260000,endMs:274000,quoteIndex:0},{id:'herodias',verse:24,startMs:369000,endMs:383000,quoteIndex:1},{id:'herodias-daughter',verse:25,startMs:384000,endMs:399000,quoteIndex:0}];
const tasks=inputs.map(t=>{const text=packet.verses.find((v:any)=>v.verse===t.verse).text;const quotes=[...text.matchAll(/“([^”]+)”/g)].map(m=>m[1]);if(!quotes[t.quoteIndex])throw Error('Canonical quote missing');return{...t,quote:quotes[t.quoteIndex]};});
const schema={type:'object',properties:{status:{type:'string',enum:['located','clipped','uncertain']},startSec:{type:'number',nullable:true},endSec:{type:'number',nullable:true},heardText:{type:'string'},precedingWords:{type:'string'},followingWords:{type:'string'},evidence:{type:'string'},limitations:{type:'string'}},required:['status','startSec','endSec','heardText','precedingWords','followingWords','evidence','limitations']};
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});if(!process.env.GEMINI_API_KEY)throw Error('No credential');mkdirSync(out);
const state:any={status:'running',maximumUsd:10,maximumRequests:4,cumulativeAlignmentRequestsBeforeThis:161,priorEstimatedUsd:prior.alignmentEstimatedUsd,priorUnreportedUpperBoundUsd:.03,estimatedUsd:0,pendingUpperBoundUsd:0,calls:[],sourceHashes:packet.input.sourceHashes,fullProductionHold:true};const save=()=>writeFileSync(join(out,'execution.json'),JSON.stringify(state,null,2)+'\n');save();
const cuts=(a:number,b:number)=>execFileSync('ffmpeg',['-v','error','-nostdin','-i',packet.input.audio,'-af',`atrim=start_sample=${Math.round(a*24)}:end_sample=${Math.round(b*24)},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le','-f','wav','pipe:1'],{windowsHide:true,maxBuffer:3*1024*1024});
for(const t of tasks){
 const audio=cuts(t.startMs,t.endMs),context=join(out,t.id+'-context.wav');writeFileSync(context,audio,{flag:'wx'});
 const reference=packet.verses.filter((v:any)=>v.verse>=t.verse-1&&v.verse<=t.verse+1).map((v:any)=>`[verse ${v.verse}] ${v.text}`).join('\n');
 const prompt=`Locate only this exact DIRECT SPEECH QUOTE in the ORIGINAL Hatam Mark 6 recording. Native source stereo 24kHz; all times LOCAL seconds from zero. Target: ${t.quote}\nCanonical reference lookup, not proof of audibility:\n${reference}\nIdentify its actual first and last syllables, and supplied words immediately before/after. Exclude narrator attribution, introductions and following narration. Listen, do not time by reading speed or infer unheard words. Return clipped if a syllable lies outside this ${(t.endMs-t.startMs)/1000}s clip, uncertain/null times if not locatable. heardText must contain ONLY audible supplied target words. This is an alignment proposal, not native verification or production source approval.`;
 if(audio.length>2500000||Buffer.byteLength(prompt)+Buffer.byteLength(JSON.stringify(schema))>20000||state.calls.length>=4||161+state.calls.length+1>176||73+state.calls.length+1>88||state.priorEstimatedUsd+.03+state.estimatedUsd+.1>10)throw Error('Pre-submission bounds');
 const c:any={...t,status:'submission_started',model:'gemini-3.1-pro-preview',audioSha256:sha(audio),upperBoundUsd:.1};state.calls.push(c);state.pendingUpperBoundUsd=.1;writeFileSync(join(out,t.id+'-request.json'),JSON.stringify({prompt,schema,model:c.model,maxOutputTokens:4096,thinkingLevel:'low'},null,2));save();
 try{const r=await generateJsonWithImagesMetered<any>(prompt,[{mimeType:'audio/wav',data:audio.toString('base64')}],schema,c.model,{maxOutputTokens:4096,thinkingLevel:'low'}),u=r.usage;
  if(![u.promptTokenCount,u.candidatesTokenCount,u.thoughtsTokenCount,u.totalTokenCount].every(n=>Number.isSafeInteger(n)&&n>=0)||u.promptTokenCount<=0||u.promptTokenCount>25000||u.totalTokenCount<u.promptTokenCount+u.candidatesTokenCount+u.thoughtsTokenCount||!Number.isFinite(r.costUsd)||r.costUsd<0||r.costUsd>.1)throw Error('Usage unknown/outside bound');
  Object.assign(c,{status:'completed',usage:u,estimatedCostUsd:r.costUsd,result:r.result});state.estimatedUsd=Math.round((state.estimatedUsd+r.costUsd)*1e6)/1e6;state.pendingUpperBoundUsd=0;save();console.log(JSON.stringify({id:t.id,status:r.result.status,start:r.result.startSec,end:r.result.endSec}));
 }catch(error){c.status='held_reconcile_before_retry';c.error=(error as Error).message.split(process.env.GEMINI_API_KEY!).join('[redacted]');if(error instanceof GeminiResponseError)c.receipt=error.receipt;state.status='held';save();throw Error(c.error);}
}
const prepared=[];
for(const c of state.calls){const r=c.result,len=(c.endMs-c.startMs)/1000;if(r.status!=='located'||typeof r.startSec!=='number'||typeof r.endSec!=='number'||!(r.startSec>=0&&r.endSec>r.startSec&&r.endSec<=len))throw Error('Quote needs reconciliation');
 const wav=join(out,c.id+'-context.wav'),quiet=detectSilences(wav,{noiseFloorDb:-30,minDurationSec:.04}).map(g=>({startMs:c.startMs+g.startMs,endMs:c.startMs+g.endMs}));
 const first=c.startMs+r.startSec*1000,last=c.startMs+r.endSec*1000;
 const near=(point:number,head:boolean)=>quiet.map(g=>({...g,distance:point<g.startMs?g.startMs-point:point>g.endMs?point-g.endMs:0})).filter(g=>g.distance<450&&(head?g.startMs<point+100:g.endMs>point-100)).sort((a,b)=>a.distance-b.distance)[0];
 const head=near(first,true),tail=near(last,false);const startMs=head?(head.startMs+head.endMs)/2:first-100,endMs=tail?(tail.startMs+tail.endMs)/2:last+100;
 prepared.push({id:c.id,verse:c.verse,quote:c.quote,startMs:Math.round(startMs*24)/24,endMs:Math.round(endMs*24)/24,firstSyllableModelProposalMs:first,lastSyllableModelProposalMs:last,headQuiet:head??null,tailQuiet:tail??null,status:'candidate_pending_independent_native_boundary_audit'});
}
state.status='completed_provisional';save();writeFileSync(join(root,'candidate-quotes.json'),JSON.stringify({sourceHashes:packet.input.sourceHashes,tests:prepared,fullProductionHold:true},null,2)+'\n',{flag:'wx'});
