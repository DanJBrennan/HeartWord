import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();

const beatStatus = db.prepare(`SELECT status, COUNT(*) as n FROM coverage_beats GROUP BY status`).all();
console.log("Coverage beat status:", JSON.stringify(beatStatus, null, 2));

const needKeyframe = db.prepare(`
  SELECT COUNT(*) as n FROM coverage_beats WHERE requires_new_keyframe = 1 AND keyframe_asset_path IS NULL
`).get();
console.log("Still needing a new keyframe:", JSON.stringify(needKeyframe));

const withKeyframe = db.prepare(`
  SELECT sc.sequence as scene, s.sequence as shot, s.verse_ref, cb.sequence as beat, cb.beat_type, cb.status, cb.keyframe_asset_path
  FROM coverage_beats cb JOIN shots s ON s.id = cb.shot_id JOIN scenes sc ON sc.id = s.scene_id
  WHERE cb.keyframe_asset_path IS NOT NULL
  ORDER BY sc.sequence, s.sequence, cb.sequence
`).all();
console.log("\nBeats with a keyframe already:", JSON.stringify(withKeyframe, null, 2));

const shotStatus = db.prepare(`SELECT status, COUNT(*) as n FROM shots GROUP BY status`).all();
console.log("\nShot status:", JSON.stringify(shotStatus, null, 2));

const clipsCount = db.prepare(`SELECT COUNT(*) as n FROM clips`).get();
console.log("\nClips on timeline:", JSON.stringify(clipsCount));
