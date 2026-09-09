import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";
const beats = db.prepare(`SELECT id, sequence, beat_type FROM coverage_beats WHERE shot_id = ?`).all(shotId) as any[];
for (const b of beats) {
  const attempts = db.prepare(`SELECT id, provider, model, status, result_asset_path, created_at FROM coverage_keyframe_attempts WHERE coverage_beat_id = ?`).all(b.id) as any[];
  console.log(`beat ${b.sequence} (${b.beat_type}): ${attempts.length} attempt(s)`);
  for (const a of attempts) console.log(`   ${a.provider}/${a.model} ${a.status} -> ${a.result_asset_path}`);
}
