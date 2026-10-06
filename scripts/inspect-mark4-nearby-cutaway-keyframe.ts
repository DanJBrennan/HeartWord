import "dotenv/config";
import { getDb } from "../src/db/client.js";

const rows=getDb().prepare(`SELECT sh.id,sc.sequence AS scene,sh.sequence AS shot,sh.action,
  ga.id AS attempt_id,ga.result_asset_path,ga.status,ga.provider,ga.model,ga.cost_usd
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  LEFT JOIN generation_attempts ga ON ga.shot_id=sh.id AND ga.operation='generate' AND ga.status='accepted'
  WHERE sc.project_id=? AND sc.sequence=1 AND sh.sequence=8 ORDER BY ga.created_at DESC LIMIT 1`).all("8a5659a4-b033-4d5f-80e2-904b217cf8a0");
console.log(JSON.stringify(rows,null,2));
