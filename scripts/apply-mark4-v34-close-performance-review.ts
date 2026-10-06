/** Record the producer's review of the three close-up performance candidates.
 * Rejection of the mustard take preserves its approved still but marks the
 * frozen-motion base and derived lip-sync take as retryable. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const accepted = new Set(["14-20-beat-1", "26-29-beat-3"]);
const rejected = "30-32-beat-2";
const db = getDb();
db.exec("BEGIN IMMEDIATE");
try {
  for (const key of accepted) {
    const shot = db.prepare("SELECT id FROM shots WHERE continuity_notes LIKE ?").get(`CANONICAL_JESUS_PERFORMANCE_${key};%`) as { id: string } | undefined;
    if (!shot) throw new Error(`Missing ${key}.`);
    const lip = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_lip_sync' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(shot.id) as { id: string } | undefined;
    if (!lip) throw new Error(`Missing held close lip-sync ${key}.`);
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(lip.id);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)")
      .run(randomUUID(), projectId, "shot", shot.id, `Dan Brennan approved closer canonical Jesus performance ${key}; accepted for later explicit assembly review only.`, Date.now());
  }
  const shot = db.prepare("SELECT id FROM shots WHERE continuity_notes LIKE ?").get(`CANONICAL_JESUS_PERFORMANCE_${rejected};%`) as { id: string } | undefined;
  if (!shot) throw new Error(`Missing ${rejected}.`);
  for (const operation of ["canonical_v34_close_base", "canonical_v34_close_lip_sync"] as const) {
    const row = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation=? AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(shot.id, operation) as { id: string } | undefined;
    if (!row) throw new Error(`Missing held ${operation} for ${rejected}.`);
    db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=?").run(row.id);
  }
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)")
    .run(randomUUID(), projectId, "shot", shot.id, "Dan Brennan rejected close mustard performance: unblinking face, no head movement, and frozen raised hand. Keep approved close keyframe; regenerate base motion with a natural blink, subtle head motion, and completed restrained hand gesture before exact source-audio lip-sync.", Date.now());
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ accepted: [...accepted], retryBaseAndLipSync: rejected, chapterPlacement: false }, null, 2));
