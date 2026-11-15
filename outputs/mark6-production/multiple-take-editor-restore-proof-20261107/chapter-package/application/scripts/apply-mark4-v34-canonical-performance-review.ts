/** Record Dan's individual review decisions for the held canonical Jesus
 * performances. Accepted means accepted as a reusable held take only; it
 * never creates a clip or a chapter-timeline placement. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const accepted = new Set([
  "3-8-beat-1", "3-8-beat-2", "14-20-beat-2", "14-20-beat-3",
  "21-25-beat-1", "21-25-beat-2", "21-25-beat-3", "26-29-beat-1",
  "26-29-beat-2", "30-32-beat-1"
]);
const rejected = new Set([
  "3-8-beat-3", "14-20-beat-1", "14-20-beat-4", "26-29-beat-3", "30-32-beat-2"
]);
if (accepted.size + rejected.size !== 15) throw new Error("Every canonical performance must receive exactly one decision.");
const db = getDb();
const rows = db.prepare(`SELECT ga.id attempt_id, ga.shot_id, s.continuity_notes
  FROM generation_attempts ga JOIN shots s ON s.id=ga.shot_id
  WHERE ga.operation='canonical_v34_lip_sync' AND ga.status='hold_for_review'
  ORDER BY ga.created_at`).all() as Array<{ attempt_id: string; shot_id: string; continuity_notes: string }>;
if (rows.length !== 15) throw new Error(`Expected 15 held canonical performances, found ${rows.length}.`);

db.exec("BEGIN IMMEDIATE");
try {
  for (const row of rows) {
    const key = row.continuity_notes.match(/CANONICAL_JESUS_PERFORMANCE_([^;]+)/)?.[1];
    if (!key || (!accepted.has(key) && !rejected.has(key))) throw new Error(`No review decision recorded for ${key ?? row.shot_id}.`);
    const outcome = accepted.has(key) ? "accepted" : "retry_modified";
    db.prepare("UPDATE generation_attempts SET status=? WHERE id=? AND status='hold_for_review'").run(outcome, row.attempt_id);
    const note = accepted.has(key)
      ? `Dan Brennan approved canonical Jesus lip-sync take ${key}; accepted for later explicit assembly review only.`
      : `Dan Brennan rejected canonical Jesus lip-sync take ${key}: insufficient visible mouth motion. Retry exact source audio from the same approved keyframe and verified face; hold the replacement for review.`;
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)")
      .run(randomUUID(), projectId, "shot", row.shot_id, note, Date.now());
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log(JSON.stringify({ accepted: [...accepted], retry: [...rejected], chapterPlacement: false }, null, 2));
