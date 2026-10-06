import "dotenv/config";
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const byScene = db.prepare(`
  SELECT sc.sequence AS scene,
    COUNT(DISTINCT sh.id) AS planned,
    COUNT(DISTINCT c.shot_id) AS acceptedClips,
    ROUND(COALESCE((SELECT SUM(ga.cost_usd) FROM generation_attempts ga
      JOIN shots costShot ON costShot.id=ga.shot_id
      WHERE costShot.scene_id=sc.id AND ga.operation='generate_final_video'), 0), 2) AS finalCost,
    ROUND(COALESCE((SELECT SUM(ga.cost_usd) FROM generation_attempts ga
      JOIN shots costShot ON costShot.id=ga.shot_id
      WHERE costShot.scene_id=sc.id AND ga.operation='generate_draft'), 0), 2) AS draftCost
  FROM scenes sc JOIN shots sh ON sh.scene_id = sc.id
  LEFT JOIN clips c ON c.shot_id = sh.id
  WHERE sc.project_id = ? GROUP BY sc.id ORDER BY sc.sequence
`).all(projectId);
const total = db.prepare(`
  SELECT COUNT(DISTINCT sh.id) AS planned,
    COUNT(DISTINCT c.shot_id) AS acceptedClips,
    ROUND(COALESCE(SUM(CASE WHEN ga.operation IN ('generate_draft', 'generate_final_video', 'generate_guided') THEN ga.cost_usd ELSE 0 END), 0), 2) AS videoCost
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  LEFT JOIN clips c ON c.shot_id=sh.id
  LEFT JOIN generation_attempts ga ON ga.shot_id=sh.id
  WHERE sc.project_id=?
`).get(projectId);
console.log(JSON.stringify({ total, byScene }, null, 2));
