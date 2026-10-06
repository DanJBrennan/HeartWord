import "dotenv/config";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";
const log=join(getDataDir(),"logs","mark4-intro-lake-and-boat-motion.jsonl"); mkdirSync(dirname(log),{recursive:true});
const write=(event:string,detail:unknown)=>appendFileSync(log,JSON.stringify({at:Date.now(),event,detail})+"\n");
const provider=new GeminiVideoProvider();
try {
  write("lake_started",{});
  const lake=await provider.generateFinal({shotId:"editorial-mark4-intro-lake-r2",characters:[],prompt:"Animate this tranquil title-free morning lake. Show subtle, continuous natural life for five seconds: delicate calm-water ripples, a light breeze gently moving olive leaves, and very occasional distant birds. No waves, surf, splashing, boats, people, text, speech, narration, music, or new objects."},{resolution:"720p",startFrame:{path:"generated/editorial/mark4-intro/establishing-r1.png"},durationSeconds:8,tier:"economy"}); write("lake_completed",lake);
  write("boat_started",{});
  const boat=await provider.generateFinal({shotId:"editorial-mark4-intro-boat-r1",characters:[],prompt:"Animate this empty anchored wooden fishing boat at a tranquil morning lakeshore. The boat rocks gently and naturally in very small calm-water ripples; nearby leaves and reflections move subtly. No waves, surf, splashing, people, text, speech, narration, music, or new objects."},{resolution:"720p",startFrame:{path:"generated/editorial/mark4-intro/arrival-r1.png"},durationSeconds:4,tier:"economy"}); write("boat_completed",boat);
} catch(error) {write("failed",{message:(error as Error).message});process.exitCode=1;}
