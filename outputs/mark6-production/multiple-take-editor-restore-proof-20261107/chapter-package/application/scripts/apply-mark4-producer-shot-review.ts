/**
 * Applies Dan Brennan's Mark 4 keyframe review (2026-09-25) without deleting
 * any generated take.  Explicit approvals resolve QC concerns for that one
 * shot; every other existing Critic concern is authorized for regeneration.
 *
 * This is deliberately a one-project production record, not a replacement
 * for the generic Director/QC policy.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { getDataDir } from "../src/db/client.js";
import { reapproveCurrentPlanAfterProducerEdit } from "../src/pipeline/creative-direction/crew-store.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const now = Date.now();

const approvals = new Set([
  "1.1", "1.2", "1.5", "1.7", "1.9", "1.10", "1.11", "1.12", "1.14", "1.15", "1.18",
  "2.3", "2.5", "2.6",
  "3.3", "3.4", "3.8", "3.9", "3.10", "3.12",
  // Dan's second, later statement for Scene 4 Shot 2 is the controlling one.
  "4.2"
]);

const producerDirections = new Map<string, string>([
  ["1.3", "Jesus must be seated inside the floating boat hull, never perched on its gunwale."],
  ["1.4", "Show only Jesus in the boat for this reverse-angle teaching view; no other named person is visible in the hull."],
  ["1.6", "Match Jesus's approved canon costume exactly. Begin with his arm lowered to mid-height or at his side so a forward gesture can animate."],
  ["1.8", "Show an identifiable sower with a small seed pouch and a hand actively scattering seed onto the path; seeds must not float without a source."],
  ["1.13", "Start with newly sprouted green plants, leaving visible room for them to grow and wither during animation."],
  ["2.1", "Show Jesus in a circle with all twelve disciples, each once and distinctly identifiable in approved Papuan canon. Use grouped three-person reference sheets; never substitute generic or white/European figures."],
  ["2.2", "Use the Pro image tier. Keep all four named canon identities distinct and prevent any duplicate Jesus costume."],
  ["2.4", "Start with Jesus's arms lowered and include disciples in their approved canon clothing, with other followers permitted around the circle."],
  ["2.8", "The follower at Jesus's right must have short curly hair and distinct facial features matching the approved disciple canon, never Jesus's likeness."],
  ["2.9", "Render Jesus in his locked cream shoulder drape with blue chest straps; preserve clear identity differentiation from every disciple."],
  ["3.11", "Regenerate the required close-up of Jesus's face and shoulders. Preserve the current wider view only as retained history/a possible later framing reference."],
]);

const rows = db.prepare(`SELECT sh.id, sc.sequence AS scene, sh.sequence AS shot, sh.continuity_notes
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?`).all(projectId) as Array<{
  id: string; scene: number; shot: number; continuity_notes: string | null;
}>;

const findJesus = db.prepare(`SELECT c.id FROM characters c WHERE c.name='Jesus'`).get() as { id: string } | undefined;
if (!findJesus) throw new Error("Approved Jesus canon record is missing.");

let approved = 0;
let reopened = 0;
for (const row of rows) {
  const key = `${row.scene}.${row.shot}`;
  const direction = producerDirections.get(key);
  if (approvals.has(key)) {
    db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
      VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`).run(
        randomUUID(), projectId, row.id,
        "Dan Brennan producer review: approved this current keyframe. The cited Critic concern is acceptable in context and must not trigger regeneration.", now
      );
    db.prepare(`UPDATE generation_attempts SET status='accepted' WHERE id=(SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC LIMIT 1)`).run(row.id);
    db.prepare(`UPDATE review_notes SET resolved=1 WHERE subject_type='shot' AND subject_id=? AND source='qc' AND resolved=0`).run(row.id);
    approved++;
    continue;
  }

  // Dan authorized the Critic's remaining actionable guidance.  A resolved
  // human note makes that authorization visible to subsequent Critic passes;
  // the existing QC note still supplies its exact suggested fix to the prompt.
  db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
    VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`).run(
      randomUUID(), projectId, row.id,
      `Dan Brennan producer review: regenerate this shot using the Critic's requested correction.${direction ? ` Additional producer direction: ${direction}` : ""}`,
      now
    );
  if (direction) {
    const next = [row.continuity_notes, `PRODUCER REGENERATION DIRECTION: ${direction}`].filter(Boolean).join("\n");
    db.prepare("UPDATE shots SET continuity_notes=? WHERE id=?").run(next, row.id);
  }
  if (key === "1.4") {
    db.prepare("DELETE FROM shot_characters WHERE shot_id=? AND character_id<>?").run(row.id, findJesus.id);
  }
  db.prepare(`UPDATE generation_attempts SET status='retry_modified' WHERE id=(SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC LIMIT 1)`).run(row.id);
  reopened++;
}

console.log(JSON.stringify({ projectId, reviewed: rows.length, approved, reopened }, null, 2));
if (!reapproveCurrentPlanAfterProducerEdit(db, getDataDir(), projectId)) {
  throw new Error("Mark 4 has no already-approved planning run to re-stamp after the producer review.");
}
