// Standalone animal diagnostic; no production DB, paid API/QC or timeline writes.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { LtxVideoProvider } from "../src/providers/ltx/index.js";
import { closeLtxTunnel } from "../src/providers/ltx/transport.js";
const assets="C:/Users/danbr/HeartWordData/assets";
const folder=join(assets,"generated/ltx-diagnostics",`pony-${randomUUID()}`);
mkdirSync(folder,{recursive:true});
const prompt="A continuous five-second realistic documentary close-up of the single Shetland pony in the opening image, outdoors in the same quiet grassy paddock. Keep its chestnut coat, shaggy forelock, head shape, both eyes and muzzle recognizable. The camera stays still at eye level, with the pony's head and upper neck filling the landscape frame. During the first second the pony lifts its chin slightly, its ears twitch, and its nostrils widen as it breathes in. Then its mouth opens naturally and it gives one clear, loud, unmistakable horse neigh, rising and falling in pitch, with synchronized muzzle and throat motion. Its head settles and its mouth relaxes again as the neigh ends. Its mane moves lightly in the breeze throughout. SOUND: a close, crisp horse neigh in the foreground, a soft exhale and quiet wind across grass beneath it. The neigh is an animal call, with no human speech, no music or other voices. Natural daylight and shallow depth of field remain steady. One pony only, one uncut shot, 16:9 landscape.";
let lastLog=0,lastPhase="";
writeFileSync(join(folder,"diagnostic.json"),JSON.stringify({purpose:"Requested standalone pony test, not Scripture production",prompt,keyframe:"generated/pony-ltx-keyframe-2026-10-14.png",requested:{durationSeconds:5,resolution:"720p",fps:24,audioMode:"ambient",seed:42},cost:{localVideoApiUsd:0,includedImageUsage:"consumption not reported",assistantCost:"not reported"}},null,2),{flag:"wx"});
console.log(JSON.stringify({folder,status:"starting"}));
try{
  const result=await new LtxVideoProvider().generateFinal({shotId:"pony-diagnostic",prompt,characters:[]},{startFrame:{path:"generated/pony-ltx-keyframe-2026-10-14.png"},durationSeconds:5,resolution:"720p",fps:24,audioMode:"ambient",seed:42,outputPath:join(folder,"pony-native.mp4"),onProgress:p=>{if(p.phase!==lastPhase||Date.now()-lastLog>30000){console.log(JSON.stringify({at:new Date().toISOString(),...p}));lastLog=Date.now();lastPhase=p.phase;}}});
  writeFileSync(join(folder,"result.json"),JSON.stringify(result,null,2),{flag:"wx"});
  console.log(JSON.stringify({status:"complete",video:join(assets,result.media!.path),ambient:result.ambientAudio,output:result.metadata?.output}));
}finally{closeLtxTunnel();}
