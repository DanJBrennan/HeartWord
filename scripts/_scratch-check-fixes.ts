import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();

const targets = [[1,1],[1,4],[2,7],[2,8],[2,1],[4,1]];

for (const [sceneSeq, shotSeq] of targets) {
  const shot = db.prepare(`
    SELECT s.id FROM shots s JOIN scenes sc ON sc.id = s.scene_id
    WHERE sc.project_id = 'fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d' AND sc.sequence = ? AND s.sequence = ?
  `).get(sceneSeq, shotSeq) as any;
  const note = db.prepare(`
    SELECT note FROM review_notes WHERE subject_id = ? AND source='qc' ORDER BY created_at DESC LIMIT 1
  `).get(shot.id) as any;
  console.log(`\n\n########## Scene ${sceneSeq} Shot ${shotSeq} ##########`);
  console.log(note.note);
}
