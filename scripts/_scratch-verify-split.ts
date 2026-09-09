import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const rows = db.prepare(`
  SELECT id, verse_ref, start_ms, end_ms, confidence FROM audio_segments
  WHERE layer='original_reading' AND verse_ref LIKE 'Mark 2:1%' AND verse_ref NOT LIKE 'Mark 2:1-%'
  ORDER BY start_ms
`).all();
console.log(JSON.stringify(rows, null, 2));
