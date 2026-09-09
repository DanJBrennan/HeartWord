import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();

const covered = db.prepare(`
  SELECT sc.sequence as scene_seq, s.sequence as shot_seq, s.id, s.verse_ref, s.coverage_plan, s.coverage_notes,
         s.needs_lip_sync, s.dialogue_character_id, s.framing
  FROM shots s JOIN scenes sc ON sc.id = s.scene_id
  WHERE s.coverage_plan = 'covered_sequence'
  ORDER BY sc.sequence, s.sequence
`).all();
console.log("COVERED SEQUENCE SHOTS:", JSON.stringify(covered, null, 2));

const audio = db.prepare(`
  SELECT id, layer, verse_ref, start_ms, end_ms, (end_ms-start_ms) as dur_ms, speaker_character_id
  FROM audio_segments
  WHERE layer = 'composite_cast_master'
  ORDER BY start_ms
`).all();
console.log("\nCOMPOSITE CAST MASTER SEGMENTS:", JSON.stringify(audio, null, 2));

const scene3shots = db.prepare(`
  SELECT sc.sequence as scene_seq, s.sequence as shot_seq, s.id, s.verse_ref
  FROM shots s JOIN scenes sc ON sc.id = s.scene_id
  WHERE sc.sequence = 3
  ORDER BY s.sequence
`).all();
console.log("\nSCENE 3 SHOTS:", JSON.stringify(scene3shots, null, 2));
