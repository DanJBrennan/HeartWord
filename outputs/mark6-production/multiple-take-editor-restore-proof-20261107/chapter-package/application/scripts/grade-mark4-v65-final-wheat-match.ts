/** Held v65: close the final within-scene wheat colour discontinuity from v64. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", total=13831;
const inputRel="generated/chapter/mark4-autonomous-overnight-final-v64-outlier-colour-match-held.mp4";
const outputRel="generated/chapter/mark4-autonomous-overnight-final-v65-scene-colour-held.mp4";
const patches=[
  {start:2265,end:2317,filter:"eq=brightness=0.070:contrast=1.00:saturation=0.96",reason:"lift dark wheat bridge into the adjacent established golden Scene 1 look"},
  {start:2317,end:2479,filter:"eq=brightness=0.000:contrast=1.00:saturation=0.94,colorbalance=rs=-0.035:bs=0.035",reason:"cool the warm wheat insert into the adjacent Scene 1 look"}
];
const data=getDataDir(),assets=join(data,"assets"),input=join(assets,inputRel),output=join(assets,outputRel);if(!existsSync(input))throw new Error("Missing held v64 input.");
const filters=[`[0:v]trim=start_frame=0:end_frame=${patches[0]!.start},setpts=PTS-STARTPTS,setsar=1[a]`,`[0:v]trim=start_frame=${patches[0]!.start}:end_frame=${patches[0]!.end},setpts=PTS-STARTPTS,${patches[0]!.filter},setsar=1[b]`,`[0:v]trim=start_frame=${patches[1]!.start}:end_frame=${patches[1]!.end},setpts=PTS-STARTPTS,${patches[1]!.filter},setsar=1[c]`,`[0:v]trim=start_frame=${patches[1]!.end}:end_frame=${total},setpts=PTS-STARTPTS,setsar=1[d]`,`[a][b][c][d]concat=n=4:v=1:a=0[v]`];
execFileSync("ffmpeg",["-v","error","-y","-i",input,"-filter_complex",filters.join(";"),"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});
const frames=Number(execFileSync("ffprobe",["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());if(frames!==total)throw new Error(`Expected ${total}, got ${frames}.`);
const db=getDb(),id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,576292,115,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:inputRel,finalWheatMatch:patches}),JSON.stringify({audioBase:inputRel,sourceCastAudioCopied:true}));db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}console.log(JSON.stringify({outputRel,frames,heldForReview:true,patches},null,2));
