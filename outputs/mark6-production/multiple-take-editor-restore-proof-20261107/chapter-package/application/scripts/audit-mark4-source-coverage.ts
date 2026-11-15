/** Read-only source/speaker inventory used before overnight assembly. */
import { getDb } from "../src/db/client.js";
const db=getDb(), projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const rows=db.prepare(`SELECT a.id,a.verse_ref,a.start_ms,a.end_ms,c.name speaker,
  group_concat(DISTINCT s.id) bound_shots,
  group_concat(DISTINCT s.verse_ref) shot_refs
  FROM audio_segments a LEFT JOIN characters c ON c.id=a.speaker_character_id
  LEFT JOIN shot_utterance_bindings ub ON ub.source_audio_segment_id=a.id
  LEFT JOIN shots s ON s.id=ub.shot_id
  WHERE a.project_id=? AND a.layer='original_reading'
  GROUP BY a.id ORDER BY a.start_ms`).all(projectId);
const speakers=db.prepare(`SELECT s.id,s.verse_ref,sc.sequence scene,s.sequence shot,
  (SELECT ga.result_asset_path FROM generation_attempts ga WHERE ga.shot_id=s.id AND ga.operation='lip_sync' AND ga.status='accepted' ORDER BY ga.created_at DESC LIMIT 1) lip,
  (SELECT ga.result_asset_path FROM generation_attempts ga WHERE ga.shot_id=s.id AND ga.operation='assemble_shot' AND ga.status='accepted' ORDER BY ga.created_at DESC LIMIT 1) assembled
  FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? AND s.needs_lip_sync=1 ORDER BY sc.sequence,s.sequence`).all(projectId);
const projectSources=db.prepare("SELECT * FROM project_source_bindings WHERE project_id=?").all(projectId);
const sourcePaths=db.prepare("SELECT source_path,COUNT(*) n FROM audio_segments WHERE project_id=? AND layer='original_reading' GROUP BY source_path").all(projectId);
console.log(JSON.stringify({rows,speakers,projectSources,sourcePaths},null,2));
