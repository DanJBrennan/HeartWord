import "dotenv/config";
import { getDataDir, getDb } from "../src/db/client.js";
import path from "node:path";
const db = getDb();
const dataDir = getDataDir();

const targets = [
  [1,1],[1,3],[1,4],[1,9],[1,10],
  [2,1],[2,4],[2,5],[2,8],
  [3,1],
  [4,1],[4,2],
  [1,5],[2,3],[2,7] // escalate ones mixed in, will identify by status
];

for (const [sceneSeq, shotSeq] of targets) {
  const row = db.prepare(`
    SELECT s.id AS shot_id, s.action, ga.result_asset_path, ga.status
    FROM shots s
    JOIN scenes sc ON sc.id = s.scene_id
    LEFT JOIN generation_attempts ga ON ga.shot_id = s.id AND ga.operation='generate'
    WHERE sc.project_id = 'fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d' AND sc.sequence = ? AND s.sequence = ?
    ORDER BY ga.created_at DESC LIMIT 1
  `).get(sceneSeq, shotSeq) as any;
  if (!row) { console.log(`scene ${sceneSeq} shot ${shotSeq}: NOT FOUND`); continue; }
  const absPath = row.result_asset_path ? path.join(dataDir, "assets", row.result_asset_path) : null;
  console.log(`scene ${sceneSeq} shot ${shotSeq}: status=${row.status} path=${absPath} action=${row.action.slice(0,80)}`);
}
