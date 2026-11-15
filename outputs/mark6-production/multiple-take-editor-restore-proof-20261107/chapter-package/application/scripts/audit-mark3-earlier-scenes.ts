import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb(), project="0b386bfc-7919-4f40-91af-e198508a8267";
for(const scene of [1,2]){
  if(scene===1)console.log(JSON.stringify({openingSegments:db.prepare("SELECT start_ms,end_ms,verse_ref FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms LIMIT 8").all(project)}));
  const shots=db.prepare(`SELECT sh.id,sh.sequence,sh.verse_ref,sh.needs_lip_sync,
    (SELECT c.timeline_end_ms-c.timeline_start_ms FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=sh.id AND a.operation='assemble_shot' AND a.status='accepted' ORDER BY a.created_at DESC LIMIT 1) AS assembled_ms,
    (SELECT a.result_asset_path FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=sh.id AND a.operation='assemble_shot' AND a.status='accepted' ORDER BY a.created_at DESC LIMIT 1) AS assembled_path,
    (SELECT c.timeline_end_ms-c.timeline_start_ms FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=sh.id AND a.operation!='assemble_shot' ORDER BY a.created_at DESC LIMIT 1) AS raw_ms,
    (SELECT a.result_asset_path FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.shot_id=sh.id AND a.operation!='assemble_shot' ORDER BY a.created_at DESC LIMIT 1) AS raw_path
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sc.sequence=? ORDER BY sh.sequence`).all(project,scene);
  console.log(JSON.stringify({scene,shots}));
}
