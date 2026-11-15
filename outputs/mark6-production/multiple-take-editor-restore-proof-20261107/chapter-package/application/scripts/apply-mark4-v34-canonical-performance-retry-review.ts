/** Record the producer's review of the five replacement canonical performances.
 * This only changes held-candidate status; it does not alter a chapter cut. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const accepted = new Set(["3-8-beat-3", "14-20-beat-4"]);
const rejected = new Set(["14-20-beat-1", "26-29-beat-3", "30-32-beat-2"]);
const db = getDb();
const rows = db.prepare(`SELECT ga.id attempt_id, ga.shot_id, s.continuity_notes
  FROM generation_attempts ga JOIN shots s ON s.id=ga.shot_id
  WHERE ga.operation='canonical_v34_lip_sync' AND ga.status='hold_for_review'
  ORDER BY ga.created_at`).all() as Array<{ attempt_id: string; shot_id: string; continuity_notes: string }>;
if (rows.length !== 5) throw new Error(`Expected exactly five held replacements, found ${rows.length}.`);

db.exec("BEGIN IMMEDIATE");
try {
  for (const row of rows) {
    const key = row.continuity_notes.match(/CANONICAL_JESUS_PERFORMANCE_([^;]+)/)?.[1];
    if (!key || (!accepted.has(key) && !rejected.has(key))) throw new Error(`No second-review decision for ${key ?? row.shot_id}.`);
    const isAccepted = accepted.has(key);
    db.prepare("UPDATE generation_attempts SET status=? WHERE id=? AND status='hold_for_review'")
      .run(isAccepted ? "accepted" : "retry_modified", row.attempt_id);
    const note = isAccepted
      ? `Dan Brennan approved replacement canonical Jesus performance ${key}${key === "14-20-beat-4" ? "; borderline mouth/head motion, retain review note for future coverage standards." : "."}`
      : `Dan Brennan rejected replacement canonical Jesus performance ${key}: face is too distant for readable mouth opening/head motion. Do not retry the same base; prepare a closer canonical keyframe for producer review.`;
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)")
      .run(randomUUID(), projectId, "shot", row.shot_id, note, Date.now());
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log(JSON.stringify({ accepted: [...accepted], needsCloserKeyframe: [...rejected], chapterPlacement: false }, null, 2));
