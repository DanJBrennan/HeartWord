import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const rows = db.prepare(`
  SELECT verse_ref, source_path FROM audio_segments
  WHERE layer='composite_cast_master' ORDER BY created_at DESC
`).all() as any[];
console.log("Most recently created composite_cast_master rows (all rebuilt at once, so this just lists all 24):");
rows.forEach(r => console.log(`  ${r.verse_ref?.padEnd(28)} -> ${r.source_path}`));
