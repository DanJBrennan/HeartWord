/** Regenerates only Mark 4's producer-authorized keyframes.  It deliberately
 * calls Stage 4's keyframe function, not the broader media runner, so it does
 * not start any video or lip-sync spend. */
import { getDb } from "../src/db/client.js";
import { generateKeyframes } from "../src/pipeline/media-generation/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const shotIds = (db.prepare(`SELECT sh.id FROM shots sh
  JOIN scenes sc ON sc.id=sh.scene_id
  JOIN generation_attempts ga ON ga.id=(SELECT id FROM generation_attempts x WHERE x.shot_id=sh.id AND x.operation='generate' ORDER BY x.created_at DESC LIMIT 1)
  WHERE sc.project_id=? AND ga.status IN ('retry_modified', 'escalate')
  ORDER BY sc.sequence, sh.sequence`).all(projectId) as Array<{ id: string }>).map((row) => row.id);

console.log(JSON.stringify({ projectId, authorizedShots: shotIds.length }, null, 2));
console.log(JSON.stringify(await generateKeyframes(projectId, shotIds), null, 2));
