import { getDb } from "../src/db/client.js";
const db = getDb();
const id = "8209a47b-eaa0-4dcd-9a43-e3a9afd2e369";
console.log(JSON.stringify({ shot: db.prepare("SELECT id, action, verse_ref, crowd_density, continuity_notes, coverage_notes FROM shots WHERE id = ?").get(id), beats: db.prepare("SELECT id, sequence, beat_type, notes FROM coverage_beats WHERE shot_id = ? ORDER BY sequence").all(id), asset: db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(id) }, null, 2));