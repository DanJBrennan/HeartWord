import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {generateJsonWithImagesMetered,GeminiResponseError} from "../src/providers/gemini-text.js";
const root=resolve("outputs/mark6-preparation"),out=join(root,"alignment-gap-listening");
const read=(p:string)=>JSON.parse(readFileSync(join(root,p),"utf8")),sha=(b:Buffer|string)=>createHash("sha256").update(b).digest("hex");
const packet=read("source-packet-v3/source-packet.json"),initial=read("alignment-preflight/execution.json"),refine=read("alignment-boundary-review/execution.json"),gaps=read("alignment-preflight/unmatched-source-words.json"),local=read("alignment-preflight/alignment-local-refined.json");
if(existsSync(out)||initial.status!=="completed_provisional"||refine.status!=="completed_provisional"||sha(readFileSync(packet.input.audio))!==packet.input.sourceHashes.audio||initial.calls.length+refine.calls.length+17>176)throw new Error("Retained run or changed inputs; no retry.");
for(const [key,path] of [["hatam",packet.input.hatam],["reference",packet.input.english]])if(sha(readFileSync(path))!==packet.input.sourceHashes[key])throw new Error("Pinned text changed");
(await import("dotenv")).config({path:"C:/Users/danbr/OneDrive/Documents/HeartWord/.env"});if(!process.env.GEMINI_API_KEY)throw new Error("No credential");
if(new Date()>=new Date("2027-01-01"))throw new Error("Pinned pricing expired");
const schema={type:"object",properties:{status:{type:"string",enum:["present","partial","absent","uncertain"]},heardText:{type:"string"},targetStartSec:{type:"number",nullable:true},targetEndSec:{type:"number",nullable:true},evidence:{type:"string"},limitations:{type:"string"}},required:["status","heardText","targetStartSec","targetEndSec","evidence","limitations"]};
const tasks:any[]=gaps.runs.map((g:any,i:number)=>{const center=(g.precedingMatchedInterval.endMs+g.followingMatchedInterval.startMs)/2;return{id:`gap-${i+1}`,startMs:Math.max(0,center-7000),endMs:Math.min(packet.durationMs,center+7000),target:g.text,verseStart:g.verseStart,verseEnd:g.verseEnd};});
for(const [i,s] of local.result.segments.filter((s:any)=>s.status==="non_scripture").entries())tasks.push({id:`classification-${i+1}`,startMs:s.startMs,endMs:s.endMs,target:null});
if(tasks.length!==17)throw new Error("Expected the reviewed twelve gaps and five classifications");
mkdirSync(out,{recursive:true});
const state:any={status:"running",maximumUsd:10,priorEstimatedUsd:initial.spentEstimatedUsd+refine.estimatedUsd,priorUnreportedUpperBoundUsd:initial.uncertainUpperBoundUsd,estimatedUsd:0,pendingUpperBoundUsd:0,parentHashes:{initial:sha(readFileSync(join(root,"alignment-preflight/execution.json"))),refine:sha(readFileSync(join(root,"alignment-boundary-review/execution.json")))},calls:[]};
const save=()=>writeFileSync(join(out,"execution.json"),JSON.stringify(state,null,2));save();
for(const task of tasks){
 const reference=task.target?packet.verses.filter((v:any)=>v.verse>=task.verseStart-1&&v.verse<=task.verseEnd+1).map((v:any)=>`[v${v.verse}] ${v.text}`).join("\n"):"No target text. Classify the actual sounds without inventing words.";
 const prompt=`Listen to this ORIGINAL Hatam Mark 6 recording clip. This is source alignment evidence only, not translation or human/native verification. Reference is a lookup, not proof that words are audible.\nReference:\n${reference}\n${task.target?`Target fragment: ${task.target}\nDetermine whether that exact fragment is heard inside the clip (present, partial, absent or uncertain). If present/partial, give its measured local start/end in seconds from clip start. Do not fill missing words from memory/reference. heardText contains ONLY audible supplied words, not whole unheard verses.`:"The earlier model called this non-Scripture. Listen independently: is this actual speech, a breath, noise or silence? Use present for clearly audible speech, absent for non-speech, uncertain when unclear. Never invent a Hatam transcript."}\nExplain audible evidence and limitations. Timing is provisional and must not authorize a cut. Null times when you cannot locate the target/speech.`;
 const audio=execFileSync("ffmpeg",["-v","error","-ss",String(task.startMs/1000),"-t",String((task.endMs-task.startMs)/1000),"-i",packet.input.audio,"-f","wav","-ac","1","-ar","16000","pipe:1"],{windowsHide:true});
 if(audio.length>500000||Buffer.byteLength(prompt)+Buffer.byteLength(JSON.stringify(schema))>20000||state.priorEstimatedUsd+state.priorUnreportedUpperBoundUsd+state.estimatedUsd+.1>10)throw new Error("Bounded request or cumulative budget exceeded");
 const call:any={...task,model:"gemini-3.1-pro-preview",audioSha256:sha(audio),status:"submission_started",upperBoundUsd:.1};
 writeFileSync(join(out,`${task.id}.wav`),audio,{flag:"wx"});writeFileSync(join(out,`${task.id}-request.json`),JSON.stringify({prompt,schema,model:call.model,maxOutputTokens:4096,thinkingLevel:"low"}),{flag:"wx"});state.calls.push(call);state.pendingUpperBoundUsd=.1;save();
 try{
  const r=await generateJsonWithImagesMetered(prompt,[{mimeType:"audio/wav",data:audio.toString("base64")}],schema,call.model,{maxOutputTokens:4096,thinkingLevel:"low"});const u=r.usage;
  if(![u.promptTokenCount,u.candidatesTokenCount,u.thoughtsTokenCount,u.totalTokenCount].every(n=>Number.isSafeInteger(n)&&n>=0)||u.promptTokenCount<=0||u.promptTokenCount>25000||u.totalTokenCount<u.promptTokenCount+u.candidatesTokenCount+u.thoughtsTokenCount||!Number.isFinite(r.costUsd)||r.costUsd<0||r.costUsd>.1)throw new Error("Usage unknown or exceeds reviewed bound");
  Object.assign(call,{status:"completed",usage:u,estimatedCostUsd:r.costUsd,result:r.result});state.estimatedUsd=Math.round((state.estimatedUsd+r.costUsd)*1e6)/1e6;state.pendingUpperBoundUsd=0;save();
 }catch(error){call.status="held_reconcile_before_retry";call.error=(error as Error).message.split(process.env.GEMINI_API_KEY!).join("[redacted]");if(error instanceof GeminiResponseError)call.reportedErrorReceipt=error.receipt;state.status="held";save();throw new Error(call.error);}
}
state.status="completed_provisional";save();console.log(JSON.stringify({calls:state.calls.length,totalEstimatedUsd:state.priorEstimatedUsd+state.estimatedUsd,unreportedUpperBoundUsd:state.priorUnreportedUpperBoundUsd}));
