/** Commit reviewed source-timed picture beats as editable clips, not flattened videos. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const project = "0b386bfc-7919-4f40-91af-e198508a8267";
const db = getDb(), root = join(getDataDir(), "assets");
const scene = Number(process.argv[2]);
if (![3, 4, 5].includes(scene)) throw new Error("Usage: scene number 3, 4, or 5.");
const version = scene === 4 ? 2 : 1;
const reviewPath = `generated/video/review/mark3-scene${scene}-full-source-review-r${version}.mp4`;
const manifestPath = reviewPath.replace(/\.mp4$/, ".json");
const key = `mark3-scene${scene}-complete-source-picture-coverage-r${version}`;
const existing = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(project,key) as {payload:string}|undefined;
if (existing) { console.log(existing.payload); process.exit(0); }
for (const path of [reviewPath, manifestPath]) if (!existsSync(join(root,path))) throw new Error(`Review missing: ${path}`);
type Beat = { start:number; end:number; shot:number; attempt?:string; still?:string; crop?:string; path:string; normalizedPath:string; frames:number };
const manifest = JSON.parse(readFileSync(join(root,manifestPath),"utf8")) as {
  scene:number; sourceStartMs:number; sourceEndMs:number; picture:Beat[];
  cast:Array<{shotId:string;startMs:number;endMs:number;path:string}>;
};
const spans:Record<number,[number,number,number]> = {3:[172258,245262,4],4:[245262,371645,8],5:[371645,429852,5]};
const [start,end,count] = spans[scene]!;
if (manifest.scene !== scene || manifest.sourceStartMs !== start || manifest.sourceEndMs !== end || manifest.picture.length < count) throw new Error("Review manifest source span changed.");
const sceneRow = db.prepare("SELECT id FROM scenes WHERE project_id=? AND sequence=?").get(project,scene) as {id:string}|undefined;
if (!sceneRow) throw new Error("Scene missing.");
const originals = db.prepare("SELECT id,sequence,needs_lip_sync,action,verse_ref FROM shots WHERE scene_id=? ORDER BY sequence")
  .all(sceneRow.id) as Array<{id:string;sequence:number;needs_lip_sync:number;action:string;verse_ref:string}>;
if (originals.length !== count || originals.some((s,i)=>s.sequence!==i+1)) throw new Error("Original shot plan already changed.");
const existingClips = db.prepare("SELECT COUNT(*) AS n FROM clips c JOIN shots sh ON sh.id=c.shot_id WHERE sh.scene_id=?").get(sceneRow.id) as {n:number};
if (existingClips.n) throw new Error("This scene already has selected clips; refusing duplicate selection.");
const chosenOriginal = new Map<number,number>();
for (const [i,b] of manifest.picture.entries()) if (!chosenOriginal.has(b.shot)) chosenOriginal.set(b.shot,i);
if (scene === 4) chosenOriginal.set(8,manifest.picture.map(b=>b.shot).lastIndexOf(8));
if (scene === 5) { chosenOriginal.set(2,4); chosenOriginal.set(3,6); }
let cursor = start, totalFrames = 0;
const donors = new Set<string>();
for (const beat of manifest.picture) {
  const parent = originals[beat.shot-1];
  if (!parent || beat.start !== cursor || beat.end <= beat.start || !existsSync(join(root,beat.normalizedPath))) throw new Error("Coverage gap or missing normalized beat.");
  const actual = execFileSync("ffprobe",["-v","error","-select_streams","v:0","-count_frames","-show_entries","stream=nb_read_frames","-of","default=noprint_wrappers=1:nokey=1",join(root,beat.normalizedPath)],{encoding:"utf8"});
  if (Number(actual.trim()) !== beat.frames) throw new Error(`Frame count changed for ${beat.normalizedPath}`);
  if (beat.attempt) {
    const donor = db.prepare("SELECT shot_id,status,result_asset_path,operation FROM generation_attempts WHERE id=?").get(beat.attempt) as {shot_id:string;status:string;result_asset_path:string|null;operation:string}|undefined;
    if (!donor || donor.shot_id !== parent.id || donor.status !== "hold_for_review" || donor.result_asset_path !== beat.path || !["generate_final_video","lip_sync"].includes(donor.operation)) throw new Error(`Donor changed: ${beat.attempt}`);
    donors.add(beat.attempt);
  } else {
    const keyframe = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(parent.id) as {result_asset_path:string|null}|undefined;
    if (!keyframe?.result_asset_path || keyframe.result_asset_path !== beat.path) throw new Error("Approved still changed.");
  }
  cursor = beat.end;
  totalFrames += beat.frames;
}
if (cursor !== end || totalFrames !== Math.round((end-start)*24/1000) || chosenOriginal.size !== count) throw new Error("Reviewed picture does not cover all original shots and source time.");
const probe = execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",join(root,reviewPath)],{encoding:"utf8"});
if (Math.abs(Number(probe.trim())*1000-(end-start)) > 30) throw new Error("Review duration changed.");
const now = Date.now();
const selected:Array<{sequence:number;shotId:string;parentShotId:string;start:number;end:number;path:string;donor:string|null;mode:string}> = [];
db.exec("BEGIN IMMEDIATE");
try {
  for (const original of originals) db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(100+original.sequence,original.id);
  for (const [i,beat] of manifest.picture.entries()) {
    const parent = originals[beat.shot-1]!;
    const isOriginal = chosenOriginal.get(beat.shot) === i;
    const shotId = isOriginal ? parent.id : randomUUID();
    const donor = beat.attempt ? db.prepare("SELECT operation FROM generation_attempts WHERE id=?").get(beat.attempt) as {operation:string} : null;
    const lipsync = donor?.operation === "lip_sync";
    if (isOriginal) {
      db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(i+1,shotId);
    } else {
      const action = beat.shot === 8 && scene === 4 ? "The principal scribe and listeners react while Jesus continues speaking offscreen." :
        beat.still ? `Source-grounded visual continuation of planned Shot ${beat.shot}; approved still with restrained editorial pan.` :
        `Source-grounded visual continuation of planned Shot ${beat.shot}; reviewed motion coverage.`;
      db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,coverage_notes,crowd_density,continuity_notes,spatial_view,status,created_at)
        SELECT ?,scene_id,?,?,verse_ref,framing,camera_movement,?,CASE WHEN ?=1 THEN dialogue_character_id ELSE NULL END,'single_clip',?,crowd_density,continuity_notes,spatial_view,'keyframe_approved',? FROM shots WHERE id=?`)
        .run(shotId,i+1,action,lipsync?1:0,lipsync?1:0,`Source ${beat.start}–${beat.end} ms. Donor ${beat.attempt ?? "approved still"}. The cast/source soundtrack remains continuous through this picture edit.`,now,parent.id);
      db.prepare("INSERT INTO shot_characters (shot_id,character_id) SELECT ?,character_id FROM shot_characters WHERE shot_id=?").run(shotId,parent.id);
      const frame = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(parent.id) as {result_asset_path:string}|undefined;
      if (!frame) throw new Error("Parent approved keyframe missing.");
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','approved-source-keyframe','generate','16:9',?,'accepted',?,0,?)")
        .run(randomUUID(),shotId,`Inherited approved keyframe from planned Shot ${beat.shot}; no new canon content.`,frame.result_asset_path,now);
      if (lipsync) {
        const bound = db.prepare("SELECT source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash FROM shot_utterance_bindings WHERE shot_id=?").get(parent.id) as {source_audio_segment_id:string;source_start_ms:number;source_end_ms:number;character_version_id:string;source_hash:string}|undefined;
        if (!bound || beat.start < bound.source_start_ms || beat.end > bound.source_end_ms) throw new Error("Lip-sync coverage exceeds approved binding.");
        db.prepare("INSERT INTO shot_utterance_bindings (id,shot_id,source_audio_segment_id,source_start_ms,source_end_ms,character_version_id,source_hash,approved_at,approved_by) VALUES (?,?,?,?,?,?,?,?,?)")
          .run(randomUUID(),shotId,bound.source_audio_segment_id,beat.start,beat.end,bound.character_version_id,bound.source_hash,now,"codex_source_timed_derivation");
      }
    }
    const id = randomUUID();
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','reviewed-source-timed-beat','generate_final_video','720p',?,'accepted',?,0,?)")
      .run(id,shotId,`Reviewed Scene ${scene} beat ${i+1}; donor ${beat.attempt ?? "approved still"}, source ${beat.start}–${beat.end} ms. Provider audio removed; approved original/composite cast soundtrack assembled separately. ${beat.crop ? "Crop hides nonspeaking Jesus during offscreen line." : ""}`,beat.normalizedPath,now);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)")
      .run(randomUUID(),shotId,id,beat.end-beat.start,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(),project,shotId,`Reviewed source-timed beat ${beat.start}–${beat.end} ms: ${beat.still ? "approved still with local pan" : "generated motion/lip-sync"}; no provider audio; preserved Papuan canon and causal action. ${beat.crop ? "Speaker's stationary mouth excluded while speech continues." : ""}`,now);
    selected.push({sequence:i+1,shotId,parentShotId:parent.id,start:beat.start,end:beat.end,path:beat.normalizedPath,donor:beat.attempt??null,mode:beat.still??beat.crop??"motion"});
  }
  for (const id of donors) db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=? AND status='hold_for_review'").run(id);
  if (scene === 4) {
    for (const id of ["186ac2aa-d101-4a1d-a62b-63b5d970532e","43a9c4bd-7d07-4364-b622-cca54187f0e2"])
      db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=? AND status='hold_for_review'").run(id);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(),project,originals[1]!.id,"Rejected two doorway motion takes: one added unsupported food props and one introduced a doorway crossing. Selected approved-still pan to preserve the planned scene.",now);
    db.prepare("UPDATE shots SET coverage_notes=COALESCE(coverage_notes,'')||? WHERE id=?")
      .run(" Reviewed reaction is placed in the last seven source seconds of Jesus' warning; listener crop excludes Jesus' stationary mouth.",originals[7]!.id);
  }
  if (scene === 5) db.prepare("UPDATE shots SET coverage_plan='single_clip',coverage_notes=? WHERE id=?")
    .run("Approved final source binding is 427645–429852 ms (2.207s); the earlier 16.2s planning note was stale. One reviewed lip-synced clip covers the exact source line.",originals[4]!.id);
  const sequence = Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(project) as {n:number}).n);
  const rationale = "Reviewed all selected picture candidates at sampled frames; source-timed normalized clips retain independently editable shot provenance. Original Hatam narration and approved composite cast audio are continuous under picture cuts. " +
    (scene === 4 ? "Offscreen listener coverage hides Jesus's stationary mouth; unsupported doorway actions were rejected." :
      scene === 5 ? "Two source-bound seven-second Jesus inserts cover the continuous long turn; the short closing line remains exact." :
      "The sole spoken appointment line uses its approved source-bound lip-sync candidate.");
  const payload = JSON.stringify({scene,sourceStartMs:start,sourceEndMs:end,review:reviewPath,selected,rationale});
  db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)")
    .run(randomUUID(),project,sequence,"insert_source_timed_scene_coverage",payload,key,now);
  db.exec("COMMIT");
  console.log(payload);
} catch (error) { db.exec("ROLLBACK"); throw error; }
