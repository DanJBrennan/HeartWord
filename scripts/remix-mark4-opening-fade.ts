/** Raise the silent opening score, then fade it into the narration-safe Mark 4 mix. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",dataDir=getDataDir(),assets=join(dataDir,"assets"),db=getDb();
const picture="generated/chapter/mark4-autonomous-overnight-final-v6-continuity.mp4",chapter="generated/chapter/mark4-autonomous-overnight-review.mp4";
const bed=db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Quiet looping chapter underscoring' ORDER BY created_at DESC LIMIT 1").get(projectId) as {path:string}|undefined;
const finale=db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Mark 4 post-source dawn-horizon ending' ORDER BY created_at DESC LIMIT 1").get(projectId) as {path:string}|undefined;
if(!bed||!finale)throw Error("Reviewed score is unavailable.");for(const p of [picture,chapter,bed.path,finale.path])if(!existsSync(join(assets,p)))throw Error(`Missing mix input: ${p}`);
const duration=551.292,intro=11.5,chapterDuration=515.792,outroStart=intro+chapterDuration;
const outRel="generated/chapter/mark4-autonomous-overnight-final-v7-opening-fade.mp4",out=join(assets,outRel);
const filter=[
  "[1:a]asetpts=PTS-STARTPTS[chapter]",`anullsrc=r=44100:cl=stereo:d=${intro}[introSilence]`,`anullsrc=r=44100:cl=stereo:d=24[outroSilence]`,"[introSilence][chapter][outroSilence]concat=n=3:v=0:a=1[program]",
  // 0–10.5 seconds: audible title music. 10.5–12 seconds: smooth fade to the -32 dB chapter bed before recorded speech is established.
  `[2:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume='if(lt(t,10.5),0.35,if(lt(t,12),0.35-(t-10.5)*0.2166667,0.025))'[bed]`,
  `[3:a]atrim=duration=24,asetpts=PTS-STARTPTS,volume=0.55,adelay=${Math.round(outroStart*1000)}:all=1[finale]`,
  "[program][bed][finale]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98:level=false[audio]",
].join(";");
execFileSync("ffmpeg",["-v","error","-y","-i",join(assets,picture),"-i",join(assets,chapter),"-stream_loop","-1","-i",join(assets,bed.path),"-i",join(assets,finale.path),"-filter_complex",filter,"-map","0:v:0","-map","[audio]","-t",String(duration),"-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",out],{stdio:["ignore","ignore","pipe"]});
const actual=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);if(Math.abs(actual-Math.round(duration*1000))>150)throw Error("Opening-fade remix has wrong duration.");
const id=randomUUID();db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,actual,166,Date.now());db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"approved_pre_source_lake_title",startMs:0,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:527292},{kind:"post_source_editorial_bridge",startMs:527292,endMs:551292}]),JSON.stringify({pictureBase:picture,chapterMaster:chapter,openingBedGain:"-9.1 dB 0–10.5s; fades to -32 dB by 12s",endingCue:finale.path,endingCueGain:"-5.2 dB",narrationPriority:true}));db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}
console.log(JSON.stringify({outRel,durationMs:actual,openingFade:{from:0,to:12,fullGainDb:-9.1,chapterGainDb:-32}},null,2));
