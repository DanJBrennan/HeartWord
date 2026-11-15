/** Promote only Dan-approved closer keyframes to accepted still assets. The
 * prior wide keyframes and their rejected lip-sync history remain retained. */
import { getDb } from "../src/db/client.js";

const keys = ["14-20-beat-1", "26-29-beat-3", "30-32-beat-2"];
const db = getDb();
db.exec("BEGIN IMMEDIATE");
try {
  for (const key of keys) {
    const shot = db.prepare("SELECT id FROM shots WHERE continuity_notes LIKE ?").get(`CANONICAL_JESUS_PERFORMANCE_${key};%`) as { id: string } | undefined;
    if (!shot) throw new Error(`Missing canonical performance shot ${key}.`);
    const row = db.prepare("SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_keyframe' ORDER BY created_at DESC LIMIT 1").get(shot.id) as { id: string; status: string } | undefined;
    if (!row || row.status !== "hold_for_review") throw new Error(`${key} lacks a held close-keyframe candidate.`);
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(row.id);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log(JSON.stringify({ acceptedCloseKeyframes: keys, chapterPlacement: false }, null, 2));
