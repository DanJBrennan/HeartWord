/** Five targeted, already-authorized strong fills; retained parent costs count against the same $10 cap. */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {generateJsonWithImagesMetered,GeminiResponseError} from "../src/providers/gemini-text.js";
import {ALIGNMENT_IDENTIFICATION_SCHEMA,alignmentIdentificationPrompt} from "../src/pipeline/ingestion/gemini-alignment.js";
const [packetArg,parentArg,localArg,outputArg,envArg]=process.argv.slice(2);
if(!packetArg||!parentArg||!localArg||!outputArg||!envArg)throw new Error("Supply pinned packet, parent execution, local result, new output, env file.");
const packet=JSON.parse(readFileSync(packetArg,"utf8")),parent=JSON.parse(readFileSync(parentArg,"utf8")),local=JSON.parse(readFileSync(localArg,"utf8"));
const sha=(b:Buffer|string)=>createHash("sha256").update(b).digest("hex"),root=resolve(outputArg);
if(existsSync(root)||parent.status!=="completed_provisional"||parent.approvedMaximumUsd!==10||parent.calls.length+5>176||parent.calls.filter((c:any)=>c.model==="gemini-3.1-pro-preview").length+5>88||sha(readFileSync(packet.input.audio))!==packet.input.sourceHashes.audio||local.journalSha256!==sha(readFileSync(parentArg)))throw new Error("Pinned refinement inputs/bounds changed, or retained work exists. No retry.");
if(new Date()>=new Date("2027-01-01"))throw new Error("Verify pricing before paid execution.");
(await import("dotenv")).config({path:resolve(envArg)});if(!process.env.GEMINI_API_KEY)throw new Error("No credential.");
const selected=[{index:2,verses:[2]},{index:31,verses:[17]},{index:40,verses:[21,22]},{index:58,verses:[34]},{index:59,verses:[34,35]}];
mkdirSync(root,{recursive:true});
const state:any={status:"running",approvedMaximumUsd:10,parentJournalSha256:sha(readFileSync(parentArg)),parentEstimatedUsd:parent.spentEstimatedUsd,parentUnreportedUpperBoundUsd:parent.uncertainUpperBoundUsd,estimatedUsd:0,pendingUpperBoundUsd:0,calls:[]};
const save=()=>writeFileSync(join(root,"execution.json"),JSON.stringify(state,null,2));save();
for(const task of selected){
 const prior=parent.calls[task.index],span=local.result.segments[task.index];
 if(!prior||prior.model!=="gemini-3.6-flash"||!span||sha(readFileSync(prior.audioPath))!==prior.audioSha256)throw new Error("Retained audio identity changed.");
 const reference=packet.verses.filter((v:any)=>task.verses.includes(v.verse)).map((v:any)=>`[v${v.verse}] ${v.text}`).join("\n");
 const prompt=alignmentIdentificationPrompt(reference)+"\nThis is a targeted boundary check, not a request to recite the reference. Listen to the actual clip's beginning and ending. Return only the contiguous supplied words actually heard. Some supplied words are deliberately before or after this clip. Never copy a complete verse when only a fragment is heard. If the clip cannot be identified, report false. Do not insert [vN] labels.";
 const audio=readFileSync(prior.audioPath),bound=.1;
 if(audio.length>500000||Buffer.byteLength(prompt)+Buffer.byteLength(JSON.stringify(ALIGNMENT_IDENTIFICATION_SCHEMA))>20000||state.parentEstimatedUsd+state.parentUnreportedUpperBoundUsd+state.estimatedUsd+bound>10)throw new Error("Reviewed request/budget bounds exceeded before submission.");
 const call:any={index:task.index,parentCallIndex:prior.index,model:"gemini-3.1-pro-preview",audioSha256:prior.audioSha256,audioPath:prior.audioPath,status:"submission_started",upperBoundUsd:bound};
 writeFileSync(join(root,`request-${task.index}.json`),JSON.stringify({prompt,schema:ALIGNMENT_IDENTIFICATION_SCHEMA,model:call.model,maxOutputTokens:4096,thinkingLevel:"low",interval:span,verseScope:task.verses}),{flag:"wx"});
 state.calls.push(call);state.pendingUpperBoundUsd=bound;save();
 try{
  const response=await generateJsonWithImagesMetered(prompt,[{mimeType:"audio/wav",data:audio.toString("base64")}],ALIGNMENT_IDENTIFICATION_SCHEMA,call.model,{maxOutputTokens:4096,thinkingLevel:"low"});
  const u=response.usage;
  if(![u.promptTokenCount,u.candidatesTokenCount,u.thoughtsTokenCount,u.totalTokenCount].every(n=>Number.isSafeInteger(n)&&n>=0)||u.promptTokenCount<=0||u.promptTokenCount>25000||u.totalTokenCount<u.promptTokenCount+u.candidatesTokenCount+u.thoughtsTokenCount||!Number.isFinite(response.costUsd)||response.costUsd<0||response.costUsd>bound)throw new Error("Unreported or out-of-bound usage; reconcile before further calls.");
  Object.assign(call,{status:"completed",result:response.result,usage:u,estimatedCostUsd:response.costUsd});
  state.estimatedUsd=Math.round((state.estimatedUsd+response.costUsd)*1e6)/1e6;state.pendingUpperBoundUsd=0;save();
 }catch(error){call.status="held_reconcile_before_retry";call.error=(error as Error).message.split(process.env.GEMINI_API_KEY!).join("[redacted]");if(error instanceof GeminiResponseError)call.reportedErrorReceipt=error.receipt;state.status="held";save();throw new Error(call.error);}
}
state.status="completed_provisional";save();console.log(JSON.stringify({status:state.status,newCalls:state.calls.length,totalEstimatedUsd:state.parentEstimatedUsd+state.estimatedUsd,unreportedUpperBoundUsd:state.parentUnreportedUpperBoundUsd}));
