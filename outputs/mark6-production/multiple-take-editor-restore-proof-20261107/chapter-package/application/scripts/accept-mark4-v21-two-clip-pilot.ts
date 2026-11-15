/** Record Dan's approval of the bounded Mark 4:21 pilot reel. This marks
 * only the review reel accepted; it never creates a chapter timeline clip. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId = "611a8078-e67e-47c3-9cff-8c920809798e";
const reelPath = "generated/chapter/mark4-v21-two-clip-pilot-review.mp4";
const db = getDb();
const reel = db.prepare(`SELECT id,status FROM generation_attempts
  WHERE shot_id=? AND operation='assemble_coverage_pilot' AND result_asset_path=?
  ORDER BY created_at DESC LIMIT 1`).get(shotId, reelPath) as { id: string; status: string } | undefined;
if (!reel || !["hold_for_review", "accepted"].includes(reel.status)) throw Error("The exact Mark 4:21 review reel is unavailable for approval.");
const lipSync = db.prepare(`SELECT COUNT(*) n FROM generation_attempts
  WHERE shot_id=? AND operation='lip_sync' AND status='hold_for_review'
  AND prompt LIKE 'Mark 4:21 two-clip pilot segment 2%'`).get(shotId) as { n: number };
if (lipSync.n !== 1) throw Error(`Expected one held Mark 4:21 Jesus lip-sync clip, found ${lipSync.n}.`);
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(reel.id);
  const note = "Dan Brennan approved the Mark 4:21 two-clip source-bound pilot review reel: automated natural-pause cut at 3680 ms, with the mouth-hidden opening master from 0-3680 ms and visually verified Jesus lip sync from 3680-8396 ms. This is a held pilot approval only; no chapter timeline clip was selected.";
  if (!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='human' AND note=?").get(projectId, shotId, note)) {
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,1,?)")
      .run(randomUUID(), projectId, "shot", shotId, note, Date.now());
  }
  const timeline = db.prepare("SELECT COUNT(*) n FROM clips WHERE generation_attempt_id=?").get(reel.id) as { n: number };
  if (timeline.n !== 0) throw Error("Pilot review reel must not select a chapter timeline clip.");
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ reelAttemptId: reel.id, accepted: true, timelineClips: 0, cutMs: 3680 }, null, 2));
