/** One English-context speaker proposal for the isolated Meyah source review. */
import "dotenv/config";
import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {parseSourceTextByVerse} from "../src/pipeline/ingestion/parse-source-text.js";
import {generateJsonMetered,GEMINI_TEXT_MODEL} from "../src/providers/gemini-text.js";

if(process.argv.slice(2).join(" ")!=="--apply")throw Error("Use exactly --apply for one recorded Gemini dispatch.");
if(!process.env.GEMINI_API_KEY)throw Error("Gemini key unavailable; no request sent.");
const root=resolve(import.meta.dirname,"..","output","mark4-donor-20261024");
const english=resolve(root,"assets","source/english-esv/text/Mark/Mark 4.docx");
const review=resolve(root,"review"),intent=resolve(review,"gemini-mark4-english-speakers-intent.json"),resultPath=resolve(review,"gemini-mark4-english-speakers-result.json");
if(existsSync(intent)||existsSync(resultPath))throw Error("English speaker estimate already requested; inspect retained evidence before retrying.");
const verses=parseSourceTextByVerse(english),sha256=createHash("sha256").update(readFileSync(english)).digest("hex");
if(verses.length<35)throw Error("Unexpected English verse inventory.");
const source=verses.map(v=>`[v${v.verse}] ${v.text}`).join("\n");
const prompt=`Read this supplied parallel English translation of Mark chapter 4. For EACH numbered verse, classify the speaker of the words in that verse. Separate narration from direct quotation when both occur. Report only names supported by the English text or an explicit continuing speech context. Use 'Narrator', 'Jesus', 'disciples', or 'unknown' as appropriate; do not assume an individual disciple when the group speaks. The recording is a single Meyah narrator; these labels describe the *story's quoted speaker*, not a verified change of performer. For each verse return verse, label, confidence 0-100, evidence (brief exact English quotation or context), and whether narration and quotation are mixed. Never infer that all words in a mixed verse belong to one character.\n\n${source}`;
const schema={type:"object",properties:{verses:{type:"array",items:{type:"object",properties:{verse:{type:"integer"},label:{type:"string"},confidence:{type:"integer"},evidence:{type:"string"},mixed:{type:"boolean"}},required:["verse","label","confidence","evidence","mixed"]}}},required:["verses"]};
mkdirSync(review,{recursive:true});writeFileSync(intent,JSON.stringify({sha256,model:GEMINI_TEXT_MODEL,verseCount:verses.length,at:new Date().toISOString()},null,2),{flag:"wx"});
try{
 const response=await generateJsonMetered<{verses:Array<{verse:number;label:string;confidence:number;evidence:string;mixed:boolean}>}>(prompt,schema);
 const allowed=new Set(verses.map(v=>v.verse));
 if(!Array.isArray(response.result.verses)||response.result.verses.some(v=>!allowed.has(v.verse)||typeof v.label!=="string"||!Number.isInteger(v.confidence)||v.confidence<0||v.confidence>100)||new Set(response.result.verses.map(v=>v.verse)).size!==allowed.size)throw Error("Gemini response did not cover the English verse inventory; retain raw response for review.");
 const output={sha256,model:GEMINI_TEXT_MODEL,usage:response.usage,costUsd:response.costUsd,receivedAt:new Date().toISOString(),verses:response.result.verses,englishVerses:verses};
 writeFileSync(resultPath,JSON.stringify(output,null,2),{flag:"wx"});console.log(JSON.stringify({resultPath,verses:output.verses.length,costUsd:output.costUsd}));
}catch(error){writeFileSync(resolve(review,"gemini-mark4-english-speakers-error.json"),JSON.stringify({message:(error as Error).message,at:new Date().toISOString()},null,2),{flag:"wx"});throw error;}
