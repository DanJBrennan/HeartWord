/** Makes picture-only lead-in/command coverage and a continuous-audio review cut. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const db=getDb(), root=join(getDataDir(),"assets"), outDir=join(root,"generated","video","review");
const leadAttempt="85b81130-e3dc-4b5a-8c76-31d75aa5c28f";
const reactionAttempt="e12363bf-5c59-4ce5-a80b-923528df6547";
const healingAttempt="a368dcb6-2bb8-4f97-af0a-b792921eb6d6";
function pathFor(id:string){
  const row=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND status='hold_for_review'").get(id) as {result_asset_path:string|null}|undefined;
  if(!row?.result_asset_path)throw new Error(`Missing held video candidate ${id}`);
  const path=join(root,row.result_asset_path);if(!existsSync(path))throw new Error(`Missing media ${path}`);return path;
}
function audioFor(id:string){
  const row=db.prepare("SELECT source_path FROM audio_segments WHERE id=?").get(id) as {source_path:string}|undefined;
  if(!row)throw new Error(`Missing audio segment ${id}`);return join(root,row.source_path);
}
const leadSource=pathFor(leadAttempt),reaction=pathFor(reactionAttempt),healing=pathFor(healingAttempt);
const lead=join(outDir,"mark3-scene1-verse5-ots-leadin-4769ms-r1.mp4");
const command=join(outDir,"mark3-scene1-verse5-command-hand-hold-1241ms-r1.mp4");
const preview=join(outDir,"mark3-scene1-shot4-through-verse5-healing-review-r2.mp4");
if(!existsSync(lead))execFileSync("ffmpeg",["-v","error","-n","-i",leadSource,"-vf","scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24","-frames:v","114","-an","-c:v","libx264","-preset","medium","-crf","18",lead],{stdio:"pipe"});
if(!existsSync(command))execFileSync("ffmpeg",["-v","error","-n","-i",healing,"-vf","trim=duration=0.04,tpad=stop_mode=clone:stop_duration=1.3,fps=24","-frames:v","30","-an","-c:v","libx264","-preset","medium","-crf","18",command],{stdio:"pipe"});
const transition=join(root,"generated","assembled","mark3-scene1-shot4-shot5-approved-transition.mp4");
const original=audioFor("3930cb5c-646b-48cc-b8ad-3f159efa8749");
const castCommand=audioFor("3b20b957-29aa-42f5-b048-063dd5a5f52f");
const castShot4=audioFor("9024ecee-1e8d-4a8d-8275-be77ce2900ce");
if(!existsSync(preview))execFileSync("ffmpeg",["-v","error","-n",
  "-i",transition,"-i",reaction,"-i",lead,"-i",command,"-i",healing,"-i",original,"-i",castCommand,"-i",castShot4,
  "-filter_complex",[
    "[0:v]setpts=PTS-STARTPTS,fps=24,scale=1280:720[v0]",
    "[1:v]setpts=PTS-STARTPTS,fps=24[v1]",
    "[2:v]setpts=PTS-STARTPTS,fps=24[v2]",
    "[3:v]setpts=PTS-STARTPTS,fps=24[v3]",
    "[4:v]setpts=PTS-STARTPTS,fps=24[v4]",
    "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[v]",
    "[7:a]atrim=start=0:end=13.420,asetpts=PTS-STARTPTS,aresample=48000[a0]",
    "[5:a]atrim=start=55.153:end=70.759,asetpts=PTS-STARTPTS,aresample=48000[a1]",
    "[6:a]atrim=start=0:end=1.241,asetpts=PTS-STARTPTS,aresample=48000[a2]",
    "[5:a]atrim=start=72.000:end=78.779,asetpts=PTS-STARTPTS,aresample=48000[a3]",
    "[a0][a1][a2][a3]concat=n=4:v=0:a=1[a]"
  ].join(";"),"-map","[v]","-map","[a]","-c:v","libx264","-preset","medium","-crf","18","-c:a","aac","-b:a","192k",preview],{stdio:"pipe",timeout:120000});
console.log(JSON.stringify({lead,command,preview}));
