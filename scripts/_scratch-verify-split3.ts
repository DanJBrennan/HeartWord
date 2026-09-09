import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const rows = db.prepare(`SELECT id, layer, source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:19-22'`).all();
console.log(JSON.stringify(rows, null, 2));
