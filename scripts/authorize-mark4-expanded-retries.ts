/** Records Dan Brennan's authorization for two additional corrective attempts
 * on Mark 4 and reopens shots held only by the former retry ceiling. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { recordCanonDecision } from "../src/pipeline/qc/director.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const decision = "Mark 4 producer authorization: allow two additional automated corrective attempts beyond the prior ceiling, including Pro-tier escalations. Hold only after five prior attempts remain unresolved.";
const db = getDb();
const exists = db.prepare(`SELECT 1 FROM review_notes WHERE project_id=? AND subject_type='project' AND source='human' AND note=?`).get(projectId, decision);
if (!exists) recordCanonDecision(db, projectId, decision);

const rows = db.prepare(`SELECT sh.id,
  (SELECT COUNT(*) FROM generation_attempts ga WHERE ga.shot_id=sh.id AND ga.operation='generate') AS attempts,
  (SELECT id FROM generation_attempts ga WHERE ga.shot_id=sh.id AND ga.operation='generate' ORDER BY ga.created_at DESC LIMIT 1) AS attempt_id,
  (SELECT status FROM generation_attempts ga WHERE ga.shot_id=sh.id AND ga.operation='generate' ORDER BY ga.created_at DESC LIMIT 1) AS status
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?`).all(projectId) as Array<{
  id: string; attempts: number; attempt_id: string | null; status: string | null;
}>;

let reopened = 0;
for (const row of rows) {
  // MAX_AUTOMATIC_RETRIES=5 means the sixth completed image is the first one
  // that may be held. These were held at the former three-retry limit.
  if (row.status === "hold_for_review" && row.attempt_id && row.attempts < 6) {
    db.prepare(`UPDATE generation_attempts SET status='retry_modified' WHERE id=?`).run(row.attempt_id);
    reopened++;
  }
}
console.log(JSON.stringify({ projectId, reopened }, null, 2));
