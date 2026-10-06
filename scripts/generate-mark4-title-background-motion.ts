import "dotenv/config";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";
const log=join(getDataDir(),"logs","mark4-title-background-motion.jsonl"); mkdirSync(dirname(log),{recursive:true});
const write=(event:string,detail:unknown)=>appendFileSync(log,JSON.stringify({at:Date.now(),event,detail})+"\n");
try { write("submission_started",{}); const result=await new GeminiVideoProvider().generateFinal({shotId:"editorial-mark4-intro-lake-background-r1",characters:[],prompt:"Animate this tranquil title-free morning lake frame with only subtle natural movement: gentle barely-visible ripples on a calm lake, slight olive-leaf movement in a light breeze, and occasional distant bird motion. No waves, surf, splashing, boats moving, people, text, subtitles, speech, narration, music, or new objects."},{resolution:"720p",startFrame:{path:"generated/editorial/mark4-intro/establishing-r1.png"},durationSeconds:4,tier:"economy"}); write("completed",result); } catch(error) {write("failed",{message:(error as Error).message});process.exitCode=1;}
