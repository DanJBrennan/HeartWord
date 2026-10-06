import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb(), projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
console.log(JSON.stringify({shots:db.prepare(`SELECT sc.sequence scene,sh.sequence shot,sh.id,sh.verse_ref verseRef,sh.action,sh.needs_lip_sync lipSync FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence LIMIT 10`).all(projectId),audio:db.prepare("SELECT id,start_ms,end_ms,verse_ref FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms LIMIT 8").all(projectId)},null,2));
