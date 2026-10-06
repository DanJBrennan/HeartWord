import "dotenv/config";
import { getDb } from "../src/db/client.js";

const shotId="1172d540-c778-46af-8c7e-9dfa2cc565a1";
const row=getDb().prepare(`SELECT id,result_asset_path,status,provider,model,cost_usd
  FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video'
  ORDER BY created_at DESC LIMIT 1`).get(shotId);
const notes=getDb().prepare(`SELECT note FROM review_notes WHERE subject_type='shot' AND subject_id=? AND source='qc'
  ORDER BY created_at DESC LIMIT 3`).all(shotId);
console.log(JSON.stringify({row,notes},null,2));
