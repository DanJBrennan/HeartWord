import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const rows = db.prepare(`
  SELECT id, source_path, start_ms, end_ms, verse_ref, speaker_character_id, confidence
  FROM audio_segments WHERE layer = 'original_reading' AND verse_ref LIKE '%2:19%'
`).all();
console.log(JSON.stringify(rows, null, 2));
