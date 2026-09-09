import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();

const rows = db.prepare(`
  SELECT sc.sequence as scene_seq, s.sequence as shot_seq, s.verse_ref, cb.sequence as beat_seq,
         cb.beat_type, cb.requires_new_keyframe, cb.keyframe_asset_path, cb.status
  FROM coverage_beats cb
  JOIN shots s ON s.id = cb.shot_id
  JOIN scenes sc ON sc.id = s.scene_id
  ORDER BY sc.sequence, s.sequence, cb.sequence
`).all() as any[];

const needed = rows.filter(r => r.requires_new_keyframe && !r.keyframe_asset_path);
const reused = rows.filter(r => !r.requires_new_keyframe);

console.log(`Total coverage beats: ${rows.length}`);
console.log(`Need a NEW keyframe generated: ${needed.length}`);
console.log(`Reuse an existing approved keyframe (no new generation needed): ${reused.length}`);
console.log();

let currentShot = "";
for (const r of needed) {
  const shotLabel = `Scene ${r.scene_seq} Shot ${r.shot_seq} (${r.verse_ref})`;
  if (shotLabel !== currentShot) {
    console.log(`\n${shotLabel}:`);
    currentShot = shotLabel;
  }
  console.log(`  beat ${r.beat_seq}: ${r.beat_type}`);
}

const byType: Record<string, number> = {};
for (const r of needed) byType[r.beat_type] = (byType[r.beat_type] || 0) + 1;
console.log("\nBreakdown by beat type:", JSON.stringify(byType, null, 2));
