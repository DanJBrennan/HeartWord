import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { parseVerseRange } from "../src/pipeline/scene-breakdown/build-scenes.js";
const db = getDb();

const rows = db.prepare(`
  SELECT start_ms, end_ms, verse_ref, (end_ms-start_ms) as dur FROM audio_segments
  WHERE layer = 'composite_cast_master' AND speaker_character_id = 'b78bed54-1d53-4b9f-9070-549dddb71b19' AND verse_ref IS NOT NULL
  ORDER BY created_at
`).all() as any[];

console.log("All Jesus composite_cast_master segments:");
for (const r of rows) console.log(`  ${r.verse_ref}: ${r.dur}ms`);

// Simulate the overlap check for shot 8's verse_ref "Mark 2:10-11"
const { start: vs, end: ve } = parseVerseRange("Mark 2:10-11");
console.log(`\nShot 8 verse range: ${vs}-${ve}`);
let total = 0;
for (const r of rows) {
  const { start, end } = parseVerseRange(r.verse_ref);
  const overlaps = start <= ve && end >= vs;
  console.log(`  segment ${r.verse_ref} (${start}-${end}): overlaps=${overlaps}`);
  if (overlaps) total += r.dur;
}
console.log("TOTAL (overlap-matched):", total, "ms");
