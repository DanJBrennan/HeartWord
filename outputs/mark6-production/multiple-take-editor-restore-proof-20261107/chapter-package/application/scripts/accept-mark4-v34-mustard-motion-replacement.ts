/** Record Dan's approval of the final closer mustard performance. This accepts
 * the held candidate for later explicit assembly only; no clip or chapter-cut
 * placement is created here. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const key = "30-32-beat-2";
const db = getDb();
const shot = db.prepare("SELECT id FROM shots WHERE continuity_notes LIKE ?").get(`CANONICAL_JESUS_PERFORMANCE_${key};%`) as { id: string } | undefined;
if (!shot) throw new Error(`Missing ${key}.`);
const take = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_lip_sync' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(shot.id) as { id: string } | undefined;
if (!take) throw new Error(`No held mustard motion replacement found.`);
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(take.id);
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,0,?)")
    .run(randomUUID(), projectId, "shot", shot.id, "Dan Brennan approved the closer mustard-performance motion replacement, including the natural blink, head movement, and completed hand gesture. Accepted for later explicit assembly review only.", Date.now());
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ accepted: key, chapterPlacement: false }, null, 2));
