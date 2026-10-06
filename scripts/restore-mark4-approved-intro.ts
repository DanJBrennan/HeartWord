/** Restore the already approved Mark 4 placid-lake opening over the narration-priority mix. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", dataDir=getDataDir(), assets=join(dataDir,"assets"), db=getDb();
const intro="generated/editorial/mark4-intro/mark4-intro-three-beat-motion-preview-r3.mp4";
const prior="generated/chapter/mark4-autonomous-overnight-final-v4-narration-priority.mp4";
const outRel="generated/chapter/mark4-autonomous-overnight-final-v5-approved-intro.mp4",out=join(assets,outRel);
for(const path of [intro,prior])if(!existsSync(join(assets,path)))throw Error(`Missing approved remix input: ${path}`);
const duration=551.292;
const filter="[0:v]trim=duration=11.5,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[intro];[1:v]trim=start=11.5,setpts=PTS-STARTPTS[body];[intro][body]concat=n=2:v=1:a=0[video]";
execFileSync("ffmpeg",["-v","error","-y","-i",join(assets,intro),"-i",join(assets,prior),"-filter_complex",filter,"-map","[video]","-map","1:a:0","-t",String(duration),"-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",out],{stdio:["ignore","ignore","pipe"]});
const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);
if(Math.abs(actual-Math.round(duration*1000))>150)throw Error("Restored-intro candidate has the wrong duration.");
const id=randomUUID();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,166,Date.now());db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"approved_pre_source_lake_title",startMs:0,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:527292},{kind:"post_source_editorial_bridge",startMs:527292,endMs:551292}]),JSON.stringify({pictureBase:prior,approvedIntro:intro,narrationPriorityMix:true}));db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({outRel,durationMs:actual,approvedIntro:intro},null,2));
