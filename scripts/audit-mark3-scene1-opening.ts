import "dotenv/config";
import { getDb } from "../src/db/client.js";

const db = getDb();
const project = "0b386bfc-7919-4f40-91af-e198508a8267";
console.log(JSON.stringify({
  segments: db.prepare("SELECT id,layer,start_ms,end_ms,verse_ref,speaker_character_id,source_path FROM audio_segments WHERE project_id=? AND start_ms<41733 ORDER BY layer,start_ms").all(project),
  shots: db.prepare(`SELECT sh.id,sh.sequence,sh.action,sh.verse_ref,sh.framing,sh.coverage_notes,
    (SELECT result_asset_path FROM generation_attempts WHERE shot_id=sh.id AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1) AS still
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sc.sequence=1 AND sh.sequence<=3 ORDER BY sh.sequence`).all(project),
  bindings: db.prepare(`SELECT ub.shot_id,ub.source_start_ms,ub.source_end_ms,a.speaker_character_id,a.source_path,m.source_hash AS mapped_hash,ub.source_hash
    FROM shot_utterance_bindings ub JOIN shots sh ON sh.id=ub.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    JOIN audio_segments a ON a.id=ub.source_audio_segment_id LEFT JOIN composite_audio_source_map m ON m.original_segment_id=a.id
    WHERE sc.project_id=? AND sc.sequence=1 AND sh.sequence<=3`).all(project),
}, null, 2));
