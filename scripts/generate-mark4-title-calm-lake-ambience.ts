import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { ElevenLabsEffectsProvider } from "../src/providers/soundtrack.js";

const path=join(getDataDir(),"assets","generated","editorial","mark4-intro","calm-lake-dawn-ambience-r1.mp3");
mkdirSync(dirname(path),{recursive:true});
const result=await new ElevenLabsEffectsProvider().generate({
  kind:"sfx",durationMs:2500,loop:false,
  prompt:"Quiet dawn beside a completely calm lake: a few distant small birds and the soft rustle of nearby olive leaves in a very light breeze. No waves, surf, splashing, boat creaks, footsteps, people, speech, singing, music, or dramatic sounds. Sparse natural ambience."
});
writeFileSync(path,result.bytes,{flag:"wx"});
writeFileSync(path.replace(/\.mp3$/,".json"),JSON.stringify({provider:result.provider,model:result.model,usage:result.usage,requestId:result.requestId,prompt:"Quiet calm lake dawn ambience: distant birds and leaves only; no waves."},null,2),{flag:"wx"});
console.log(JSON.stringify({ok:true,path},null,2));
