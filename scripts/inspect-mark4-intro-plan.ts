import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb(), projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
console.log(JSON.stringify({
  plan:db.prepare("SELECT plan_json FROM chapter_intro_plans WHERE project_id=?").get(projectId),
  beats:db.prepare("SELECT beat_type,description,rationale,evidence,duration_ms FROM editorial_beats WHERE project_id=? AND placement='pre_source' ORDER BY sequence").all(projectId)
},null,2));
