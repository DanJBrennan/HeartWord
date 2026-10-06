/** Read-only production inventory for the v45 scorecard repair. */
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const requestedScene = process.argv[2] ? Number(process.argv[2]) : null;
const rows = getDb().prepare(`SELECT sc.sequence AS scene, s.sequence, s.id, s.verse_ref, s.action, s.needs_lip_sync,
  (SELECT ga.result_asset_path FROM generation_attempts ga WHERE ga.shot_id=s.id AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL ORDER BY ga.created_at DESC LIMIT 1) AS accepted_asset
  FROM shots s JOIN scenes sc ON sc.id=s.scene_id
  WHERE sc.project_id=? AND (? IS NULL OR sc.sequence=?) ORDER BY sc.sequence,s.sequence`).all(projectId, requestedScene, requestedScene);
console.table(rows);
