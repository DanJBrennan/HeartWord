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

interface CandidateAttemptRow extends ShotRow {
  attempt_id: string;
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

/**
 * Reviews an imported Codex keyframe before producer acceptance. This is the
 * same composite QC used by the normal generation pipeline, but it preserves
 * the handoff candidate's hold_for_review state: a producer can see every
 * failure and decide whether to regenerate or explicitly override it.
 *
 * A coverage-beat candidate (src/pipeline/media-generation/external-coverage-
 * keyframes.ts's importCoverageBeatKeyframe) is stored in
 * coverage_keyframe_attempts, not generation_attempts -- a covered_sequence
 * shot needs several keyframes (one per beat), so it can't reuse the
 * shot-level generation_attempts row the way a normal single_clip shot's
 * candidate does. Falls back to that table when the id isn't a
 * generation_attempts row, so `scripts/keyframes.ts critique <id>` works
 * for either kind of candidate without the caller needing to know which.
 */
export async function runKeyframeCandidateReview(attemptId: string): Promise<ShotReviewReport> {
  const db = getDb();
  const dataDir = getDataDir();
  const candidate = db.prepare(
    `SELECT s.id, s.action, s.verse_ref, s.continuity_notes,
            ga.id AS attempt_id, ga.id AS generation_attempt_id, ga.result_asset_path AS generated_path
     FROM generation_attempts ga
     JOIN shots s ON s.id = ga.shot_id
     WHERE ga.id = ? AND ga.provider = 'codex_imagegen' AND ga.operation = 'generate'`
  ).get(attemptId) as CandidateAttemptRow | undefined;
  if (!candidate?.generated_path) {
    return runCoverageBeatCandidateReview(attemptId);
  }
  const generatedAbsPath = join(dataDir, "assets", candidate.generated_path);
  if (!existsSync(generatedAbsPath)) throw new Error(`Candidate asset is missing: ${candidate.generated_path}`);

  const fidelityRow = db.prepare(`SELECT crowd_density, continuity_notes FROM shots WHERE id = ?`).get(candidate.id) as
    | { crowd_density: string | null; continuity_notes: string | null }
    | undefined;
  const critic = await runCritic(candidate.action, candidate.verse_ref, candidate.continuity_notes,
    fidelityRow?.crowd_density ?? null, generatedAbsPath);

  const characters = db.prepare(
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
  ).all(candidate.id) as ShotCharacterRow[];

  let likenessAligned = true;
  const likenessNotes: string[] = [];
  for (const character of characters) {
    if (!character.reference_path) {
      likenessAligned = false;
      likenessNotes.push(`${character.character_name} has no approved comparison asset`);
      continue;
    }
    const referenceAbsPath = join(dataDir, "assets", character.reference_path);
    if (!existsSync(referenceAbsPath)) {
      likenessAligned = false;
      likenessNotes.push(`${character.character_name}'s approved comparison asset is missing`);
      continue;
    }
    const verdict = await checkCanonicalLikeness(character.character_name, referenceAbsPath, generatedAbsPath);
    if (!isLikenessAligned(verdict.score, undefined, verdict.instanceCount)) {
      likenessAligned = false;
      likenessNotes.push(`${character.character_name}: ${verdict.score}/100, ${verdict.instanceCount} instance(s) — ${verdict.notes}`);
    }
  }

  const fidelityVerdict = await checkSceneFidelity(generatedAbsPath, candidate.action,
    fidelityRow?.crowd_density ?? null, fidelityRow?.continuity_notes ?? null);
  const fidelityAligned = isSceneFidelityAligned(fidelityVerdict);
  const decision = decideGenerationStatus({ criticSeverity: critic.severity, likenessAligned, fidelityAligned });
  const report =
    `Candidate QC decision: ${decision.status} -- ${decision.reasoning}\n\n` +
    `Critic (severity: ${critic.severity}):\n${critic.findings}\n\n` +
    `Canonical likeness: ${likenessAligned ? "passed" : `FAILED. ${likenessNotes.join(" ")}`}\n` +
    `Scene fidelity: ${fidelityAligned ? "passed" : `FAILED. ${fidelityVerdict.notes}`}`;
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     SELECT ?, sc.project_id, 'shot', ?, 'qc', ?, 0, ?
     FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE s.id=?`
  ).run(randomUUID(), candidate.id, `Codex candidate ${attemptId} composite QC\n${report}`, Date.now(), candidate.id);
  return { shotId: candidate.id, decision, critic, likenessAligned, fidelityAligned, report };
}

interface CoverageBeatCandidateRow {
  beat_id: string;
  beat_sequence: number;
  beat_type: string;
  beat_notes: string | null;
  beat_character_id: string | null;
  shot_id: string;
  action: string;
  verse_ref: string | null;
  continuity_notes: string | null;
  crowd_density: string | null;
  result_asset_path: string;
}

/**
 * Same composite QC as runKeyframeCandidateReview, addressed by a
 * coverage_keyframe_attempts.id (== the brief id it was imported from --
 * see importCoverageBeatKeyframe) instead of a generation_attempts.id.
 * Writes into review_notes at the shot level, same as every other QC note
 * for this shot, but labeled with the beat's sequence/type so a producer
 * reading the shot's history can tell which of its several beats a given
 * note is about.
 */
async function runCoverageBeatCandidateReview(attemptId: string): Promise<ShotReviewReport> {
  const db = getDb();
  const dataDir = getDataDir();
  const candidate = db.prepare(
    `SELECT cb.id AS beat_id, cb.sequence AS beat_sequence, cb.beat_type AS beat_type, cb.notes AS beat_notes, cb.character_id AS beat_character_id,
            s.id AS shot_id, s.action AS action, s.verse_ref AS verse_ref, s.continuity_notes AS continuity_notes,
            s.crowd_density AS crowd_density, cka.result_asset_path AS result_asset_path
     FROM coverage_keyframe_attempts cka
     JOIN coverage_beats cb ON cb.id = cka.coverage_beat_id
     JOIN shots s ON s.id = cb.shot_id
     WHERE cka.id = ?`
  ).get(attemptId) as CoverageBeatCandidateRow | undefined;
  if (!candidate) throw new Error(`No keyframe candidate found for id: ${attemptId}`);
  const generatedAbsPath = join(dataDir, "assets", candidate.result_asset_path);
  if (!existsSync(generatedAbsPath)) throw new Error(`Candidate asset is missing: ${candidate.result_asset_path}`);

  // Tell the Critic this is one beat of a covered sequence, not a normal
  // single_clip shot -- without this it has no way to know a cutaway/insert
  // may deliberately omit the shot's own action subject (e.g. an
  // over-the-shoulder framing that doesn't show Jesus's face), and would
  // otherwise judge it against the whole shot's action text instead of this
  // beat's own narrower purpose.
  const critic = await runCritic(candidate.action, candidate.verse_ref, candidate.continuity_notes,
    candidate.crowd_density, generatedAbsPath, undefined,
    { sequence: candidate.beat_sequence, type: candidate.beat_type, notes: candidate.beat_notes ?? "" });

  // Same reference set the parent shot's own review uses, plus this beat's
  // own character_id when set -- a cutaway or lip-sync insert can name an
  // approved supporting character not on the shot's own cast list (see
  // getCoverageBeatContext's identical UNION in external-coverage-keyframes.ts).
  const characterIds = new Set(
    (db.prepare(`SELECT character_id FROM shot_characters WHERE shot_id = ?`).all(candidate.shot_id) as Array<{ character_id: string }>)
      .map((r) => r.character_id)
  );
  if (candidate.beat_character_id) characterIds.add(candidate.beat_character_id);

  const characterRefQuery = db.prepare(
    `SELECT c.name AS character_name, ref.path AS reference_path
     FROM characters c
     JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
     LEFT JOIN (
       SELECT character_version_id, path,
              ROW_NUMBER() OVER (
                PARTITION BY character_version_id
                ORDER BY CASE category WHEN 'headshot' THEN 0 WHEN 'turnaround' THEN 1 WHEN 'body_pose' THEN 2 ELSE 3 END
              ) AS rn
       FROM character_assets
     ) ref ON ref.character_version_id = cv.id AND ref.rn = 1
     WHERE c.id = ?`
  );
  const characters = [...characterIds].map((id) => characterRefQuery.get(id) as ShotCharacterRow);

  let likenessAligned = true;
  const likenessNotes: string[] = [];
  for (const character of characters) {
    if (!character.reference_path) {
      likenessAligned = false;
      likenessNotes.push(`${character.character_name} has no approved comparison asset`);
      continue;
    }
    const referenceAbsPath = join(dataDir, "assets", character.reference_path);
    if (!existsSync(referenceAbsPath)) {
      likenessAligned = false;
      likenessNotes.push(`${character.character_name}'s approved comparison asset is missing`);
      continue;
    }
    const verdict = await checkCanonicalLikeness(character.character_name, referenceAbsPath, generatedAbsPath);
    if (!isLikenessAligned(verdict.score, undefined, verdict.instanceCount)) {
      likenessAligned = false;
      likenessNotes.push(`${character.character_name}: ${verdict.score}/100, ${verdict.instanceCount} instance(s) — ${verdict.notes}`);
    }
  }

  const fidelityVerdict = await checkSceneFidelity(generatedAbsPath, candidate.action,
    candidate.crowd_density, candidate.continuity_notes);
  const fidelityAligned = isSceneFidelityAligned(fidelityVerdict);
  const decision = decideGenerationStatus({ criticSeverity: critic.severity, likenessAligned, fidelityAligned });
  const report =
    `Candidate QC decision (coverage beat ${candidate.beat_sequence}, ${candidate.beat_type}): ${decision.status} -- ${decision.reasoning}\n\n` +
    `Critic (severity: ${critic.severity}):\n${critic.findings}\n\n` +
    `Canonical likeness: ${likenessAligned ? "passed" : `FAILED. ${likenessNotes.join(" ")}`}\n` +
    `Scene fidelity: ${fidelityAligned ? "passed" : `FAILED. ${fidelityVerdict.notes}`}`;
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     SELECT ?, sc.project_id, 'shot', ?, 'qc', ?, 0, ?
     FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE s.id=?`
  ).run(randomUUID(), candidate.shot_id, `Coverage-beat candidate ${attemptId} composite QC\n${report}`, Date.now(), candidate.shot_id);
  return { shotId: candidate.shot_id, decision, critic, likenessAligned, fidelityAligned, report };
}

export interface ProjectReviewSummary {
  reviewed: number;
  heldForReview: Array<{ shotId: string; sceneSequence: number; shotSequence: number; status: string }>;
  failed: Array<{ shotId: string; sceneSequence: number; shotSequence: number; message: string }>;
}

/**
 * One-time (or occasional) audit pass: runs runShotReview against every
 * shot in the project that currently has an accepted keyframe, regardless
 * of whether it's already been reviewed before -- built 2026-09-07 at
 * Dan's request to retroactively cover the 27 shots generated before this
 * QC pipeline existed and so never got an automatic review from
 * runMediaGeneration's per-shot wiring. Sequential, not parallel: each
 * review is itself 3 real API calls (Critic + 2 checks), and running many
 * of those concurrently risks tripping Gemini's own rate limits for no
 * real benefit here.
 */
export async function runProjectReview(projectId: string): Promise<ProjectReviewSummary> {
  const db = getDb();
  const shots = db
    .prepare(
      `SELECT s.id, s.sequence AS shot_sequence, sc.sequence AS scene_sequence
       FROM shots s
       JOIN scenes sc ON sc.id = s.scene_id
       JOIN generation_attempts ga ON ga.shot_id = s.id AND ga.operation = 'generate' AND ga.status = 'accepted'
       WHERE sc.project_id = ?
       ORDER BY sc.sequence, s.sequence`
    )
    .all(projectId) as Array<{ id: string; shot_sequence: number; scene_sequence: number }>;

  const summary: ProjectReviewSummary = { reviewed: 0, heldForReview: [], failed: [] };
  for (const shot of shots) {
    try {
      const result = await runShotReview(shot.id);
      summary.reviewed++;
      if (result.decision.status !== "accepted") {
        summary.heldForReview.push({
          shotId: shot.id,
          sceneSequence: shot.scene_sequence,
          shotSequence: shot.shot_sequence,
          status: result.decision.status
        });
      }
    } catch (err) {
      summary.failed.push({
        shotId: shot.id,
        sceneSequence: shot.scene_sequence,
        shotSequence: shot.shot_sequence,
        message: (err as Error).message
      });
    }
  }
  return summary;
}
