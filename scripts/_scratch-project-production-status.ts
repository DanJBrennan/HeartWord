import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb(); const project="fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
console.log(JSON.stringify({
 coverage: db.prepare(`SELECT cb.status, COUNT(*) n FROM coverage_beats cb JOIN shots s ON s.id=cb.shot_id JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? GROUP BY cb.status ORDER BY cb.status`).all(project),
 shots: db.prepare(`SELECT s.status, COUNT(*) n FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? GROUP BY s.status ORDER BY s.status`).all(project),
 clips: db.prepare(`SELECT COUNT(*) n FROM clips c JOIN shots s ON s.id=c.shot_id JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=?`).get(project),
 audioSegments: db.prepare(`SELECT COUNT(*) n FROM audio_segments WHERE project_id=?`).get(project)
},null,2));
