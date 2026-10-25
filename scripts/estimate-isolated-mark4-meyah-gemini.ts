/** One auditable Gemini alignment estimate over the staged Meyah recording.
 *  The isolated database and its source rows remain read-only. Never retry a
 *  partial dispatch automatically; inspect the ledger and result first.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { alignWithGemini, defaultAlignmentConfig } from "../src/pipeline/ingestion/gemini-alignment.js";
import { detectSilences, getAudioDurationMs } from "../src/pipeline/ingestion/detect-silences.js";
import { parseChapterTitle, parseNarratedParagraphTitles, parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";
import { generateJsonWithImagesMetered } from "../src/providers/gemini-text.js";

if(process.argv.slice(2).join(" ")!=="--apply")throw new Error("Use exactly --apply for one recorded Gemini dispatch.");
if(!process.env.GEMINI_API_KEY)throw new Error("A configured Gemini key is required; no provider request was sent.");
const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=resolve(checkout,"output","mark4-donor-20261024");
const dbPath=resolve(root,"db","heartword.sqlite");
if(realpathSync(root)!==root || realpathSync(dbPath)!==dbPath)throw new Error("Expected the fixed isolated checkout.");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const audio=resolve(root,"assets","source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3");
const text=resolve(root,"assets","source/meyah/text/Mark/Mark 4.docx");
const sha=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
const db=new DatabaseSync(dbPath,{readOnly:true});
try{
  const project=db.prepare("SELECT language,book,chapter FROM projects WHERE id=?").get(projectId) as {language:string;book:string;chapter:number}|undefined;
  if(project?.language!=="meyah"||project.book!=="mark"||project.chapter!==4)throw new Error("Expected Meyah Mark 4 in the isolated database.");
  if(db.prepare("SELECT 1 FROM source_alignment_reviews WHERE project_id=? LIMIT 1").get(projectId))throw new Error("A named source review already exists; preserve it before a new estimate.");
  const review=resolve(root,"review"),intent=resolve(review,"gemini-mark4-meyah-intent.json"),ledger=resolve(review,"gemini-mark4-meyah-ledger.jsonl"),resultPath=resolve(review,"gemini-mark4-meyah-result.json");
  if(existsSync(intent)||existsSync(ledger)||existsSync(resultPath))throw new Error("Gemini alignment already has a saved intent or result. Inspect it; no repeat dispatch was sent.");
  const verses=parseSourceTextByVerse(text),chapterTitle=parseChapterTitle(text,4),titles=parseNarratedParagraphTitles(text);
  if(verses.length!==39 || !chapterTitle)throw new Error("Unexpected Meyah source structure; no provider request was sent.");
  const audioSha256=sha(readFileSync(audio)),textSha256=sha(readFileSync(text));
  const durationMs=getAudioDurationMs(audio),gaps=detectSilences(audio),config=defaultAlignmentConfig();
  const job={projectId,audioSha256,textSha256,durationMs,verseRecords:verses.length,chapterTitle,gaps:gaps.length,config,
    producerObservation:"Dan heard a spoken Meyah chapter heading before verse 1 at about four seconds; the local pause midpoint is 4094 ms.",
    sourceRowsWillChange:false,requestedAt:new Date().toISOString()};
  mkdirSync(review,{recursive:true});writeFileSync(intent,JSON.stringify(job,null,2),{flag:"wx"});
  let calls=0,costUsd=0;
  const identify=async(bytes:Buffer,context:string,model:string):Promise<unknown>=>{
    const index=++calls,clipSha256=sha(bytes);
    appendFileSync(ledger,JSON.stringify({event:"submitted",index,model,clipSha256,at:new Date().toISOString()})+"\n");
    try{
      const response=await generateJsonWithImagesMetered<unknown>(`Reference text:\n${context}\n\nAttached audio is consecutive narration or an announcement. Return {isScripture:boolean,span?:string}; Scripture span must be exact verbatim reference words.`,
        [{mimeType:"audio/wav",data:bytes.toString("base64")}],
        {type:"object",properties:{isScripture:{type:"boolean"},span:{type:"string"}},required:["isScripture"]},model);
      costUsd+=response.costUsd;
      appendFileSync(ledger,JSON.stringify({event:"completed",index,model,clipSha256,usage:response.usage,costUsd:response.costUsd,
        result:response.result,at:new Date().toISOString()})+"\n");
      if(index%10===0)process.stderr.write(`Gemini alignment calls completed: ${index}\n`);
      return response.result;
    }catch(error){appendFileSync(ledger,JSON.stringify({event:"failed",index,model,clipSha256,error:(error as Error).message,
      at:new Date().toISOString()})+"\n");throw error;}
  };
  const alignment=await alignWithGemini({audioPath:audio,verses,chapterTitle,titles,durationMs,gaps,identify,config});
  const result={...job,completedAt:new Date().toISOString(),calls,costUsd:Number(costUsd.toFixed(6)),alignment};
  writeFileSync(resultPath,JSON.stringify(result,null,2),{flag:"wx"});
  console.log(JSON.stringify({resultPath,calls,costUsd:result.costUsd,coverage:alignment.coverage,
    segments:alignment.segments.length,matched:alignment.segments.filter(item=>item.status==="matched").length,
    uncoveredVerses:alignment.uncoveredVerses,sourceRowsChanged:false},null,2));
}finally{db.close();}
