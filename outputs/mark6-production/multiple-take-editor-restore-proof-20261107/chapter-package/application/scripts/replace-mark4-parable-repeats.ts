/** Replace two visually repetitive parable inserts with adjacent, already approved coverage. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", dataDir=getDataDir(), assets=join(dataDir,"assets"), db=getDb();
const prior="generated/chapter/mark4-autonomous-overnight-final-v5-approved-intro.mp4";
const rocky="generated/assembled/06922215-fddd-4bb5-bfc7-583b9bd3f805.mp4";
const thorns="generated/assembled/24d79583-696a-4ed3-a18a-9a059398f59c.mp4";
const outRel="generated/chapter/mark4-autonomous-overnight-final-v6-continuity.mp4",out=join(assets,outRel);
for(const path of [prior,rocky,thorns])if(!existsSync(join(assets,path)))throw Error(`Missing retained coverage: ${path}`);
const a=70.682,b=74.580,c=85.502,d=86.336,total=551.292;
const filter=[
  `[0:v]trim=start=0:end=${a},setpts=PTS-STARTPTS[p0]`,
  `[1:v]trim=duration=${(b-a).toFixed(3)},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[p1]`,
  `[0:v]trim=start=${b}:end=${c},setpts=PTS-STARTPTS[p2]`,
  `[2:v]trim=duration=${(d-c).toFixed(3)},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[p3]`,
  `[0:v]trim=start=${d},setpts=PTS-STARTPTS[p4]`,
  "[p0][p1][p2][p3][p4]concat=n=5:v=1:a=0[video]",
].join(";");
execFileSync("ffmpeg",["-v","error","-y","-i",join(assets,prior),"-i",join(assets,rocky),"-i",join(assets,thorns),"-filter_complex",filter,"-map","[video]","-map","0:a:0","-t",String(total),"-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",out],{stdio:["ignore","ignore","pipe"]});
const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);if(Math.abs(actual-Math.round(total*1000))>150)throw Error("Continuity candidate has wrong duration.");
const id=randomUUID();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,166,Date.now());db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"approved_pre_source_lake_title",startMs:0,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:527292},{kind:"post_source_editorial_bridge",startMs:527292,endMs:551292}]),JSON.stringify({pictureBase:prior,replacedVisualIntervals:[{startMs:70682,endMs:74580,replacement:"approved rocky-ground coverage"},{startMs:85502,endMs:86336,replacement:"approved thorn coverage"}],narrationPriorityMix:true}));db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({outRel,durationMs:actual,replacedTimelineIntervals:[{start:a,end:b},{start:c,end:d}]},null,2));
