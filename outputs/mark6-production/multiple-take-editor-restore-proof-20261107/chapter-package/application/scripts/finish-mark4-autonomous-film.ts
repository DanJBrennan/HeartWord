/** Assemble the reviewed Mark 4 source cut with Dan's approved editorial opening, score, and 24-second handoff. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(), assets = join(dataDir, "assets"), db = getDb();
const baseRel = "generated/chapter/mark4-autonomous-overnight-review.mp4";
const bed = db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Quiet looping chapter underscoring' ORDER BY created_at DESC LIMIT 1").get(projectId) as { path: string } | undefined;
const finale = db.prepare("SELECT path FROM production_audio_assets WHERE project_id=? AND description='Mark 4 post-source dawn-horizon ending' ORDER BY created_at DESC LIMIT 1").get(projectId) as { path: string } | undefined;
if (!bed || !finale) throw Error("Reviewed overnight score assets are not yet available.");
const required = [baseRel, bed.path, finale.path, "generated/video/3bcca862-f986-476a-a237-873957b91206.mp4", "generated/editorial/mark4-ending/arrival-dawn.png", "generated/editorial/mark4-ending/walkaway-dawn.png"];
for (const path of required) if (!existsSync(join(assets, path))) throw Error(`Required final asset unavailable: ${path}`);
const outRel = "generated/chapter/mark4-autonomous-overnight-final-v3.mp4", out = join(assets, outRel), intro = join(assets, "generated/editorial/mark4-opening-title.mp4");
mkdirSync(join(assets, "generated", "editorial"), { recursive: true });
const baseDuration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", join(assets,baseRel)], {encoding:"utf8"}).trim());
const introDuration = 11.5, outroDuration = 24, fullDuration = introDuration + baseDuration + outroDuration, outroStart = introDuration + baseDuration;
const font = "C\\:/Windows/Fonts/arial.ttf";
execFileSync("ffmpeg", ["-v","error","-y","-f","lavfi","-i",`color=c=0x101820:s=1280x720:d=${introDuration}:r=24`,"-vf",`drawtext=fontfile='${font}':text='MARK 4':fontcolor=0xF5E6C8:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2-24,drawtext=fontfile='${font}':text='Hatam':fontcolor=0xB6A98A:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2+68`,"-c:v","libx264","-crf","18","-pix_fmt","yuv420p",intro]);
const q = (text:string) => text.replace(/'/g,"'\\\\''");
const filter = [
  "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[v0]",
  "[1:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[v1]",
  "[2:v]trim=duration=6,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setpts=PTS-STARTPTS[v2]",
  "[3:v]scale=1450:816,zoompan=z='min(zoom+0.00025,1.08)':d=144:s=1280x720:fps=24,setpts=PTS-STARTPTS[v3]",
  "[4:v]scale=1450:816,zoompan=z='if(lte(on,1),1.08,max(1.0,1.08-on*0.00028))':d=288:s=1280x720:fps=24,setpts=PTS-STARTPTS[v4]",
  "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[video]",
  `[1:a]asetpts=PTS-STARTPTS[chapter]`,
  `anullsrc=r=44100:cl=stereo:d=${introDuration}[introSilence]`,
  `anullsrc=r=44100:cl=stereo:d=${outroDuration}[outroSilence]`,
  "[introSilence][chapter][outroSilence]concat=n=3:v=0:a=1[program]",
  "[program]asplit=2[programForDuck][programForMix]",
  `[5:a]atrim=duration=${fullDuration.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.20[bed]`,
  "[bed][programForDuck]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=400[duckedBed]",
  `[6:a]atrim=duration=24,asetpts=PTS-STARTPTS,volume=0.80,adelay=${Math.round(outroStart*1000)}:all=1[finale]`,
  "[programForMix][duckedBed][finale]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98:level=false[audio]",
].join(";");
execFileSync("ffmpeg", ["-v","error","-y","-i",intro,"-i",join(assets,baseRel),"-i",join(assets,"generated/video/3bcca862-f986-476a-a237-873957b91206.mp4"),"-loop","1","-framerate","1/6","-t","6","-i",join(assets,"generated/editorial/mark4-ending/arrival-dawn.png"),"-loop","1","-framerate","1/12","-t","12","-i",join(assets,"generated/editorial/mark4-ending/walkaway-dawn.png"),"-stream_loop","-1","-i",join(assets,bed.path),"-i",join(assets,finale.path),"-filter_complex",filter,"-map","[video]","-map","[audio]","-t",fullDuration.toFixed(3),"-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart",out], {stdio:["ignore","ignore","pipe"]});
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",out],{encoding:"utf8"}).trim())*1000);
if (Math.abs(durationMs - Math.round(fullDuration*1000)) > 150) throw Error("Final duration does not match planned source and editorial duration.");
const id = randomUUID();
db.exec("BEGIN IMMEDIATE");
try { db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outRel,durationMs,166,Date.now()); db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify([{kind:"pre_source_title",startMs:0,endMs:11500},{kind:"source_chapter",startMs:11500,endMs:Math.round((11500+baseDuration*1000))},{kind:"post_source_editorial_bridge",startMs:Math.round((11500+baseDuration*1000)),endMs:durationMs}]),JSON.stringify({chapterMaster:baseRel,quietBed:bed.path,endingCue:finale.path,editorialBridgeMs:24000})); db.exec("COMMIT"); } catch(error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ outRel, durationMs, chapterDurationMs:Math.round(baseDuration*1000), introMs:11500, outroMs:24000 }, null, 2));
