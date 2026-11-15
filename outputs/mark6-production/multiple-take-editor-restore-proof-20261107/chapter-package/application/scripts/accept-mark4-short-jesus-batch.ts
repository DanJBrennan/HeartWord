/** Record Dan's approval of the bounded seven-shot Mark 4 Jesus batch.
 * Acceptance is limited to held source-bound performances; it never places
 * media on the chapter timeline or converts their different settings into a cut. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

type Item = { key: string; shotId: string; label: string };
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const dataDir = getDataDir(); const db = getDb();
const manifest = JSON.parse(readFileSync(join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json"), "utf8")) as { items: Item[] };
if (manifest.items.length !== 7) throw Error("Approval requires the exact seven-shot batch.");
const reelPath = "generated/chapter/mark4-short-jesus-batch-review.mp4";
const reel = db.prepare(`SELECT id,status FROM generation_attempts WHERE operation='assemble_coverage_pilot' AND result_asset_path=?
  ORDER BY created_at DESC LIMIT 1`).get(reelPath) as { id: string; status: string } | undefined;
if (!reel || !["hold_for_review", "accepted"].includes(reel.status)) throw Error("The held seven-shot review reel is unavailable.");
const takes = manifest.items.map(item => {
  const take = db.prepare(`SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { id: string; status: string } | undefined;
  if (!take || !["hold_for_review", "accepted"].includes(take.status)) throw Error(`Held performance is unavailable for ${item.label}.`);
  const timeline = db.prepare("SELECT COUNT(*) n FROM clips WHERE generation_attempt_id=?").get(take.id) as { n: number };
  if (timeline.n !== 0) throw Error(`${item.label} already has a timeline placement.`);
  return { ...item, takeId: take.id };
});
const reelTimeline = db.prepare("SELECT COUNT(*) n FROM clips WHERE generation_attempt_id=?").get(reel.id) as { n: number };
if (reelTimeline.n !== 0) throw Error("The review reel must not have a timeline placement.");
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(reel.id);
  for (const take of takes) {
    db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(take.takeId);
    const note = `Dan Brennan approved the held Mark 4 short-Jesus performance for ${take.label}. It remains an independent source-bound take; its setting and angle are not an authorization to concatenate it with another verse or select it into the chapter timeline.`;
    if (!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='human' AND note=?").get(projectId, take.shotId, note)) {
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,1,?)")
        .run(randomUUID(), projectId, "shot", take.shotId, note, Date.now());
    }
  }
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }
console.log(JSON.stringify({ accepted: takes.map(take => take.key), timelineClips: 0, reelAccepted: true }, null, 2));
