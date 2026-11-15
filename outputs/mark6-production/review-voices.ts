import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {generateJsonWithImagesMetered,GeminiResponseError,GEMINI_TEXT_MODEL} from '../../src/providers/gemini-text.js';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const root=resolve('outputs/mark6-production'),out=join(root,'voice-review'),read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
mkdirSync(out,{recursive:true});

const voices=read(join(root,'voices/execution.json')),manifest=read('outputs/mark6-preparation/voice-queue-v1/manifest.json');
const state:any=existsSync(join(out,'execution.json'))?read(join(out,'execution.json')):{status:'running',scope:'three batched audio-performance reviews; not new source alignment or native attestation',maximumRequests:30,maximumUsd:8,estimatedUsd:0,pendingUsd:0,calls:[]};
const save=()=>{writeFileSync(join(out,'execution.json'),JSON.stringify(state,null,2));const main=read(join(root,'execution.json'));main.geminiAv={requests:state.calls.length,estimatedUsd:state.estimatedUsd,pendingUsd:state.pendingUsd,journal:'voice-review/execution.json'};writeFileSync(join(root,'execution.json'),JSON.stringify(main,null,2));};
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const t={type:'string'},b={type:'boolean',nullable:true};
const schema={type:'object',properties:{summary:t,lines:{type:'array',items:{type:'object',properties:{id:t,allSourceWordsPreserved:b,addedSpeech:b,clippedSyllables:b,obviousDigitalArtifacts:b,performanceAppropriate:b,confidence:{type:'number'},heardDifference:t,performanceNotes:t,verdict:{type:'string',enum:['pass','needs_correction','uncertain']}},required:['id','allSourceWordsPreserved','addedSpeech','clippedSyllables','obviousDigitalArtifacts','performanceAppropriate','confidence','heardDifference','performanceNotes','verdict']}}},required:['summary','lines']};
for(let batch=0;batch<3;batch++){
 if(state.calls.some((c:any)=>c.id==='batch-'+(batch+1)&&c.status==='returned_reconciled'))continue;
 if(state.calls.some((c:any)=>c.id==='batch-'+(batch+1)))throw Error('Unreconciled existing batch; no retry');
 const jobs=voices.calls.slice(batch*5,batch*5+5),media:any[]=[],lines=[];
 for(const job of jobs){const entry=manifest.entries.find((e:any)=>e.id===job.id);if(job.status!=='returned_technical_checks_passed_performance_qc_pending')throw Error('Voice not technically verified');
  for(const [path,label,mime] of [[entry.inputPath,'ORIGINAL exact source input','audio/wav'],[job.outputPath,'CONVERTED candidate character performance','audio/mpeg']]){const data=readFileSync(path);if(hash(data)!==(label.startsWith('ORIGINAL')?entry.inputSha256:job.outputSha256))throw Error('Audio changed');media.push({mimeType:mime,data:data.toString('base64'),caption:job.id+' '+label});}
  lines.push({id:job.id,verse:entry.verse,attribution:entry.sourceAttribution,exactHatam:entry.exactHatam});
 }
 const prompt=`Listen separately to each ORIGINAL/CONVERTED pair. Attachments are overlapping alternatives, NOT sequential narrative. Review actual converted audio for source-word/syllable preservation, added speech, cut syllables, digital artifacts and appropriate performance. Printed text is reference, never evidence that a sound was heard. Do not infer meaning from unfamiliar Hatam or certify native pronunciation. Return uncertain where needed. Preserve original rhythm/speed and every word; a different character timbre is expected. Mature natural delivery; no artificial shouting or caricature. Peter/crowd are approved production representatives of collective speech. Do not change casting. No timestamp alignment requested. Give concrete audible evidence for EVERY line, including an observed complete opening and ending word where possible. pass means no detected defect; needs_correction means a specific defect is heard. All rows must appear once in source order.\n${JSON.stringify(lines)}`;
 const bytes=media.reduce((s,m)=>s+Buffer.byteLength(m.data,'base64'),0);if(bytes>24000000||state.calls.length>=30||state.estimatedUsd+.15>8||new Date()>new Date('2026-12-31'))throw Error('Review budget bound exceeded');
 const call:any={id:'batch-'+(batch+1),status:'submission_started',model:GEMINI_TEXT_MODEL,reservationUsd:.15,media:media.map(m=>({caption:m.caption,sha256:hash(Buffer.from(m.data,'base64'))}))};
 state.calls.push(call);state.pendingUsd=.15;writeFileSync(join(out,call.id+'-request.json'),JSON.stringify({prompt,schema,maxOutputTokens:6144,thinkingLevel:'low'},null,2));save();
 const valid=(r:any)=>{const u=r.usage,cost=Math.round(u.promptTokenCount*.75+(u.candidatesTokenCount+u.thoughtsTokenCount)*3.75)/1e6;return Number.isSafeInteger(u.promptTokenCount)&&u.promptTokenCount>0&&Number.isSafeInteger(u.totalTokenCount)&&u.totalTokenCount>0&&cost===r.costUsd&&cost<=.15;};
 try{const response=await generateJsonWithImagesMetered<any>(prompt,media,schema,GEMINI_TEXT_MODEL,{maxOutputTokens:6144,thinkingLevel:'low'});Object.assign(call,response);if(!valid(response))throw Error('Unknown/out-of-bound usage');state.estimatedUsd=+(state.estimatedUsd+response.costUsd).toFixed(6);state.pendingUsd=0;call.status='returned';save();
  if(response.result.lines.length!==jobs.length||response.result.lines.some((x:any,i:number)=>x.id!==jobs[i].id))throw Error('Unexpected review rows');console.log(JSON.stringify({id:call.id,costUsd:response.costUsd,verdicts:response.result.lines.map((x:any)=>[x.id,x.verdict])}));
 }catch(e){if(e instanceof GeminiResponseError&&valid(e.receipt)){Object.assign(call,{receipt:e.receipt});state.estimatedUsd=+(state.estimatedUsd+e.receipt.costUsd).toFixed(6);state.pendingUsd=0;}call.status='held_no_retry';call.error=(e as Error).message.split(process.env.GEMINI_API_KEY!).join('[redacted]');state.status='held';save();throw Error(call.error);}
}
state.status='three_audio_reviews_returned_owner_decisions_pending';save();
