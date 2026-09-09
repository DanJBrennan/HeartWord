import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d"; // Scene 1 Shot 8, Mark 2:10-11

const shot = db.prepare(`SELECT * FROM shots WHERE id = ?`).get(shotId);
console.log("SHOT:", JSON.stringify(shot, null, 2));

const beats = db.prepare(`SELECT * FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shotId);
console.log("\nBEATS:", JSON.stringify(beats, null, 2));

const shotKeyframe = db.prepare(`
  SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted'
  ORDER BY created_at DESC LIMIT 1
`).get(shotId);
console.log("\nSHOT'S OWN KEYFRAME:", JSON.stringify(shotKeyframe, null, 2));

const chars = db.prepare(`
  SELECT c.name, c.id as character_id, cv.id as character_version_id
  FROM shot_characters sc JOIN characters c ON c.id = sc.character_id
  JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
  WHERE sc.shot_id = ?
`).all(shotId);
console.log("\nCHARACTERS:", JSON.stringify(chars, null, 2));

const audioSeg = db.prepare(`
  SELECT * FROM audio_segments WHERE layer = 'composite_cast_master' AND verse_ref = 'Mark 2:10-11'
`).get();
console.log("\nAUDIO SEGMENT:", JSON.stringify(audioSeg, null, 2));
