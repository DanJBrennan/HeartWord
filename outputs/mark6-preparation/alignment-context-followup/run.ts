// One bounded alignment-only contextual follow-up; never edits source or production.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {generateJsonWithImagesMetered,GeminiResponseError} from '../../../src/providers/gemini-text.js';
const base=resolve('outputs/mark6-preparation'),out=join(base,'alignment-context-followup');
const read=(p:string)=>JSON.parse(readFileSync(join(base,p),'utf8'));
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(p:string,v:unknown)=>writeFileSync(join(out,p),JSON.stringify(v,null,2)+'\n');
const packet=read('source-packet-v3/source-packet.json'),prior=read('continuation-status.json'),alignment=read('alignment-current-preparation.json'),gaps=read('alignment-preflight/unmatched-source-words.json');
if(existsSync(join(out,'execution.json'))||!prior.noRequestsInFlight||prior.totalGeminiAlignmentRequests!==144||prior.alignmentEstimatedUsd!==.792687||prior.maximumExposureUsd!==.822687)throw Error('Existing attempt or unreconciled prior state; no retry');
for(const [k,p] of [['hatam',packet.input.hatam],['reference',packet.input.english],['audio',packet.input.audio]])if(sha(p)!==packet.input.sourceHashes[k])throw Error('Pinned source changed');
if(new Date()>=new Date('2027-01-01'))throw Error('Pinned rate verification expired');
const tasks=alignment.listeningChecks.map((c:any)=>{
 const startMs=Math.max(0,c.clipStartMs-5000),endMs=Math.min(packet.durationMs,c.clipEndMs+5000);
 let verses:number[]=[];
 if(c.id.startsWith('gap-')){const g=gaps.runs[Number(c.id.slice(4))-1];for(let v=Math.max(1,g.verseStart-1);v<=Math.min(56,g.verseEnd+1);v++)verses.push(v);}
 else for(const s of alignment.result.segments.filter((s:any)=>s.sourceKind==='scripture'&&s.endMs>=startMs&&s.startMs<=endMs)){
  const range=String(s.verseRef).replaceAll('v','').split('-').map(Number);for(let v=Math.max(1,range[0]-1);v<=Math.min(56,range[range.length-1]+1);v++)verses.push(v);
 }
 verses=[...new Set(verses)].sort((a,b)=>a-b);if(!verses.length||endMs-startMs>25000)throw Error('Unbounded task');
 return{id:c.id,target:c.target,startMs,endMs,verses,priorWarnings:c.warnings};
});
if(tasks.length!==17||144+tasks.length>176||56+tasks.length>88)throw Error('Original call ceiling exceeded');
const schema={type:'object',properties:{status:{type:'string',enum:['located','partial','uncertain','not_heard']},targetStartSec:{type:'number',nullable:true},targetEndSec:{type:'number',nullable:true},matches:{type:'array',items:{type:'object',properties:{verse:{type:'integer'},exactSourceFragment:{type:'string'},startSec:{type:'number'},endSec:{type:'number'},evidence:{type:'string'}},required:['verse','exactSourceFragment','startSec','endSec','evidence']}},evidence:{type:'string'},limitations:{type:'string'}},required:['status','targetStartSec','targetEndSec','matches','evidence','limitations']};
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});if(!process.env.GEMINI_API_KEY)throw Error('Missing credential');
const state:any={status:'running',purpose:'Alignment-only wider-context source attribution; not source approval, native verification, cutting authority or a new transcript.',priorEstimatedUsd:prior.alignmentEstimatedUsd,priorUnreportedUpperBoundUsd:.03,estimatedUsd:0,pendingUpperBoundUsd:0,maximumUsd:10,maximumNewRequests:17,priorRequests:144,sourceHashes:packet.input.sourceHashes,calls:[],fullProductionHold:true};
const journal=()=>save('execution.json',state);journal();
const normalize=(s:string)=>s.toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
for(const task of tasks){
 const reference=packet.verses.filter((v:any)=>task.verses.includes(v.verse)).map((v:any)=>`[verse ${v.verse}] ${v.text}`).join('\n');
 const prompt=`Listen to the ORIGINAL Hatam Mark 6 audio, a wider-context follow-up for source alignment only. Clip source clock: ${task.startMs/1000} to ${task.endMs/1000} seconds; ALL reply times must be LOCAL seconds from zero. Reference is a candidate lookup, not evidence of audibility.\n${reference}\n${task.target?`Locate this exact source target in context: ${task.target}. Distinguish repeated words using their audible surrounding phrase. If the particular occurrence cannot be established, return uncertain and null target times.`:'An earlier narrow interval contained speech but could not be assigned to canonical words. Identify ONLY clearly heard exact fragments from the supplied verses. Do not produce a phonetic or invented transcript.'}\nReturn short exactSourceFragment matches and verse numbers only from supplied source text, with local measured start/end and audible context evidence. A fragment must lie wholly in the clip and the named verse. Do not complete unheard words from text. Use partial or uncertain with null target times when appropriate. Do not stretch timing to clip edges; explicit limitations are preferable to a guess. Keep fewer than six matches. This is not native attestation, translation, source approval or authority to omit/cut speech.`;
 const audio=execFileSync('ffmpeg',['-v','error','-nostdin','-i',packet.input.audio,'-af',`atrim=start=${task.startMs/1000}:end=${task.endMs/1000},asetpts=PTS-STARTPTS`,'-f','wav','-ac','1','-ar','16000','pipe:1'],{windowsHide:true});
 if(audio.length>820000||Buffer.byteLength(prompt)+Buffer.byteLength(JSON.stringify(schema))>20000||state.priorEstimatedUsd+state.priorUnreportedUpperBoundUsd+state.estimatedUsd+.1>10)throw Error('Request/budget bound');
 writeFileSync(join(out,task.id+'.wav'),audio,{flag:'wx'});save(task.id+'-request.json',{prompt,schema,model:'gemini-3.1-pro-preview',maxOutputTokens:4096,thinkingLevel:'low'});
 const c:any={...task,model:'gemini-3.1-pro-preview',audioSha256:createHash('sha256').update(audio).digest('hex'),status:'submission_started',upperBoundUsd:.1};state.calls.push(c);state.pendingUpperBoundUsd=.1;journal();
 try{
  const r=await generateJsonWithImagesMetered<any>(prompt,[{mimeType:'audio/wav',data:audio.toString('base64')}],schema,c.model,{maxOutputTokens:4096,thinkingLevel:'low'}),u=r.usage;
  if(![u.promptTokenCount,u.candidatesTokenCount,u.thoughtsTokenCount,u.totalTokenCount].every(n=>Number.isSafeInteger(n)&&n>=0)||u.promptTokenCount<=0||u.promptTokenCount>25000||u.totalTokenCount<u.promptTokenCount+u.candidatesTokenCount+u.thoughtsTokenCount||!Number.isFinite(r.costUsd)||r.costUsd<0||r.costUsd>.1)throw Error('Usage unknown or above bound');
  const len=(task.endMs-task.startMs)/1000,valid=(s:any,e:any)=>typeof s==='number'&&typeof e==='number'&&Number.isFinite(s)&&Number.isFinite(e)&&s>=0&&s<e&&e<=len;
  const checked=(r.result.matches??[]).map((m:any)=>{const v=packet.verses.find((v:any)=>v.verse===m.verse);const words=normalize(m.exactSourceFragment??'');const canonical=!!v&&task.verses.includes(m.verse)&&!!words&&(' '+normalize(v.text)+' ').includes(' '+words+' ');return{...m,canonicalFragment:canonical,timingWithinClip:valid(m.startSec,m.endSec),provisionalOnly:true};});
  Object.assign(c,{status:'completed',usage:u,estimatedCostUsd:r.costUsd,result:r.result,checkedMatches:checked,targetTimingValid:valid(r.result.targetStartSec,r.result.targetEndSec),approval:'not_approved'});state.estimatedUsd=Math.round((state.estimatedUsd+r.costUsd)*1e6)/1e6;state.pendingUpperBoundUsd=0;journal();console.log(JSON.stringify({task:c.id,status:r.result.status,checkedMatches:checked.length,cumulativeEstimate:state.priorEstimatedUsd+state.estimatedUsd}));
 }catch(error){c.status='held_reconcile_before_retry';c.error=(error as Error).message.split(process.env.GEMINI_API_KEY!).join('[redacted]');if(error instanceof GeminiResponseError)c.receipt=error.receipt;state.status='held';journal();throw Error(c.error);}
}
state.status='completed_provisional';journal();
