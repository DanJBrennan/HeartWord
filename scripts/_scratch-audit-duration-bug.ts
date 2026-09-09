import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { parseVerseRange } from "../src/pipeline/scene-breakdown/build-scenes.js";
const db = getDb();

const shots = db.prepare(`
  SELECT s.id, s.verse_ref, s.dialogue_character_id, sc.sequence as scene_seq, s.sequence as shot_seq, s.coverage_plan
  FROM shots s JOIN scenes sc ON sc.id = s.scene_id
  WHERE s.needs_lip_sync = 1 AND s.dialogue_character_id IS NOT NULL
  ORDER BY sc.sequence, s.sequence
`).all() as any[];

for (const shot of shots) {
  const rows = db.prepare(`
    SELECT start_ms, end_ms, verse_ref, (end_ms-start_ms) as dur FROM audio_segments
    WHERE layer = 'composite_cast_master' AND speaker_character_id = ? AND verse_ref IS NOT NULL
  `).all(shot.dialogue_character_id) as any[];

  const { start: vs, end: ve } = parseVerseRange(shot.verse_ref);
  let oldSum = 0, newSum = 0;
  const matches: string[] = [];
  for (const r of rows) {
    const { start, end } = parseVerseRange(r.verse_ref);
    const oldOverlap = start <= ve && end >= vs;
    const contained = (start >= vs && end <= ve) || (vs >= start && ve <= end);
    if (oldOverlap) oldSum += r.dur;
    if (contained) { newSum += r.dur; matches.push(r.verse_ref); }
  }
  const flag = oldSum !== newSum ? "  <<< MISMATCH" : "";
  console.log(`Scene ${shot.scene_seq} Shot ${shot.shot_seq} (${shot.verse_ref}, plan=${shot.coverage_plan}): old=${oldSum}ms new=${newSum}ms via [${matches.join(",")}]${flag}`);
}
