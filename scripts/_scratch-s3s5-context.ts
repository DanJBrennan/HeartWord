import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "44009342-73b8-4b8a-ad46-085d64253258";
const shot = db.prepare("SELECT id, sequence, action, verse_ref, crowd_density, continuity_notes, coverage_plan, coverage_notes FROM shots WHERE id = ?").get(shotId);
const beats = db.prepare("SELECT id, sequence, beat_type, audio_start_ms, audio_end_ms, needs_lip_sync, notes, status FROM coverage_beats WHERE shot_id = ? ORDER BY sequence").all(shotId);
const asset = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(shotId);
console.log(JSON.stringify({ shot, beats, asset }, null, 2));