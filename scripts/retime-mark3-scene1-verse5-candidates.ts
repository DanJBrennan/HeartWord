/** Retimes reviewed subtle-motion takes to exact Mark 3:5 picture durations. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const rows=[
  {shotId:"a5fea0f8-2e9d-420e-bb31-0e22455b5e96",sourceAttempt:"c7a1fc5d-739b-48af-9409-8dc98a211c38",durationMs:8000,label:"jesus-reaction"},
  {shotId:"91afa1de-a013-4266-81e8-7e6be3199c7e",sourceAttempt:"0720fc12-94ab-4e24-b61c-6af465c7a891",durationMs:6779,label:"healing-hand"}
] as const;
const db=getDb(), root=join(getDataDir(),"assets");
for(const item of rows){
  const source=db.prepare("SELECT shot_id,result_asset_path,status FROM generation_attempts WHERE id=? AND operation='generate_final_video'")
    .get(item.sourceAttempt) as {shot_id:string;result_asset_path:string|null;status:string}|undefined;
  if(source?.shot_id!==item.shotId||!source.result_asset_path||source.status!=="hold_for_review")throw new Error(`Source attempt invalid: ${item.label}`);
  const key=`mark3-scene1-verse5-${item.label}-${item.durationMs}ms-r1`;
  const prior=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? LIMIT 1")
    .get(item.shotId,`${key}%`) as {id:string;result_asset_path:string|null}|undefined;
  if(prior){console.log(JSON.stringify({label:item.label,...prior,reused:true}));continue;}
  const src=join(root,source.result_asset_path);
  if(!existsSync(src))throw new Error(`Missing ${src}`);
  const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","json",src],{encoding:"utf8"})) as {format:{duration:string}};
  const sourceSeconds=Number(probe.format.duration),targetSeconds=item.durationMs/1000;
  if(sourceSeconds<4.9||sourceSeconds>5.2)throw new Error(`Unexpected source length for ${item.label}: ${sourceSeconds}`);
  const rel=join("generated","video",`${key}.mp4`),out=join(root,rel),frames=Math.round(targetSeconds*24);
  execFileSync("ffmpeg",["-v","error","-n","-i",src,"-vf",`setpts=${(targetSeconds/sourceSeconds).toFixed(8)}*(PTS-STARTPTS),fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,tpad=stop_mode=clone:stop_duration=0.1`,"-frames:v",String(frames),"-an","-c:v","libx264","-preset","medium","-crf","18",out],{stdio:"pipe"});
  const id=randomUUID(),now=Date.now();
  db.exec("BEGIN IMMEDIATE");try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_ffmpeg','constant-speed-retime','generate_final_video','720p',?,'hold_for_review',?,0,?)")
      .run(id,item.shotId,`${key}: reviewed source attempt ${item.sourceAttempt}, ${source.result_asset_path}, ${sourceSeconds.toFixed(3)}s retimed at constant speed to ${item.durationMs}ms without changing source audio.`,rel,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(),projectId,item.shotId,`Retimed ${item.label} candidate ${id}: ${frames} frames / 24 fps. This is picture-only; inspect derivative before selecting.`,now);
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
  console.log(JSON.stringify({label:item.label,attemptId:id,result_asset_path:rel,frames}));
}
