/** Assemble selected beats independently, using approved source bindings for dialogue. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const project = "0b386bfc-7919-4f40-91af-e198508a8267";
const scene = Number(process.argv[2]);
if (![3,4,5].includes(scene)) throw new Error("Usage: scene number 3, 4, or 5.");
const db = getDb(), root = join(getDataDir(),"assets");
const key = `mark3-scene${scene}-complete-source-picture-coverage-r${scene === 4 ? 2 : 1}`;
const command = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=? AND undone=0").get(project,key) as {payload:string}|undefined;
if (!command) throw new Error("Reviewed scene selection is missing.");
const payload = JSON.parse(command.payload) as {sourceStartMs:number;selected:Array<{sequence:number;shotId:string;start:number;end:number;path:string}>};
const selected = payload.selected;
for (const beat of selected) {
  const prior = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
    .get(beat.shotId) as {result_asset_path:string|null}|undefined;
  if (prior?.result_asset_path && existsSync(join(root,prior.result_asset_path))) { console.log(JSON.stringify({sequence:beat.sequence,reused:true,path:prior.result_asset_path})); continue; }
  const shot = db.prepare("SELECT needs_lip_sync FROM shots WHERE id=?").get(beat.shotId) as {needs_lip_sync:number}|undefined;
  const clip = db.prepare("SELECT ga.result_asset_path,c.timeline_end_ms FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.shot_id=? AND ga.operation='generate_final_video' AND ga.status='accepted' ORDER BY ga.created_at DESC LIMIT 1")
    .get(beat.shotId) as {result_asset_path:string;timeline_end_ms:number}|undefined;
  if (!shot || !clip || clip.result_asset_path !== beat.path || clip.timeline_end_ms !== beat.end-beat.start || !existsSync(join(root,beat.path))) throw new Error(`Selected beat changed: ${beat.sequence}`);
  const out = `generated/assembled/${beat.shotId}.mp4`, abs = join(root,out);
  mkdirSync(join(root,"generated/assembled"),{recursive:true});
  if (shot.needs_lip_sync) {
    const bound = db.prepare(`SELECT ub.source_start_ms,ub.source_end_ms,ub.source_hash,o.source_path AS original_path,o.start_ms AS original_start,o.end_ms AS original_end,
        m.source_hash AS mapped_hash,a.source_path AS composite_path,a.start_ms AS composite_start,a.end_ms AS composite_end
      FROM shot_utterance_bindings ub JOIN audio_segments o ON o.id=ub.source_audio_segment_id
      JOIN composite_audio_source_map m ON m.original_segment_id=o.id
      JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=o.project_id AND a.layer='composite_cast_master'
      WHERE ub.shot_id=? AND o.project_id=?`).get(beat.shotId,project) as {
        source_start_ms:number;source_end_ms:number;source_hash:string;original_path:string;original_start:number;original_end:number;
        mapped_hash:string;composite_path:string;composite_start:number;composite_end:number;
      }|undefined;
    if (!bound || bound.source_hash !== bound.mapped_hash || beat.start < bound.source_start_ms || beat.end > bound.source_end_ms) throw new Error("Source-locked dialogue binding changed.");
    const original = join(root,bound.original_path), cast = join(root,bound.composite_path);
    if (!existsSync(original) || !existsSync(cast) || createHash("sha256").update(readFileSync(original)).digest("hex") !== bound.source_hash) throw new Error("Approved source hash or cast asset changed.");
    const scale = (bound.composite_end-bound.composite_start)/(bound.original_end-bound.original_start);
    const sliceStart = bound.composite_start+(beat.start-bound.original_start)*scale;
    const sliceEnd = bound.composite_start+(beat.end-bound.original_start)*scale;
    if (sliceStart < bound.composite_start-1 || sliceEnd > bound.composite_end+1) throw new Error("Mapped cast slice exceeds source segment.");
    const duration = ((beat.end-beat.start)/1000).toFixed(3);
    const filter = `[1:a]atrim=start=${(sliceStart/1000).toFixed(3)}:end=${(sliceEnd/1000).toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=${duration}[a]`;
    execFileSync("ffmpeg",["-v","error","-y","-i",join(root,beat.path),"-i",cast,"-filter_complex",filter,"-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k",abs],{stdio:["ignore","ignore","pipe"],timeout:120000});
  } else copyFileSync(join(root,beat.path),abs);
  const frames = Number(execFileSync("ffprobe",["-v","error","-select_streams","v:0","-count_frames","-show_entries","stream=nb_read_frames","-of","default=noprint_wrappers=1:nokey=1",abs],{encoding:"utf8"}).trim());
  const targetFrames = Math.round((beat.end-payload.sourceStartMs)*24/1000)-Math.round((beat.start-payload.sourceStartMs)*24/1000);
  if (frames !== targetFrames) throw new Error(`Assembled frame count mismatch for beat ${beat.sequence}: ${frames} versus ${targetFrames}`);
  const now = Date.now(), id=randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','ffmpeg-source-bound-assembly','assemble_shot','1280x720',?,'accepted',?,0,?)")
      .run(id,beat.shotId,`Scene ${scene} beat ${beat.sequence} source ${beat.start}–${beat.end} ms. ${shot.needs_lip_sync ? "Approved composite cast slice muxed by immutable original-source mapping." : "Silent picture beat for continuous scene soundtrack."}`,out,now);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)")
      .run(randomUUID(),beat.shotId,id,beat.end-beat.start,now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({sequence:beat.sequence,path:out,dialogue:!!shot.needs_lip_sync}));
}
