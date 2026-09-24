/** Picture-selected scene-closing cut with one uninterrupted source narrator span per turn. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const sceneId="2842e225-94a7-4074-9ae1-a69ac3b50c76";
const db=getDb(),root=join(getDataDir(),"assets");
const shots=db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? AND sequence BETWEEN 4 AND 11 ORDER BY sequence").all(sceneId) as Array<{id:string;sequence:number}>;
if(shots.length!==8||shots.some((s,i)=>s.sequence!==i+4))throw new Error("Scene closing shot order changed.");
const videos=shots.map(shot=>{
  const row=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
    .get(shot.id) as {result_asset_path:string}|undefined;
  if(!row)throw new Error(`Unassembled shot ${shot.sequence}`);
  const path=join(root,row.result_asset_path);if(!existsSync(path))throw new Error(`Missing ${path}`);return path;
});
const original=join(root,"source","hatam","audio","Hatam_had_LAI_NT_Non-Drama","B02___03_Markus______HADLAIN1DA.mp3");
const cast4=join(root,"generated","hatam","mark-3","composite_cast_master","06-mark-3-4-elevenlabs-boundary-55153.wav");
const castCommand=join(root,"generated","hatam","mark-3","composite_cast_master","10-segment-9-elevenlabs.mp3");
for(const path of [original,cast4,castCommand])if(!existsSync(path))throw new Error(`Missing ${path}`);
const source=db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=? AND project_id=?").get("c8051195-8a7e-4a80-bc5f-5c63736d95fd",projectId) as {start_ms:number;end_ms:number}|undefined;
if(source?.start_ms!==78779||source.end_ms!==90655)throw new Error("Scene-closing source interval changed.");
const out=join(root,"generated","video","review","mark3-scene1-shot4-through-exit-review-r2.mp4");
const picture=videos.map((_,i)=>`[${i}:v]setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720[v${i}]`);
const filter=[...picture,
  `${videos.map((_,i)=>`[v${i}]`).join("")}concat=n=8:v=1:a=0[vcat]`,
  "[vcat]tpad=stop_mode=clone:stop_duration=0.05[v]",
  "[9:a]atrim=start=0:end=13.420,asetpts=PTS-STARTPTS,aresample=48000[a0]",
  "[8:a]atrim=start=55.153:end=70.759,asetpts=PTS-STARTPTS,aresample=48000[a1]",
  "[10:a]atrim=start=0:end=1.241,asetpts=PTS-STARTPTS,aresample=48000[a2]",
  "[8:a]atrim=start=72.000:end=92.799,asetpts=PTS-STARTPTS,aresample=48000[a3]",
  "[a0][a1][a2][a3]concat=n=4:v=0:a=1[a]"
].join(";");
if(!existsSync(out))execFileSync("ffmpeg",["-v","error","-n",...videos.flatMap(path=>["-i",path]),"-i",original,"-i",cast4,"-i",castCommand,
  "-filter_complex",filter,"-map","[v]","-map","[a]","-frames:v","1226","-c:v","libx264","-preset","medium","-crf","18","-c:a","aac","-b:a","192k",out],{stdio:"pipe",timeout:180000});
console.log(JSON.stringify({out,shotIds:shots.map(s=>s.id),sourceStartMs:41733,sourceEndMs:92799}));
