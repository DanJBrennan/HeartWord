import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558";

const shot = db.prepare(`SELECT * FROM shots WHERE id = ?`).get(shotId);
console.log("SHOT:", JSON.stringify(shot, null, 2));

const shotKeyframe = db.prepare(`
  SELECT id, result_asset_path, provider, status FROM generation_attempts
  WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted'
  ORDER BY created_at DESC LIMIT 1
`).get(shotId);
console.log("\nSHOT'S OWN ACCEPTED KEYFRAME:", JSON.stringify(shotKeyframe, null, 2));

const beats = db.prepare(`SELECT * FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shotId);
console.log("\nBEATS:", JSON.stringify(beats, null, 2));

const audio = db.prepare(`
  SELECT * FROM audio_segments WHERE layer = 'composite_cast_master' AND verse_ref = ?
`).all("Mark 2:8-10");
console.log("\nAUDIO SEGMENT (2:8-10):", JSON.stringify(audio, null, 2));

const dialogueChar = db.prepare(`SELECT id, name FROM characters WHERE id = ?`).get((shot as any).dialogue_character_id);
console.log("\nSPEAKING CHARACTER:", JSON.stringify(dialogueChar, null, 2));
