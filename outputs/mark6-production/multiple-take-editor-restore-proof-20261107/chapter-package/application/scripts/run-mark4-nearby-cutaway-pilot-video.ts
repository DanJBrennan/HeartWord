import "dotenv/config";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { generateNonSpeakingVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId="1172d540-c778-46af-8c7e-9dfa2cc565a1";
const logPath=join(getDataDir(),"logs","mark4-nearby-cutaway-pilot-video.jsonl");
mkdirSync(dirname(logPath),{recursive:true});
const write=(event:string,detail:unknown)=>appendFileSync(logPath,JSON.stringify({at:Date.now(),event,detail})+"\n");
try {
  write("submission_started",{projectId,shotId,policy:"Veo first; Kling disabled for ordinary non-speaking coverage"});
  write("completed",await generateNonSpeakingVideoCandidate(getDb(),projectId,shotId,{veo:new GeminiVideoProvider(),kling:new KlingVideoProvider(),draft:new GeminiDraftVideoProvider()}));
} catch(error) { write("failed",{message:(error as Error).message}); process.exitCode=1; }
