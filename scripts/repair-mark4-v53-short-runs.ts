/** Held v53: absorb documented short visual inserts into their following shot.
 * A cloned first decoded frame is used only inside the former micro-run, so
 * the boundary no longer creates an independent picture event. Audio/clock
 * remain byte-for-byte copied from v51. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir,getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", fps=24,total=13447;
const inputRel="generated/chapter/mark4-autonomous-overnight-final-v51-calibrated-ambience-48k-held.mp4";
const outputRel="generated/chapter/mark4-autonomous-overnight-final-v53-short-run-cleanup-held.mp4";
const repairs=[
  [276,16,"legacy standing-in-shallows micro-insert"],[1267,23,"short off-canon boat insert"],[2479,18,"short wheat insert"],[2755,20,"duplicate wheat insert"],
  [5936,16,"short grove insert"],[9541,22,"short mustard planting insert"],[12337,18,"calm wide split insert"],
  [8976,3,"residual field flash"],[9918,3,"residual mustard flash"]
] as const;
const data=getDataDir(),assets=join(data,"assets"),input=join(assets,inputRel),output=join(assets,outputRel);if(!existsSync(input))throw new Error("Missing v51 input.");
let cursor=0,parts:Array<{start:number;frames:number;clone?:boolean;label:string}>=[];
for(const [at,frames,label] of [...repairs].sort((a,b)=>a[0]-b[0])){if(at<cursor||at+frames>=total)throw new Error(`Invalid repair ${label}`);if(at>cursor)parts.push({start:cursor,frames:at-cursor,label:"retained picture"});parts.push({start:at+frames,frames,clone:true,label});cursor=at+frames;}if(cursor<total)parts.push({start:cursor,frames:total-cursor,label:"retained picture"});
if(parts.reduce((n,p)=>n+p.frames,0)!==total)throw new Error("Frame clock changed.");
const filters=parts.map((p,i)=>p.clone?`[0:v]trim=start_frame=${p.start}:end_frame=${p.start+1},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${((p.frames-1)/fps).toFixed(6)},fps=${fps},trim=end_frame=${p.frames}[p${i}]`:`[0:v]trim=start_frame=${p.start}:end_frame=${p.start+p.frames},setpts=PTS-STARTPTS[p${i}]`);filters.push(`${parts.map((_,i)=>`[p${i}]`).join("")}concat=n=${parts.length}:v=1:a=0[v]`);
execFileSync("ffmpeg",["-v","error","-y","-i",input,"-filter_complex",filters.join(";"),"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});
const count=Number(execFileSync("ffprobe",["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());if(count!==total)throw new Error(`Expected ${total}, got ${count}`);
const db=getDb(),id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,Math.round(total/fps*1000),parts.length,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:inputRel,repairs:repairs.map(([start,frames,label])=>({startFrame:start,endFrame:start+frames-1,label,method:"clone following decoded frame"}))}),JSON.stringify({audioBase:inputRel,sourceCastAudioByteCopied:true}));db.exec("COMMIT")}catch(e){db.exec("ROLLBACK");throw e};console.log(JSON.stringify({outputRel,count,heldForReview:true,repairs},null,2));
