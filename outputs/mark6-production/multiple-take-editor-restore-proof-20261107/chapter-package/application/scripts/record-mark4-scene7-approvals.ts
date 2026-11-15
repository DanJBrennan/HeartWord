/** Records Dan Brennan's explicit approvals for the current Scene 7 images. */
import { randomUUID } from "node:crypto";
import { getDb, getDataDir } from "../src/db/client.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const shots = db.prepare(`SELECT sh.id, sh.sequence FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
  WHERE sc.project_id=? AND sc.sequence=7 AND sh.sequence IN (2,12)`).all(projectId) as Array<{ id: string; sequence: number }>;

for (const shot of shots) {
  const note = shot.sequence === 2
    ? "Dan Brennan producer decision: approve the retained Scene 7 Shot 2 keyframe. The later submission-uncertain record did not return an asset; retain its audit trail but use the prior real candidate."
    : "Dan Brennan producer decision: approve the current Scene 7 Shot 12 keyframe because the producer likes this image.";
  db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
    VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`).run(randomUUID(), projectId, shot.id, note, Date.now());
  if (shot.sequence === 2) {
    const prior = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate'
      AND result_asset_path IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(shot.id) as { result_asset_path: string } | undefined;
    if (!prior) throw new Error("Scene 7 Shot 2 has no retained image to approve.");
    db.prepare(`UPDATE generation_attempts SET status='accepted', result_asset_path=?
      WHERE id=(SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC LIMIT 1)`)
      .run(prior.result_asset_path, shot.id);
  } else {
    db.prepare(`UPDATE generation_attempts SET status='accepted'
      WHERE id=(SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC LIMIT 1)`)
      .run(shot.id);
  }
  db.prepare(`UPDATE review_notes SET resolved=1 WHERE subject_type='shot' AND subject_id=? AND source='qc' AND resolved=0`).run(shot.id);
}

if (!reapproveCurrentPlanAfterProducerEdit(db, getDataDir(), projectId)) throw new Error("No approved Mark 4 plan to re-stamp.");
console.log(JSON.stringify({ projectId, approved: ["7.2", "7.12"] }, null, 2));
