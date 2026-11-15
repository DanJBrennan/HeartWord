/** Assemble the bounded Mark 4:11 three-shot pilot for producer review.
 * It uses the selected silent master, the two source-bound lip-sync takes,
 * and one continuous cast-audio line. No timeline clip is selected. */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",shotId="17246352-3c8d-498a-b99e-47c70ff89d2a",dataDir=getDataDir(),db=getDb();
const clips=[
  {path:"generated/video/mark4-v11-three-clip-recovered-1-932999496861093939.mp4",duration:3.443},
  {path:"generated/lipsync-face/933004242674786324.mp4",duration:4.973},
  {path:"generated/lipsync-face/933005032357371914.mp4",duration:2.652}
];
const audio=db.prepare("SELECT c.source_path FROM composite_audio_source_map m JOIN audio_segments c ON c.id=m.composite_segment_id WHERE m.original_segment_id=?").get("95b36a21-021d-4ca3-b1d8-c1f5f1569f67") as {source_path:string}|undefined;
if(!audio||clips.some(clip=>!existsSync(join(dataDir,"assets",clip.path)))||!existsSync(join(dataDir,"assets",audio.source_path)))throw Error("Required Mark 4:11 pilot media is unavailable.");
const rel="generated/chapter/mark4-v11-three-clip-pilot-review.mp4",output=join(dataDir,"assets",rel);mkdirSync(join(dataDir,"assets","generated","chapter"),{recursive:true});
const filter=clips.map((clip,index)=>`[${index}:v]trim=duration=${clip.duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1904:1072,setsar=1[v${index}]`).join(";")+";[v0][v1][v2]concat=n=3:v=1:a=0[v]";
execFileSync("ffmpeg",["-v","error","-y",...clips.flatMap(clip=>["-i",join(dataDir,"assets",clip.path)]),"-i",join(dataDir,"assets",audio.source_path),"-filter_complex",filter,"-map","[v]","-map","3:a:0","-af","apad=pad_dur=0.020","-t","11.068","-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",output],{stdio:["ignore","ignore","pipe"]});
const duration=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",output],{encoding:"utf8"}).trim());if(Math.abs(duration-11.068)>0.1)throw Error(`Review reel duration drifted to ${duration}s.`);
const now=Date.now(),id=randomUUID();db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_ffmpeg','source-bound-three-clip-review','assemble_coverage_pilot','1904x1072',?,'hold_for_review',?,?,?)").run(id,shotId,"Mark 4:11 three-clip pilot: original source cut points 0-3443, 3443-8416, 8416-11068 ms; source-bound Jesus lip sync only in segments 2 and 3; continuous approved cast-audio track; review-only, no timeline selection.",rel,0,now);
console.log(JSON.stringify({attemptId:id,path:rel,durationSeconds:duration},null,2));
