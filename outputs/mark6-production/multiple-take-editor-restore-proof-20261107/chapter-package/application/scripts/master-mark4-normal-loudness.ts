/** Apply final broadcast-style loudness mastering without changing picture or the approved mix balance. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",dataDir=getDataDir(),assets=join(dataDir,"assets"),db=getDb();
const prior="generated/chapter/mark4-autonomous-overnight-final-v8-normal-level.mp4",outRel="generated/chapter/mark4-autonomous-overnight-final-v9-mastered.mp4",out=join(assets,outRel);
if(!existsSync(join(assets,prior)))throw Error("Normal-level mix unavailable.");const duration=551.292;
// -16 LUFS is a comfortable normal listening target; the true-peak ceiling avoids distortion.
execFileSync("ffmpeg",["-v","error","-y","-i",join(assets,prior),"-filter:a","loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=false","-map","0:v:0","-map","0:a:0","-t",String(duration),"-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",out],{stdio:["ignore","ignore","pipe"]});
const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);if(Math.abs(actual-Math.round(duration*1000))>150)throw Error("Mastered output has wrong duration.");
const id=randomUUID();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,166,Date.now());db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"approved_pre_source_lake_title",startMs:0,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:527292},{kind:"post_source_editorial_bridge",startMs:527292,endMs:551292}]),JSON.stringify({pictureAndMixBase:prior,mastering:"loudnorm I=-16 LUFS, TP=-1.5 dB, LRA=11",narrationPriority:true}));db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}
console.log(JSON.stringify({outRel,durationMs:actual,targetIntegratedLufs:-16,truePeakDb:-1.5},null,2));
