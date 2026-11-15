import "dotenv/config";
import { getDb } from "../src/db/client.js";

const shotId="7af4222c-ae6e-4577-abe7-65f904cbdb67";
const row=getDb().prepare(`SELECT id,result_asset_path,status,provider,model,cost_usd
  FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'
  ORDER BY created_at DESC LIMIT 1`).get(shotId);
console.log(JSON.stringify(row,null,2));
