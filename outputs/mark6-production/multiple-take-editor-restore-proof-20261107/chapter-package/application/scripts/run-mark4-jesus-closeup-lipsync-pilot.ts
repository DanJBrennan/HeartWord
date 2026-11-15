import "dotenv/config";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { runVoiceLipSync } from "../src/pipeline/voice-lipsync/index.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const logPath=join(getDataDir(),"logs","mark4-jesus-closeup-lipsync-pilot.jsonl");
mkdirSync(dirname(logPath),{recursive:true});
const write=(event:string,detail:unknown)=>appendFileSync(logPath,JSON.stringify({at:Date.now(),event,detail})+"\n");
try {
  write("submission_started",{projectId,scope:"sole approved Mark 4:3 source-bound Jesus close-up"});
  write("completed",await runVoiceLipSync(projectId));
} catch(error) { write("failed",{message:(error as Error).message}); process.exitCode=1; }
