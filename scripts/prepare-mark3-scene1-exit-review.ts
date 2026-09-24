/** Retains a reviewable Mark 3:6 continuation and source-continuous preview. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const departureId="7e4a0dfc-e7e3-466d-a844-0b59883b4e48";
const aftermathId="14211d4d-9f42-47b5-b20b-8703b1e594ff";
const db=getDb(),root=join(getDataDir(),"assets");
function pathForAttempt(id:string){
  const row=db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE id=?").get(id) as {result_asset_path:string|null;status:string}|undefined;
  if(row?.status!=="hold_for_review"||!row.result_asset_path)throw new Error(`Missing held candidate ${id}`);
  const path=join(root,row.result_asset_path);if(!existsSync(path))throw new Error(`Missing media ${path}`);return path;
}
const departure=pathForAttempt("50da6fc5-4e0d-4e4c-b9d4-fcd48eb9600b");
const aftermathSource=pathForAttempt("1a2f82d6-bf1a-4137-82c6-6f3c16c146d8");
const marker="mark3-scene1-exit-aftermath-6020ms-r1";
const aftermathRel=join("generated","video","review",`${marker}.mp4`);
const aftermath=join(root,aftermathRel);
if(!existsSync(aftermath))execFileSync("ffmpeg",["-v","error","-n","-i",aftermathSource,"-vf","fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720","-frames:v","144","-an","-c:v","libx264","-preset","medium","-crf","18",aftermath],{stdio:"pipe"});
let local=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? LIMIT 1")
  .get(aftermathId,`${marker}%`) as {id:string}|undefined;
if(!local){
  local={id:randomUUID()};
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_ffmpeg','reviewed-Veo-trim','generate_final_video','720p',?,'hold_for_review',?,0,?)")
    .run(local.id,aftermathId,`${marker}: first 6.020 s of reviewed Veo continuation 1a2f82d6-bf1a-4137-82c6-6f3c16c146d8; original provider audio discarded.`,aftermathRel,Date.now());
}
const preview=join(root,"generated","video","review","mark3-scene1-command-through-exit-review-r1.mp4");
const command=join(root,"generated","assembled","03501e06-4d6d-49f8-bd8a-1c4e4ad61ae3.mp4");
const healing=join(root,"generated","assembled","91afa1de-a013-4266-81e8-7e6be3199c7e.mp4");
const original=join(root,"source","hatam","audio","Hatam_had_LAI_NT_Non-Drama","B02___03_Markus______HADLAIN1DA.mp3");
const cast=join(root,"generated","hatam","mark-3","composite_cast_master","10-segment-9-elevenlabs.mp3");
for(const path of [command,healing,original,cast])if(!existsSync(path))throw new Error(`Missing source ${path}`);
if(!existsSync(preview))execFileSync("ffmpeg",["-v","error","-n","-i",command,"-i",healing,"-i",departure,"-i",aftermath,"-i",original,"-i",cast,
  "-filter_complex",[
    "[0:v]setpts=PTS-STARTPTS,fps=24,scale=1280:720[v0]",
    "[1:v]setpts=PTS-STARTPTS,fps=24,scale=1280:720[v1]",
    "[2:v]setpts=PTS-STARTPTS,fps=24,scale=1280:720[v2]",
    "[3:v]setpts=PTS-STARTPTS,fps=24,scale=1280:720[v3]",
    "[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]",
    "[5:a]atrim=start=0:end=1.241,asetpts=PTS-STARTPTS,aresample=48000[a0]",
    "[4:a]atrim=start=72.000:end=92.799,asetpts=PTS-STARTPTS,aresample=48000[a1]",
    "[a0][a1]concat=n=2:v=0:a=1[a]"
  ].join(";"),"-map","[v]","-map","[a]","-c:v","libx264","-preset","medium","-crf","18","-c:a","aac","-b:a","192k",preview],{stdio:"pipe",timeout:120000});
console.log(JSON.stringify({projectId,departureId,aftermathId,aftermathAttemptId:local.id,aftermathRel,preview}));
