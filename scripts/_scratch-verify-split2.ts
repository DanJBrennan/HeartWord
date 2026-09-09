import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const rows = db.prepare(`
  SELECT verse_ref, start_ms, end_ms, confidence FROM audio_segments
  WHERE layer='original_reading' AND (verse_ref = 'Mark 2:19' OR verse_ref='Mark 2:20' OR verse_ref='Mark 2:21' OR verse_ref='Mark 2:22' OR verse_ref = 'Mark 2:22-24 (narration)')
  ORDER BY start_ms
`).all();
console.log(JSON.stringify(rows, null, 2));
const wideStillExists = db.prepare(`SELECT COUNT(*) as n FROM audio_segments WHERE verse_ref = 'Mark 2:19-22'`).get();
console.log("Old wide row still exists:", wideStillExists);
