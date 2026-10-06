/** Held v55 scene grade. Picture only: it keeps the approved time-of-day arc
 * and does not normalize the night storm or dawn handoff into daytime. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir,getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",fps=24,total=13831;
const inputRel="generated/chapter/mark4-autonomous-overnight-final-v54-cleanup-and-dawn-extension-held.mp4",outputRel="generated/chapter/mark4-autonomous-overnight-final-v55-scene-grade-held.mp4";
type Grade={end:number;filter:string;name:string};const grades:Grade[]=[
 {end:3058,filter:"eq=brightness=-0.015:contrast=1.025:saturation=0.93,colorbalance=rs=0.018:bs=-0.018",name:"golden morning boat and shore"},
 {end:6508,filter:"eq=brightness=-0.01:contrast=1.02:saturation=0.95,colorbalance=rs=0.012:bs=-0.012",name:"bright private hillside and grove"},
 {end:10593,filter:"eq=brightness=-0.012:contrast=1.02:saturation=0.94,colorbalance=rs=0.02:bs=-0.018",name:"warm afternoon shore and illustrations"},
 {end:12169,filter:"eq=brightness=-0.025:contrast=1.015:saturation=0.88,colorbalance=rs=0.005:bs=0.008",name:"late afternoon into dusk"},
 {end:13447,filter:"eq=brightness=-0.01:contrast=1.04:saturation=0.82,colorbalance=bs=0.025",name:"night storm and moonlit calm"},
 {end:total,filter:"eq=brightness=0.015:contrast=0.98:saturation=0.9,colorbalance=rs=0.01:bs=-0.005",name:"dawn pull-away"}
];const data=getDataDir(),assets=join(data,"assets"),input=join(assets,inputRel),output=join(assets,outputRel);if(!existsSync(input))throw new Error("Missing v54.");
let start=0;const filters=grades.map((g,i)=>{const f=`[0:v]trim=start_frame=${start}:end_frame=${g.end},setpts=PTS-STARTPTS,${g.filter},setsar=1[v${i}]`;start=g.end;return f});if(start!==total)throw new Error("Grade ranges must cover cut.");filters.push(`${grades.map((_,i)=>`[v${i}]`).join("")}concat=n=${grades.length}:v=1:a=0[v]`);execFileSync("ffmpeg",["-v","error","-y","-i",input,"-filter_complex",filters.join(";"),"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});const frames=Number(execFileSync("ffprobe",["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());if(frames!==total)throw new Error(`Expected ${total}, got ${frames}`);const db=getDb(),id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,Math.round(total/fps*1000),114,now);db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:inputRel,sceneGrades:grades}),JSON.stringify({audioBase:inputRel,sourceCastAudioByteCopied:true}));db.exec("COMMIT")}catch(e){db.exec("ROLLBACK");throw e};console.log(JSON.stringify({outputRel,frames,heldForReview:true,grades},null,2));
