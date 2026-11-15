import "dotenv/config";
import { getDb } from "../src/db/client.js";

const db = getDb(), project = "0b386bfc-7919-4f40-91af-e198508a8267";
for (const scene of [3, 4, 5]) {
  const ranges = scene === 3 ? [172258,245262] : scene === 4 ? [245262,371645] : [371645,429852];
  console.log(JSON.stringify({scene,sourceSegments:db.prepare("SELECT start_ms,end_ms,speaker_character_id,verse_ref,source_path FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms>=? AND start_ms<? ORDER BY start_ms").all(project,...ranges)}));
  const shots = db.prepare(`SELECT sh.id,sh.sequence,sh.action,sh.verse_ref,sh.needs_lip_sync,sh.coverage_notes,
    ub.source_start_ms,ub.source_end_ms
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id LEFT JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id
    WHERE sc.project_id=? AND sc.sequence=? ORDER BY sh.sequence`).all(project,scene);
  console.log(JSON.stringify({scene,shots}));
  for (const shot of shots as Array<{id:string;sequence:number}>) {
    const attempts = db.prepare("SELECT id,operation,status,result_asset_path,prompt FROM generation_attempts WHERE shot_id=? ORDER BY created_at")
      .all(shot.id) as Array<{id:string;operation:string;status:string;result_asset_path:string|null;prompt:string}>;
    console.log(JSON.stringify({scene,shot:shot.sequence,attempts:attempts.map(a=>({...a,prompt:a.prompt.slice(0,100)}))}));
  }
}
