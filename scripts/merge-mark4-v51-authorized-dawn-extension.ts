/** Merge Dan's authorized v40 two-shot dawn pull-away into the current held cut.
 * Chapter picture and the full source/cast audio program are untouched; only a
 * post-source, wordless 16-second picture-and-music tail is appended. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0", fps = 24, baseFrames = 13447, tailFrames = 384;
const baseRel = "generated/chapter/mark4-autonomous-overnight-final-v53-short-run-cleanup-held.mp4";
const tailRel = "generated/editorial/mark4-ending/held-extension-pullaways-v1.mp4";
const outputRel = "generated/chapter/mark4-autonomous-overnight-final-v54-cleanup-and-dawn-extension-held.mp4";
const data = getDataDir(), assets = join(data,"assets"), base = join(assets,baseRel), tail = join(assets,tailRel), output = join(assets,outputRel);
for (const path of [base,tail]) if (!existsSync(path)) throw new Error(`Missing authorized ending input: ${path}`);
execFileSync("ffmpeg", ["-v","error","-y","-i",base,"-i",tail,"-filter_complex", `[0:v]setpts=PTS-STARTPTS[v0];[1:v]fps=${fps},setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[video];[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];[1:a]aresample=48000,aformat=channel_layouts=stereo[a1];[a0][a1]concat=n=2:v=0:a=1[audio]`,"-map","[video]","-map","[audio]","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-ar","48000","-ac","2","-b:a","192k","-movflags","+faststart",output],{stdio:"inherit"});
const frames = Number(execFileSync("ffprobe",["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());
const rate = Number(execFileSync("ffprobe",["-v","error","-select_streams","a:0","-show_entries","stream=sample_rate","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());
if(frames!==baseFrames+tailFrames) throw new Error(`Expected ${baseFrames+tailFrames} frames, got ${frames}.`); if(rate!==48000) throw new Error(`Expected 48 kHz, got ${rate}.`);
const db=getDb(), id=randomUUID(), now=Date.now(); db.exec("BEGIN IMMEDIATE"); try { db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,Math.round(frames/fps*1000),126,now); db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({heldForReview:true,pictureBase:baseRel,postSourceDawnExtension:{startFrame:baseFrames,endFrame:frames-1,clips:2,durationFrames:tailFrames}}),JSON.stringify({sourceCastProgram:baseRel,sourceCastAudioUnchangedBeforeFrame:baseFrames,postSourceMusic:tailRel,deliverySampleRateHz:48000}));db.exec("COMMIT"); } catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({outputRel,frames,rate,heldForReview:true},null,2));
