import "dotenv/config";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";
const log=join(getDataDir(),"logs","mark4-title-lake-motion.jsonl"); mkdirSync(dirname(log),{recursive:true});
const write=(event:string,detail:unknown)=>appendFileSync(log,JSON.stringify({at:Date.now(),event,detail})+"\n");
try { write("submission_started",{}); const result=await new GeminiVideoProvider().generateFinal({shotId:"editorial-mark4-intro-title-r1",characters:[],prompt:"Animate the supplied tranquil title-over-lake frame with only subtle natural movement: gentle barely-visible ripples on a calm lake, slight olive-leaf movement in a light breeze, and occasional distant bird motion. Preserve all title lettering exactly and keep it perfectly readable. No waves, surf, splashing, boats moving, people, speech, narration, music, or new objects."},{resolution:"720p",startFrame:{path:"generated/editorial/mark4-intro/title-over-lake-r1.png"},durationSeconds:4,tier:"economy"}); write("completed",result); } catch(error) {write("failed",{message:(error as Error).message});process.exitCode=1;}
