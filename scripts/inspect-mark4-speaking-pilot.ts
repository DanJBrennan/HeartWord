import "dotenv/config";
import { getDb } from "../src/db/client.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const rows=getDb().prepare(`SELECT sh.id,sh.verse_ref,sh.needs_lip_sync,
  (SELECT COUNT(*) FROM shot_characters sc WHERE sc.shot_id=sh.id) visible_characters,
  (SELECT COUNT(*) FROM shot_utterance_bindings ub WHERE ub.shot_id=sh.id) bindings
  FROM shots sh JOIN scenes s ON s.id=sh.scene_id
  WHERE s.project_id=? AND sh.needs_lip_sync=1`).all(projectId);
console.log(JSON.stringify(rows,null,2));
