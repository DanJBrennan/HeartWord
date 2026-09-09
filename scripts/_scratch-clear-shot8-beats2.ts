import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";

const beats = db.prepare(`SELECT id FROM coverage_beats WHERE shot_id = ?`).all(shotId) as any[];
let attemptCount = 0;
for (const b of beats) {
  const res = db.prepare(`DELETE FROM coverage_keyframe_attempts WHERE coverage_beat_id = ?`).run(b.id);
  attemptCount += Number(res.changes);
}
const beatRes = db.prepare(`DELETE FROM coverage_beats WHERE shot_id = ?`).run(shotId);
console.log(`Deleted ${attemptCount} coverage_keyframe_attempts rows and ${beatRes.changes} coverage_beats rows for shot 8.`);
