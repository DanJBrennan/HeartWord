/** Retain the approved opening clips and select four independently editable coverage shots. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const project = "0b386bfc-7919-4f40-91af-e198508a8267", key = "mark3-scene1-opening-source-coverage-r1";
const db = getDb(), root = join(getDataDir(), "assets");
const prior = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(project, key) as { payload: string } | undefined;
if (prior) { console.log(prior.payload); process.exit(0); }
const review = "generated/video/review/mark3-scene1-opening-full-source-review-r1.mp4";
const manifestPath = review.replace(/\.mp4$/, ".json");
if (!existsSync(join(root, review)) || !existsSync(join(root, manifestPath))) throw new Error("Opening review missing.");
type Beat = { start: number; end: number; shot: number; kind: string; path: string; normalizedPath: string; frames: number };
const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8")) as { sourceStartMs: number; sourceEndMs: number; picture: Beat[] };
if (manifest.sourceStartMs !== 0 || manifest.sourceEndMs !== 41733 || manifest.picture.length !== 7 ||
  manifest.picture.some((b, i) => b.start !== (i ? manifest.picture[i - 1]!.end : 0) || b.end <= b.start) ||
  manifest.picture.at(-1)!.end !== 41733) throw new Error("Opening source coverage changed.");
const scene = db.prepare("SELECT id FROM scenes WHERE project_id=? AND sequence=1").get(project) as { id: string } | undefined;
if (!scene) throw new Error("Scene 1 missing.");
const parents = db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? AND sequence<=3 ORDER BY sequence").all(scene.id) as Array<{ id: string; sequence: number }>;
if (parents.length !== 3 || parents.some((s, i) => s.sequence !== i + 1)) throw new Error("Opening original order changed.");
const trailing = db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? AND sequence>=4 ORDER BY sequence").all(scene.id) as Array<{ id: string; sequence: number }>;
if (trailing.length !== 8 || trailing.some((s, i) => s.sequence !== i + 4)) throw new Error("Scene 1 closing order changed.");
for (const [i, b] of manifest.picture.entries()) {
  if (!existsSync(join(root, b.normalizedPath))) throw new Error(`Missing reviewed beat ${i + 1}`);
  const parent = parents[b.shot - 1];
  if (!parent) throw new Error(`Unknown parent for beat ${i + 1}`);
  const donor = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND result_asset_path=? AND status='accepted' ORDER BY created_at DESC LIMIT 1")
    .get(parent.id, b.path);
  if (!donor) throw new Error(`Approved donor changed for beat ${i + 1}`);
}
const now = Date.now();
const selected: Array<{ sequence: number; shotId: string; parentShotId: string; start: number; end: number; picture: string }> = [];
db.exec("BEGIN IMMEDIATE");
try {
  for (const shot of parents) db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(100 + shot.sequence, shot.id);
  for (const shot of [...trailing].reverse()) db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(shot.sequence + 4, shot.id);
  for (const [i, b] of manifest.picture.entries()) {
    const parent = parents[b.shot - 1]!;
    const original = i === 1 || i === 3 || i === 5;
    const shotId = original ? parent.id : randomUUID();
    if (original) db.prepare("UPDATE shots SET sequence=? WHERE id=?").run(i + 1, shotId);
    else {
      const rationale = i === 6 ? "The approved observing scribes are shown while Jesus continues speaking offscreen; no stationary Jesus mouth is exposed." :
        i === 0 ? "Approved synagogue establishing image covers the original chapter heading and lead-in." :
        "Restrained pan of the approved image covers measured narrator-clock picture shortfall without new story action.";
      db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,coverage_notes,crowd_density,continuity_notes,spatial_view,status,created_at)
        SELECT ?,scene_id,?,action,verse_ref,framing,camera_movement,0,NULL,'single_clip',?,crowd_density,continuity_notes,spatial_view,'keyframe_approved',? FROM shots WHERE id=?`)
        .run(shotId, i + 1, `Source ${b.start}–${b.end} ms. ${rationale}`, now, parent.id);
      db.prepare("INSERT INTO shot_characters (shot_id,character_id) SELECT ?,character_id FROM shot_characters WHERE shot_id=?").run(shotId, parent.id);
      const still = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
        .get(parent.id) as { result_asset_path: string };
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','approved-source-keyframe','generate','16:9',?,'accepted',?,0,?)")
        .run(randomUUID(), shotId, rationale, still.result_asset_path, now);
      const attemptId = randomUUID();
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','reviewed-source-timed-pan','generate_final_video','720p',?,'accepted',?,0,?)")
        .run(attemptId, shotId, rationale, b.normalizedPath, now);
      db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)")
        .run(randomUUID(), shotId, attemptId, b.end - b.start, now);
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
        .run(randomUUID(), project, shotId, rationale, now);
      const assembled = `generated/assembled/${shotId}.mp4`;
      mkdirSync(join(root, "generated/assembled"), { recursive: true });
      copyFileSync(join(root, b.normalizedPath), join(root, assembled));
      const assemblyId = randomUUID();
      db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','source-clock-picture-assembly','assemble_shot','720p',?,'accepted',?,0,?)")
        .run(assemblyId, shotId, `Silent independently editable picture for source ${b.start}–${b.end} ms; audio stays continuous in scene mix.`, assembled, now);
      db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,?,?)")
        .run(randomUUID(), shotId, assemblyId, b.end - b.start, now);
    }
    selected.push({ sequence: i + 1, shotId, parentShotId: parent.id, start: b.start, end: b.end, picture: b.normalizedPath });
  }
  const sequence = Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(project) as { n: number }).n);
  const payload = JSON.stringify({ sourceStartMs: 0, sourceEndMs: 41733, review, selected,
    rationale: "Approved Scene 1 motion and Shot 3 lip-sync remain unchanged. Four local pans cover chapter heading, two narration gaps, and Jesus's offscreen continued line. Original and approved cast audio remain continuous; no invented speech or action." });
  db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)")
    .run(randomUUID(), project, sequence, "insert_source_timed_scene_coverage", payload, key, now);
  db.exec("COMMIT");
  console.log(payload);
} catch (e) { db.exec("ROLLBACK"); throw e; }
