/** Read-only inventory for the Mark 4 post-frame-3034 continuity repair goal. */
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const audio = db.prepare(`
  SELECT a.verse_ref, a.start_ms, a.end_ms, c.name AS speaker,
    (SELECT co.source_path FROM composite_audio_source_map m
      JOIN audio_segments co ON co.id=m.composite_segment_id
      WHERE m.original_segment_id=a.id LIMIT 1) AS cast_audio
  FROM audio_segments a LEFT JOIN characters c ON c.id=a.speaker_character_id
  WHERE a.project_id=? AND a.layer='original_reading' AND a.start_ms >= 114896
  ORDER BY a.start_ms
`).all(projectId);
const shots = db.prepare(`
  SELECT sc.sequence AS scene, s.sequence AS shot, s.id, s.verse_ref,
    s.needs_lip_sync, s.action,
    (SELECT ga.result_asset_path FROM generation_attempts ga
      WHERE ga.shot_id=s.id AND ga.status='accepted'
      ORDER BY ga.created_at DESC LIMIT 1) AS asset
  FROM scenes sc JOIN shots s ON s.scene_id=sc.id
  WHERE sc.project_id=? ORDER BY sc.sequence, s.sequence
`).all(projectId);
console.log(JSON.stringify(process.argv.includes("--shots-only") ? { shots } : { audio, shots }, null, 2));
