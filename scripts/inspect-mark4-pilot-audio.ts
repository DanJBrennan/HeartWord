import "dotenv/config";
import { getDb } from "../src/db/client.js";

const db=getDb();
const rows=db.prepare(`SELECT id,source_path,start_ms,end_ms,verse_ref,speaker_character_id
  FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms<52000
  ORDER BY start_ms`).all("8a5659a4-b033-4d5f-80e2-904b217cf8a0");
console.log(JSON.stringify(rows,null,2));
