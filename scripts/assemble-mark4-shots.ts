import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const shots = db.prepare(`SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence`).all(projectId) as Array<{ id: string }>;
let assembled = 0;
for (const shot of shots) {
  const exists = db.prepare(`SELECT 1 FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' LIMIT 1`).get(shot.id);
  if (exists) continue;
  const result = assembleSingleShot(db, shot.id);
  assembled++;
  console.log(JSON.stringify({ ...result, assembled, total: shots.length }));
}
console.log(JSON.stringify({ projectId, assembled, total: shots.length }));
