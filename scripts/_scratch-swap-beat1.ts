import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558";
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

// Remove beat 1's old clip (the kling-v1 result) and the stale assemble_shot rows.
for (const opFilter of ["'assemble_shot'"]) {
  const rows = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id=? AND operation=${opFilter}`).all(shotId) as any[];
  for (const r of rows) {
    db.prepare(`DELETE FROM clips WHERE generation_attempt_id=?`).run(r.id);
    db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id=?`).run(r.id);
    db.prepare(`DELETE FROM generation_attempts WHERE id=?`).run(r.id);
  }
}
const beat1Attempt = db.prepare(`SELECT ga.id FROM clips cl JOIN generation_attempts ga ON ga.id=cl.generation_attempt_id WHERE cl.shot_id=? AND cl.timeline_start_ms=0 AND cl.timeline_end_ms=3500`).get(shotId) as any;
if (beat1Attempt) {
  db.prepare(`DELETE FROM clips WHERE generation_attempt_id=?`).run(beat1Attempt.id);
  db.prepare(`DELETE FROM cost_ledger_entries WHERE generation_attempt_id=?`).run(beat1Attempt.id);
  db.prepare(`DELETE FROM generation_attempts WHERE id=?`).run(beat1Attempt.id);
  console.log("Removed old beat1 attempt", beat1Attempt.id);
}

// Insert the new kling-v1-6/pro result as beat 1's clip.
const attemptId = randomUUID();
db.prepare(`INSERT INTO generation_attempts (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at) VALUES (?, ?, 'kling', 'kling-v1-6', 'generate_final', '1080p', ?, 'accepted', ?, 0.6, ?)`)
  .run(attemptId, shotId, "Static wide 16:9 master shot of a packed room in a Capernaum home. Everyone holds their pose with only subtle natural movement -- slight breathing, small shifts among the crowd. Jesus stands calm and attentive, facing the seated scribes. No one speaks. The paralytic lies still on his mat, eyes open, alert and hopeful.", "generated\video\kling-926681231671697478.mp4", Date.now());
db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)`).run(randomUUID(), projectId, attemptId, 0.6, Date.now());
db.prepare(`INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, 3500, ?)`).run(randomUUID(), shotId, attemptId, Date.now());
console.log("Inserted new beat1 attempt", attemptId);
