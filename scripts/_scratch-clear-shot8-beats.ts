import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";

// Confirm no real video/lip-sync generation exists for this shot yet
// (only keyframe-level work) -- safe to fully clear and replan.
const clips = db.prepare(`SELECT COUNT(*) as n FROM clips WHERE shot_id = ?`).get(shotId) as any;
console.log("Existing clips for shot 8 (should be 0):", clips.n);

const beats = db.prepare(`SELECT id, sequence, beat_type, status, keyframe_asset_path FROM coverage_beats WHERE shot_id = ?`).all(shotId) as any[];
console.log(`Clearing ${beats.length} stale coverage_beats rows (keyframe image files on disk are left alone, just orphaned):`);
for (const b of beats) console.log(`  beat ${b.sequence} (${b.beat_type}, ${b.status})`);

db.prepare(`DELETE FROM coverage_beats WHERE shot_id = ?`).run(shotId);
console.log("Cleared.");
