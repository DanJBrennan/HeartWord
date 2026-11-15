/** Local-only re-evaluation of retained transcription evidence. Never calls a provider. */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {alignWithGemini} from "../src/pipeline/ingestion/gemini-alignment.js";
import {parseNarratedParagraphTitles} from "../src/pipeline/ingestion/parse-source-text.js";
const root=resolve(process.argv[2]!),packet=JSON.parse(readFileSync(process.argv[3]!,"utf8")),output=resolve(process.argv[4]!);
const journalPath=join(root,"execution.json"),journal=JSON.parse(readFileSync(journalPath,"utf8"));
const sha=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
if(sha(readFileSync(packet.input.audio))!==packet.input.sourceHashes.audio)throw new Error("Pinned source changed");
const refinementPath=process.argv[5],refinement=refinementPath?JSON.parse(readFileSync(refinementPath,"utf8")):null;
if(refinement && (refinement.status!=="completed_provisional"||refinement.parentJournalSha256!==sha(readFileSync(journalPath))))throw new Error("Refinement is incomplete or belongs to another journal.");
const used:any[]=[],missing:any[]=[];
const result=await alignWithGemini({audioPath:packet.input.audio,verses:packet.verses,chapterTitle:packet.printedChapterTitle,
 titles:parseNarratedParagraphTitles(packet.input.hatam),durationMs:packet.durationMs,gaps:packet.alignmentPreflight.gaps,
 config:{fastModel:"gemini-3.6-flash",strongModel:"gemini-3.1-pro-preview",maxSegmentMs:14000},
 identify:async(audio,context,model)=>{
  const audioSha256=sha(audio),refined=refinement?.calls.find((c:any)=>c.audioSha256===audioSha256&&c.status==="completed"),call=refined??journal.calls.findLast((c:any)=>c.model===model&&c.audioSha256===audioSha256);
  if(!call||call.status!=="completed"){missing.push({audioSha256,model});return undefined;}
  used.push({index:call.index,requestedStageModel:model,evidenceModel:call.model,audioSha256,refinement:Boolean(refined),originalPromptSha256:call.promptSha256,
   contextCaveat:"Reused recorded span only. The model did not see or approve these recomputed local bounds."});return call.result;
 }});
writeFileSync(output,JSON.stringify({status:"local_recomputed_provisional",providerCalls:0,journalSha256:sha(readFileSync(journalPath)),
 sourceHashes:packet.input.sourceHashes,refinementJournalSha256:refinementPath?sha(readFileSync(refinementPath)):null,result,used,missing,
 limitations:"Model copied-word alignment and local anchor checks only; no forced alignment, utterance approval or native-language verification."},null,2),{flag:"wx"});
console.log(JSON.stringify({coverage:result.coverage,uncovered:result.uncoveredVerses,missingCachedRequests:missing.length,unresolved:result.segments.filter(s=>s.status!=="matched")}));
