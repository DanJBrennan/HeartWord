/** Read-only production inventory for the autonomous Mark 4 completion run. */
import { getDb } from "../src/db/client.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const summary = {
  scenes: db.prepare("SELECT COUNT(*) n FROM scenes WHERE project_id=?").get(projectId),
  shots: db.prepare("SELECT COUNT(*) n FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=?").get(projectId),
  speakerShots: db.prepare("SELECT COUNT(*) n FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? AND s.needs_lip_sync=1").get(projectId),
  attempts: db.prepare(`SELECT ga.operation,ga.status,COUNT(*) n FROM generation_attempts ga
    JOIN shots s ON s.id=ga.shot_id JOIN scenes sc ON sc.id=s.scene_id
    WHERE sc.project_id=? GROUP BY ga.operation,ga.status ORDER BY ga.operation,ga.status`).all(projectId),
  clipOperations: db.prepare(`SELECT ga.operation,ga.status,COUNT(*) n FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    JOIN shots s ON s.id=c.shot_id JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? GROUP BY ga.operation,ga.status`).all(projectId),
  missingVisuals: db.prepare(`SELECT sc.sequence scene,s.sequence shot,s.verse_ref,s.action,s.needs_lip_sync FROM shots s JOIN scenes sc ON sc.id=s.scene_id
    WHERE sc.project_id=? AND NOT EXISTS(SELECT 1 FROM generation_attempts ga WHERE ga.shot_id=s.id AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL)
    ORDER BY sc.sequence,s.sequence`).all(projectId),
  acceptedLipSyncWithoutClip: db.prepare(`SELECT s.id,s.verse_ref FROM shots s JOIN scenes sc ON sc.id=s.scene_id
    WHERE sc.project_id=? AND s.needs_lip_sync=1 AND EXISTS(SELECT 1 FROM generation_attempts ga WHERE ga.shot_id=s.id AND ga.operation='lip_sync' AND ga.status='accepted')
    AND NOT EXISTS(SELECT 1 FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.shot_id=s.id AND ga.operation='lip_sync' AND ga.status='accepted')`).all(projectId),
  acceptedVideoWithoutClip: db.prepare(`SELECT s.id,s.verse_ref FROM shots s JOIN scenes sc ON sc.id=s.scene_id
    WHERE sc.project_id=? AND s.needs_lip_sync=0 AND EXISTS(SELECT 1 FROM generation_attempts ga WHERE ga.shot_id=s.id AND ga.operation='generate_final_video' AND ga.status='accepted')
    AND NOT EXISTS(SELECT 1 FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.shot_id=s.id AND ga.operation='generate_final_video' AND ga.status='accepted')`).all(projectId),
  source: db.prepare("SELECT layer,COUNT(*) n,MIN(start_ms) first_ms,MAX(end_ms) last_ms FROM audio_segments WHERE project_id=? GROUP BY layer ORDER BY layer").all(projectId),
  speakerTimeline: db.prepare(`SELECT s.id,s.verse_ref,s.needs_lip_sync,cl.timeline_start_ms,cl.timeline_end_ms,ga.operation,ga.status,ga.result_asset_path,ga.created_at
    FROM shots s JOIN scenes sc ON sc.id=s.scene_id LEFT JOIN clips cl ON cl.shot_id=s.id
    LEFT JOIN generation_attempts ga ON ga.id=cl.generation_attempt_id
    WHERE sc.project_id=? AND s.needs_lip_sync=1 ORDER BY s.verse_ref,ga.created_at`).all(projectId),
};
console.log(JSON.stringify(summary, null, 2));
