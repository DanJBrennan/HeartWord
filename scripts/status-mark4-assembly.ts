import "dotenv/config";
import { getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db=getDb();
console.log(JSON.stringify({runs:db.prepare("SELECT id,phase,status,result_json,created_at,completed_at FROM production_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 3").all(projectId),renders:db.prepare("SELECT id,result_asset_path,total_duration_ms,shot_count,created_at FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC LIMIT 3").all(projectId)},null,2));
