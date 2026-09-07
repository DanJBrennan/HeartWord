/**
 * Director agent: runs the Critic against one shot, gathers this
 * project's existing automated checks (canonical-likeness,
 * scene-fidelity), and decides what should happen to the shot -- built
 * 2026-09-06 at Dan's request: "The director agent weighs the input of
 * the critic agent and determines if the criticisms justify regenerating
 * one or more images or video clips. All of this is reported to the
 * producer and logged for future reference."
 *
 * "Reported to the producer": PRODUCT_VISION.md's full producer-
 * notification system (email/Pushover/WhatsApp channels, see
 * docs/design/notifications.md) is a named, deliberately-deferred v1
 * feature -- see CURRENT_GOAL.md's v1 scope. This does NOT build that.
 * What it does do: write a real, durable review_notes row (source 'qc')
 * carrying the Director's decision, its reasoning, and the Critic's full
 * findings, and return a human-readable report string -- exactly the
 * mechanism every other QC/casting decision in this codebase already
 * uses to surface itself to Dan (the "producer" in v1, since there's no
 * separate producer role yet). Wiring that same row into a real push
 * notification channel is future work, not invented here.
 *
 * "Logged for future reference": the review_notes row itself, plus the
 * decision status written directly onto generation_attempts.status --
 * GenerationStatus (accepted/retry_same/retry_modified/escalate/
 * hold_for_review) already matches that column's CHECK constraint
 * exactly, so the Director's decision IS the same status column every
 * other part of this pipeline already reads (e.g. media-generation/
 * index.ts's reuse-if-exists check only trusts an 'accepted' row).
 *
 * Auto-wired into runMediaGeneration (src/pipeline/media-generation/
 * index.ts) as of 2026-09-07, at Dan's request -- every newly generated
 * keyframe (not reused ones) gets this review immediately, no separate
 * manual step. A non-'accepted' decision overwrites the shot's
 * generation_attempts.status, which is exactly what makes
 * runMediaGeneration's own reuse-if-exists check regenerate that shot the
 * next time the stage runs -- the same invalidate-then-regenerate
 * handoff canonical-likeness.ts and scene-fidelity.ts's standalone audits
 * already relied on, just triggered automatically instead of by a manual
 * audit run. This is a real added cost per shot (a grounded search call
 * plus the two existing checks), accepted deliberately in exchange for
 * catching problems before Dan has to.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { checkCanonicalLikeness, isLikenessAligned } from "./canonical-likeness.js";
import { checkSceneFidelity, isSceneFidelityAligned } from "./scene-fidelity.js";
import { runCritic, type CriticReport } from "./critic.js";
import { decideGenerationStatus, type DirectorDecision } from "./director-verdict.js";

export interface ShotReviewReport {
  shotId: string;
  decision: DirectorDecision;
  critic: CriticReport;
  likenessAligned: boolean;
  fidelityAligned: boolean;
  /** Human-readable summary suitable for showing Dan directly ("reported
   *  to the producer") -- also written to review_notes. */
  report: string;
}

interface ShotRow {
  id: string;
  action: string;
  verse_ref: string | null;
  continuity_notes: string | null;
  generation_attempt_id: string | null;
  generated_path: string | null;
}

interface ShotCharacterRow {
  character_name: string;
  reference_path: string | null;
}

/**
 * Reviews one shot end-to-end: runs the Critic's grounded research pass,
 * the two existing automated checks against its current accepted
 * keyframe, combines them via decideGenerationStatus, writes the result
 * to review_notes and generation_attempts.status, and returns a full
 * report. Does NOT itself trigger a regeneration -- that's
 * runMediaGeneration's job the next time it runs, the same
 * invalidate-then-regenerate handoff canonical-likeness.ts and
 * scene-fidelity.ts's own audits already use.
 */
export async function runShotReview(shotId: string): Promise<ShotReviewReport> {
  const db = getDb();
  const dataDir = getDataDir();

  const shot = db
    .prepare(
      `SELECT s.id, s.action, s.verse_ref, s.continuity_notes, ga.id AS generation_attempt_id, ga.result_asset_path AS generated_path
       FROM shots s
       LEFT JOIN generation_attempts ga ON ga.shot_id = s.id AND ga.operation = 'generate' AND ga.status = 'accepted'
       WHERE s.id = ?
       ORDER BY ga.created_at DESC LIMIT 1`
    )
    .get(shotId) as ShotRow | undefined;
  if (!shot) {
    throw new Error(`runShotReview: no shot found with id ${shotId}`);
  }
  if (!shot.generation_attempt_id || !shot.generated_path) {
    throw new Error(`runShotReview: shot ${shotId} has no accepted keyframe to review yet.`);
  }

  const generatedAbsPath = join(dataDir, "assets", shot.generated_path);

  const fidelityRow = db.prepare(`SELECT crowd_density, continuity_notes FROM shots WHERE id = ?`).get(shotId) as
    | { crowd_density: string | null; continuity_notes: string | null }
    | undefined;

  const critic = await runCritic(
    shot.action,
    shot.verse_ref,
    shot.continuity_notes,
    fidelityRow?.crowd_density ?? null,
    generatedAbsPath
  );

  const characters = db
    .prepare(
      `SELECT c.name AS character_name, ref.path AS reference_path
       FROM shot_characters shc
       JOIN characters c ON c.id = shc.character_id
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       LEFT JOIN (
         SELECT character_version_id, path,
                ROW_NUMBER() OVER (
                  PARTITION BY character_version_id
                  ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'turnaround' THEN 1 WHEN 'body_pose' THEN 2 ELSE 3 END
                ) AS rn
         FROM character_assets
       ) ref ON ref.character_version_id = cv.id AND ref.rn = 1
       WHERE shc.shot_id = ?`
    )
    .all(shotId) as ShotCharacterRow[];

  let likenessAligned = true;
  for (const character of characters) {
    if (!character.reference_path) continue;
    const referenceAbsPath = join(dataDir, "assets", character.reference_path);
    if (!existsSync(referenceAbsPath)) continue;
    const verdict = await checkCanonicalLikeness(character.character_name, referenceAbsPath, generatedAbsPath);
    if (!isLikenessAligned(verdict.score, undefined, verdict.instanceCount)) {
      likenessAligned = false;
    }
  }

  const fidelityVerdict = await checkSceneFidelity(
    generatedAbsPath,
    shot.action,
    fidelityRow?.crowd_density ?? null,
    fidelityRow?.continuity_notes ?? null
  );
  const fidelityAligned = isSceneFidelityAligned(fidelityVerdict);

  const decision = decideGenerationStatus({ criticSeverity: critic.severity, likenessAligned, fidelityAligned });

  const report =
    `Director decision for this shot: ${decision.status} -- ${decision.reasoning}\n\n` +
    `Critic (severity: ${critic.severity}):\n${critic.findings}\n\n` +
    `Canonical likeness: ${likenessAligned ? "passed" : "FAILED"}. Scene fidelity: ${fidelityAligned ? "passed" : "FAILED"}.`;

  const now = Date.now();
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     SELECT ?, sc.project_id, 'shot', ?, 'qc', ?, ?, ?
     FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE s.id = ?`
  ).run(randomUUID(), shotId, report, decision.status === "accepted" ? 1 : 0, now, shotId);

  if (decision.status !== "accepted") {
    db.prepare(`UPDATE generation_attempts SET status = ? WHERE id = ?`).run(decision.status, shot.generation_attempt_id);
  }

  return { shotId, decision, critic, likenessAligned, fidelityAligned, report };
}
