/** Applies Dan Brennan's follow-up Mark 4 visual judgments and reopens the
 * remaining producer-authorized revisions below the agreed retry ceiling. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { recordCanonDecision } from "../src/pipeline/qc/director.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();
const approved = new Map<string, string>([
  ["1.3", "Critic severity was none and no actionable issue was presented; accept this keyframe."],
  ["1.4", "Accept: the distant crowd costume resemblance is non-distracting, and Jesus's blue boat mantle is acceptable for this specific boat view."],
  ["1.6", "Accept: hands raised are a valid later-sentence pose for this teaching gesture."],
  ["1.13", "Accept: the plant type is not material to this illustrative beat."],
  ["1.16", "Accept: retain the seed illustration; favor the most visible seeds in later video framing."],
  ["1.17", "Accept: the healthy-crop impression matters more than the modern-looking row geometry."],
  ["1.20", "Accept: a non-distracting similar crowd garment does not confuse the clearly distant Jesus in the boat."]
]);

const principles = [
  "Visual QC must accept a Critic severity 'none' result; an auxiliary disagreement without a stated visible issue is not a paid-regeneration trigger.",
  "For large or soft-focus crowds, judge costume and likeness drift by narrative prominence and distraction. A single distant partial resemblance to Jesus's canon clothing is not disqualifying when Jesus remains unmistakable.",
  "For illustrative agricultural or crowd imagery, prefer the immediate story impression over inconsequential botanical or period-detail imperfections unless the detail changes the narrated meaning."
];
for (const principle of principles) {
  const exists = db.prepare(`SELECT 1 FROM review_notes WHERE project_id=? AND subject_type='project' AND source='human' AND note=?`).get(projectId, principle);
  if (!exists) recordCanonDecision(db, projectId, principle);
}

const rows = db.prepare(`SELECT sh.id, sc.sequence AS scene, sh.sequence AS shot,
  (SELECT COUNT(*) FROM generation_attempts ga WHERE ga.shot_id=sh.id AND ga.operation='generate') AS attempts
  FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?`).all(projectId) as Array<{
  id: string; scene: number; shot: number; attempts: number;
}>;

let accepted = 0;
let reopened = 0;
let heldAtCeiling = 0;
for (const row of rows) {
  const key = `${row.scene}.${row.shot}`;
  const approval = approved.get(key);
  const latest = db.prepare(`SELECT id, status FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC LIMIT 1`).get(row.id) as { id: string; status: string } | undefined;
  if (!latest) continue;
  if (approval) {
    db.prepare(`INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
      VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`)
      .run(randomUUID(), projectId, row.id, `Dan Brennan producer decision: ${approval}`, Date.now());
    db.prepare(`UPDATE generation_attempts SET status='accepted' WHERE id=?`).run(latest.id);
    db.prepare(`UPDATE review_notes SET resolved=1 WHERE subject_type='shot' AND subject_id=? AND source='qc' AND resolved=0`).run(row.id);
    accepted++;
    continue;
  }
  if (["retry_modified", "hold_for_review", "escalate"].includes(latest.status)) {
    if (row.attempts >= 4) {
      heldAtCeiling++;
      continue;
    }
    db.prepare(`UPDATE generation_attempts SET status='retry_modified' WHERE id=?`).run(latest.id);
    reopened++;
  }
}

console.log(JSON.stringify({ projectId, accepted, reopened, heldAtCeiling }, null, 2));
