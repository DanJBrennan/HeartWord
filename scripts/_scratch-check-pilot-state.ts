import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const clips = db.prepare(`
  SELECT cl.timeline_start_ms, cl.timeline_end_ms, ga.operation, ga.result_asset_path
  FROM clips cl JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
  WHERE cl.shot_id = ? ORDER BY cl.timeline_start_ms
`).all("0d43887a-8c20-4271-a6d8-3cafad177558");
console.log(JSON.stringify(clips, null, 2));
