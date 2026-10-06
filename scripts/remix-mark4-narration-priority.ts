/** Correct the overnight Mark 4 mix without changing the verified picture or source/cast chapter master. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir=getDataDir(), assets=join(dataDir,"assets"), db=getDb();
const picture="generated/chapter/mark4-autonomous-overnight-final-v3.mp4";
const chapter="generated/chapter/mark4-autonomous-overnight-review.mp4";
const bed=db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Quiet looping chapter underscoring' ORDER BY created_at DESC LIMIT 1").get(projectId) as {path:string}|undefined;
const finale=db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Mark 4 post-source dawn-horizon ending' ORDER BY created_at DESC LIMIT 1").get(projectId) as {path:string}|undefined;
if(!bed||!finale)throw Error("Reviewed score assets are unavailable.");
for(const path of [picture,chapter,bed.path,finale.path])if(!existsSync(join(assets,path)))throw Error(`Missing remix input: ${path}`);
const duration=551.292, intro=11.5, chapterDuration=515.792, outroStart=intro+chapterDuration;
const outRel="generated/chapter/mark4-autonomous-overnight-final-v4-narration-priority.mp4",out=join(assets,outRel);
const filter=[
  "[1:a]asetpts=PTS-STARTPTS[chapter]",
  `anullsrc=r=44100:cl=stereo:d=${intro}[introSilence]`,
  "anullsrc=r=44100:cl=stereo:d=24[outroSilence]",
  "[introSilence][chapter][outroSilence]concat=n=3:v=0:a=1[program]",
  // -32 dB bed; it is deliberately perceptible only in source pauses.
  `[2:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=0.025[bed]`,
  // The ending has no spoken source, so it can be clear without masking Scripture.
  `[3:a]atrim=duration=24,asetpts=PTS-STARTPTS,volume=0.55,adelay=${Math.round(outroStart*1000)}:all=1[finale]`,
  "[program][bed][finale]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98:level=false[audio]",
].join(";");
execFileSync("ffmpeg",["-v","error","-y","-i",join(assets,picture),"-i",join(assets,chapter),"-stream_loop","-1","-i",join(assets,bed.path),"-i",join(assets,finale.path),"-filter_complex",filter,"-map","0:v:0","-map","[audio]","-t",String(duration),"-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",out],{stdio:["ignore","ignore","pipe"]});
const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);
if(Math.abs(actual-Math.round(duration*1000))>150)throw Error("Narration-priority remix has the wrong duration.");
const id=randomUUID(); db.exec("BEGIN IMMEDIATE");
try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,166,Date.now());db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"pre_source_title",startMs:0,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:527292},{kind:"post_source_editorial_bridge",startMs:527292,endMs:551292}]),JSON.stringify({chapterMaster:chapter,quietBed:bed.path,chapterBedGain:"-32 dB",endingCue:finale.path,endingCueGain:"-5.2 dB",editorialBridgeMs:24000,narrationPriority:true}));db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({outRel,durationMs:actual,chapterBedGainDb:-32,endingCueGainDb:-5.2},null,2));
