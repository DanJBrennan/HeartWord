/** Replace the remaining generic talking-Jesus shore shot with listener cover. */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", fps=24, totalFrames=13447;
const baseRel="generated/chapter/mark4-autonomous-overnight-final-v38-editorial-breaths-held.mp4";
const listenerRel="generated/assembled/91cf250a-92f0-45cc-bf95-6fe627f9b5b1.mp4";
const outputRel="generated/chapter/mark4-autonomous-overnight-final-v39-shore-generic-talk-removed-held.mp4";
// v36 piece four was frames 7036–7211; the v38 Mark 4:9 breath shifts it by 24.
const startFrame=7060, endFrame=7236;
const assets=join(getDataDir(),"assets"), base=join(assets,baseRel), listener=join(assets,listenerRel), output=join(assets,outputRel);
for(const path of [base,listener]) if(!existsSync(path)) throw new Error(`Missing input: ${path}`);
const filters=[
  `[0:v]trim=start_frame=0:end_frame=${startFrame},setpts=PTS-STARTPTS[a]`,
  `[1:v]fps=${fps},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,trim=start_frame=0:end_frame=${endFrame-startFrame},setpts=PTS-STARTPTS[b]`,
  `[0:v]trim=start_frame=${endFrame}:end_frame=${totalFrames},setpts=PTS-STARTPTS[c]`,
  `[a][b][c]concat=n=3:v=1:a=0[video]`
].join(";");
execFileSync("ffmpeg",["-v","error","-y","-i",base,"-i",listener,"-filter_complex",filters,"-map","[video]","-map","0:a:0","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",output],{stdio:"inherit"});
const frames=Number(execFileSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=nb_frames","-of","default=nw=1:nk=1",output],{encoding:"utf8"}).trim());
if(frames!==totalFrames) throw new Error(`Frame lock failed: expected ${totalFrames}, got ${frames}.`);
const db=getDb(), id=randomUUID(), now=Date.now(); db.exec("BEGIN IMMEDIATE");
try { db.prepare("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES (?,?,?,?,?,?)").run(id,projectId,outputRel,Math.round(totalFrames/fps*1000),3,now); db.prepare("INSERT INTO chapter_render_manifests (render_id,timeline_json,source_audio_json) VALUES (?,?,?)").run(id,JSON.stringify({pictureBase:baseRel,replacement:{startFrame,endFrame:endFrame-1,removed:"generic readable talking Jesus",replacement:listenerRel,role:"nonspeaking shore listener cover"}}),JSON.stringify({audioUnchangedFrom:baseRel,rule:"No generic mouth movement is treated as source-bound performance."})); db.exec("COMMIT"); } catch(error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({outputRel,frames,replacement:[startFrame,endFrame-1]},null,2));
