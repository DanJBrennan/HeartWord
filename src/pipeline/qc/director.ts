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
import { parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import { assetPath } from "../media-generation/external-keyframes.js";
import { checkCanonicalLikeness, isLikenessAligned } from "./canonical-likeness.js";
import {approvedWardrobeQcReference,assertWardrobeReviewBasis} from "../../characters/wardrobe-refinement.js";
import { checkSceneFidelity, isSceneFidelityAligned } from "./scene-fidelity.js";
import { formatCriticFindings, parseCriticFindings, runCritic, type CriticCharacterReference, type CriticFinding, type CriticReport } from "./critic.js";
import { decideGenerationStatus, type DirectorDecision } from "./director-verdict.js";
import { matchesBeatScope, stripBeatTag, tagNote, type NoteScope } from "./beat-scope.js";

// Same hardcoded Hatam Mark 2 source paths external-keyframes.ts and
// external-coverage-keyframes.ts already use -- this whole pipeline is a
// single-chapter v1 pilot (see AGENTS.md), not yet parameterized by
// project/book/chapter.
const SCRIPTURE_SOURCES = [
  { role: "Hatam (verified source)", path: "source/hatam/mark-2/mark-2-text.docx" },
  { role: "English (reference)", path: "reference/english/mark-2/mark-2-text.docx" }
];

/**
 * Loads the verified scripture text for a shot's verse range, so the
 * Critic can judge "scriptural accuracy" against the actual passage
 * instead of only a one-line action paraphrase. Returns null rather than
 * throwing when the verse ref doesn't parse or no source text is found --
 * the Critic still runs, just without this extra grounding.
 */
function loadScriptureText(db: ReturnType<typeof getDb>, dataDir: string, shotId: string, verseRef: string | null): string | null {
  if (!verseRef) return null;
  // SCRIPTURE_SOURCES is hardcoded to Hatam Mark 2 (the same convention
  // external-keyframes.ts/external-coverage-keyframes.ts use for their
  // own single-chapter v1 pilot) -- reading it unconditionally for
  // whatever project is actually being reviewed would silently hand the
  // Critic the WRONG passage the moment a second project exists. Only
  // load it when this shot really is Hatam Mark 2.
  const project = db
    .prepare(
      `SELECT p.language, p.book, p.chapter FROM projects p JOIN scenes sc ON sc.project_id = p.id JOIN shots s ON s.scene_id = sc.id
       WHERE s.id = ?`
    )
    .get(shotId) as { language: string; book: string; chapter: number } | undefined;
  if (!project || project.language.toLowerCase() !== "hatam" || project.book.toLowerCase() !== "mark" || project.chapter !== 2) {
    return null;
  }
  let range: { start: number; end: number };
  try {
    range = parseVerseRange(verseRef);
  } catch {
    return null;
  }
  const parts: string[] = [];
  for (const source of SCRIPTURE_SOURCES) {
    const absPath = assetPath(dataDir, source.path);
    if (!existsSync(absPath)) continue;
    const verses = parseSourceTextByVerse(absPath).filter((v) => v.verse >= range.start && v.verse <= range.end);
    if (!verses.length) continue;
    parts.push(`${source.role}:\n${verses.map((v) => `${v.verse}. ${v.text}`).join("\n")}`);
  }
  return parts.length ? parts.join("\n\n") : null;
}

/** Turns the same shot-cast rows used by the likeness check into Critic
 *  reference images, so the identity/costume hard rule can be judged
 *  against a real approved reference instead of a text description. */
function toCriticReferences(dataDir: string, characters: ShotCharacterRow[]): CriticCharacterReference[] {
  return characters
    .filter((c): c is ShotCharacterRow & { reference_path: string } => !!c.reference_path && existsSync(assetPath(dataDir, c.reference_path)))
    .map((c) => ({ name: c.character_name, imagePath: assetPath(dataDir, c.reference_path) }));
}

/**
 * Two different scopes of "remembered decision," per Dan's 2026-09-11
 * request that the Critic distinguish a one-shot exception from a
 * standing canon decision:
 *
 * - loadCanonDecisions: production-wide calibrations (review_notes scoped
 *   to the whole project, subject_type='project') that apply to EVERY
 *   shot -- e.g. "a striped shawl on a scribe is an accepted stylistic
 *   choice." Previously hardcoded directly into critic.ts's prompt as a
 *   single example; now loaded live, so recordCanonDecision below can add
 *   more without another code change.
 * - loadShotOverrides: a decision scoped to exactly one shot_id (review_
 *   notes scoped to that shot, subject_type='shot') -- e.g. "the missing
 *   debris here is fine, people obscure the floor." Must NOT be reused
 *   for any other shot, which is exactly why it's queried per-shot rather
 *   than folded into the canon-decisions list.
 *
 * Both only read 'human'-sourced, resolved notes -- a 'qc' note is the
 * Critic's OWN prior finding, not a producer decision, and re-feeding
 * that back in would let the Critic talk itself out of its own concerns.
 */
function loadCanonDecisions(db: ReturnType<typeof getDb>, projectId: string): string[] {
  return (
    db
      .prepare(
        `SELECT note FROM review_notes WHERE subject_type = 'project' AND subject_id = ? AND source = 'human' AND resolved = 1 ORDER BY created_at`
      )
      .all(projectId) as Array<{ note: string }>
  ).map((r) => r.note);
}

// See beat-scope.ts for why this is a separate, DB-free module (and for
// the full reasoning behind beat-scoped overrides/corrections).

function loadShotOverrides(db: ReturnType<typeof getDb>, shotId: string, scope: NoteScope = {}): string[] {
  return (
    db
      .prepare(
        `SELECT note FROM review_notes WHERE subject_type = 'shot' AND subject_id = ? AND source = 'human' AND resolved = 1 ORDER BY created_at`
      )
      .all(shotId) as Array<{ note: string }>
  )
    .filter((r) => matchesBeatScope(r.note, scope))
    .map((r) => stripBeatTag(r.note));
}

/**
 * Durably records a standing, production-wide canon decision -- the
 * project-scoped counterpart to external-keyframes.ts's
 * recordProducerOverride (which is scoped to one shot's candidate) and
 * canon-critic.ts's recordProducerOverride (scoped to one character
 * version). Every future Critic call for this project picks this up
 * automatically via loadCanonDecisions -- no prompt edit required.
 */
export function recordCanonDecision(db: ReturnType<typeof getDb>, projectId: string, decisionText: string): void {
  if (!decisionText.trim()) throw new Error("A canon decision's explanation is required.");
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'project', ?, 'human', ?, 1, ?)`
  ).run(randomUUID(), projectId, projectId, decisionText.trim(), Date.now());
}

/**
 * The coverage-beat-scoped counterpart to recordCanonDecision/
 * external-keyframes.ts's recordProducerOverride: records a producer
 * exception tagged "BEAT: <beat_id>" so loadShotOverrides never applies
 * it to this shot's other beats (see matchesBeatScope above for why that
 * matters).
 *
 * `attemptId` (a coverage_keyframe_attempts.id) is optional and changes
 * the exception's SCOPE, not just its bookkeeping -- Codex's second
 * review (2026-09-11) pointed out that a beat's candidate images can
 * differ completely from one regeneration to the next, so an exception
 * about THIS specific candidate's obscured floor is not evidence about a
 * different, later candidate's clearly-visible one:
 *   - omitted: a deliberate STANDING decision for the whole beat --
 *     applies to every future candidate of it.
 *   - provided: scoped to that one candidate only.
 */
export function recordCoverageBeatOverride(
  db: ReturnType<typeof getDb>,
  beatId: string,
  overrideText: string,
  attemptId?: string
): { beatId: string; shotId: string } {
  if (!overrideText.trim()) throw new Error("A producer override explanation is required.");
  const beat = db.prepare(`SELECT shot_id FROM coverage_beats WHERE id = ?`).get(beatId) as { shot_id: string } | undefined;
  if (!beat) throw new Error(`Unknown coverage beat: ${beatId}`);
  const projectId = getProjectIdForShot(db, beat.shot_id);
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     VALUES (?, ?, 'shot', ?, 'human', ?, 1, ?)`
  ).run(randomUUID(), projectId, beat.shot_id, tagNote({ beatId, attemptId }, overrideText.trim()), Date.now());
  return { beatId, shotId: beat.shot_id };
}

const NEXT_ATTEMPT_FIX_LINE = /NEXT ATTEMPT SUGGESTED FIX:\s*(.+)/;
const NEXT_ATTEMPT_PRESERVE_LINE = /NEXT ATTEMPT PRESERVE:\s*(.+)/;

export interface SuggestedFix {
  fix: string;
  preserve: string;
  /** Advisory evidence for the recipient of a regeneration prompt. It is
   * deliberately not used by decideGenerationStatus. */
  criticFindings: CriticFinding[];
}

/**
 * Closes the loop Codex flagged: a retry_modified/hold_for_review verdict
 * previously carried its Critic findings only as far as review_notes --
 * nothing read them back out to inform the NEXT generation attempt, so a
 * regeneration reused the exact prompt that just failed. Reads the most
 * recent unresolved 'qc' note for this shot and extracts the "NEXT
 * ATTEMPT SUGGESTED FIX"/"PRESERVE" pair runShotReview/
 * runKeyframeCandidateReview/runCoverageBeatCandidateReview write above.
 * Returns null when there's no unresolved note or it carries no fix
 * (severity was "none" for the shot's last review) -- callers should
 * build a normal prompt in that case, not treat null as an error.
 */
export function loadSuggestedFix(db: ReturnType<typeof getDb>, shotId: string, scope: NoteScope = {}): SuggestedFix | null {
  // Beat-scoped for the same reason loadShotOverrides is (see
  // matchesBeatScope): runCoverageBeatCandidateReview writes its QC notes
  // under this shot's subject_id too, one per beat, so the most-recent-
  // unresolved-note query below can otherwise return a DIFFERENT beat's
  // correction -- picking up beat 1's fix while regenerating beat 3.
  const rows = db
    .prepare(
      `SELECT note FROM review_notes WHERE subject_type = 'shot' AND subject_id = ? AND source = 'qc' AND resolved = 0
       ORDER BY created_at DESC`
    )
    .all(shotId) as Array<{ note: string }>;
  const row = rows.find((r) => matchesBeatScope(r.note, scope));
  if (!row) return null;
  const fixMatch = row.note.match(NEXT_ATTEMPT_FIX_LINE);
  if (!fixMatch) return null;
  const preserveMatch = row.note.match(NEXT_ATTEMPT_PRESERVE_LINE);
  let criticFindings: CriticFinding[] = [];
  try {
    // Legacy QC rows did not report confidence. They remain unknown rather
    // than acquiring a made-up 0 or 100 score.
    criticFindings = parseCriticFindings(row.note);
  } catch {
    criticFindings = [];
  }
  return { fix: fixMatch[1]!.trim(), preserve: preserveMatch?.[1]?.trim() ?? "everything else", criticFindings };
}

function criticRecord(report: CriticReport): string {
  return `${formatCriticFindings(report.structuredFindings)}\n\n` +
    `Grounded Critic narrative and source provenance:\n${report.findings}\n\n` +
    // Kept as a machine-readable supplement to the visible prose above so
    // existing review_notes can deliver the same per-finding context to a
    // later retry without a second scoring call.
    `CRITIC_FINDINGS_JSON: ${JSON.stringify({ findings: report.structuredFindings })}`;
}

function getProjectIdForShot(db: ReturnType<typeof getDb>, shotId: string): string {
  const row = db.prepare(`SELECT sc.project_id AS project_id FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE s.id = ?`).get(shotId) as
    | { project_id: string }
    | undefined;
  if (!row) throw new Error(`getProjectIdForShot: no shot found with id ${shotId}`);
  return row.project_id;
}

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

/** Prior 'generate' attempts for a shot, excluding the one just reviewed
 *  (which is already inserted by the time review runs) -- see
 *  director-verdict.ts's MAX_AUTOMATIC_RETRIES for why this matters. */
function countPriorGenerateAttempts(db: ReturnType<typeof getDb>, shotId: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM generation_attempts WHERE shot_id = ? AND operation = 'generate'`).get(shotId) as {
    n: number;
  };
  return Math.max(0, row.n - 1);
}

/** Same idea as countPriorGenerateAttempts, but per coverage BEAT rather
 *  than per shot -- a covered_sequence shot's beats are regenerated
 *  somewhat independently of each other. */
function countPriorCoverageBeatAttempts(db: ReturnType<typeof getDb>, beatId: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM coverage_keyframe_attempts WHERE coverage_beat_id = ?`).get(beatId) as { n: number };
  return Math.max(0, row.n - 1);
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
  character_id: string;
  character_name: string;
  reference_path: string | null;
}

function readShotCharacterRows(rows: Record<string, unknown>[]): ShotCharacterRow[] {
  return rows.map((row) => {
    if (
      typeof row.character_id !== "string" ||
      typeof row.character_name !== "string" ||
      (row.reference_path !== null && typeof row.reference_path !== "string")
    ) {
      throw new Error("Expected shot-character rows with string identifiers and an optional reference path.");
    }
    return { character_id: row.character_id, character_name: row.character_name,
      reference_path: approvedWardrobeQcReference(getDb(),getDataDir(),row.character_id)??row.reference_path };
  });
}

interface CandidateAttemptRow extends ShotRow {
  attempt_id: string;
}

/**
 * Reviews one shot end-to-end: runs the Critic's grounded research pass,
 * the two existing automated checks against its current attempt's
 * keyframe, combines them via decideGenerationStatus, writes the result
 * to review_notes and generation_attempts.status, and returns a full
 * report. Does NOT itself trigger a regeneration -- that's
 * runMediaGeneration's job the next time it runs, the same
 * invalidate-then-regenerate handoff canonical-likeness.ts and
 * scene-fidelity.ts's own audits already use.
 *
 * Looks up the shot's MOST RECENT 'generate' attempt regardless of
 * status, not only an 'accepted' one -- media-generation/index.ts needs
 * to call this again for an attempt already downgraded to
 * 'hold_for_review' because its first review never actually completed
 * (a network error, an unparseable Critic response), to retry the review
 * against the SAME existing image rather than spending on a new
 * generation attempt. The normal caller (right after a fresh accepted
 * generation) is unaffected, since that attempt's status is still
 * 'accepted' at the point it calls this.
 */
export async function runShotReview(shotId: string): Promise<ShotReviewReport> {
  const db = getDb();
  const dataDir = getDataDir();

  const shot = db
    .prepare(
      `SELECT s.id, s.action, s.verse_ref, s.continuity_notes, ga.id AS generation_attempt_id, ga.result_asset_path AS generated_path
       FROM shots s
       LEFT JOIN generation_attempts ga ON ga.shot_id = s.id AND ga.operation = 'generate'
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
  assertWardrobeReviewBasis(db,shot.generation_attempt_id);

  const fidelityRow = db.prepare(`SELECT crowd_density, continuity_notes FROM shots WHERE id = ?`).get(shotId) as
    | { crowd_density: string | null; continuity_notes: string | null }
    | undefined;

  const characters = readShotCharacterRows(db
    .prepare(
      `SELECT c.id AS character_id, c.name AS character_name, ref.path AS reference_path
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
    .all(shotId));

  const critic = await runCritic({
    action: shot.action,
    verseRef: shot.verse_ref,
    continuityNotes: shot.continuity_notes,
    crowdDensity: fidelityRow?.crowd_density ?? null,
    generatedImagePath: generatedAbsPath,
    scriptureText: loadScriptureText(db, dataDir, shotId, shot.verse_ref),
    characterReferences: toCriticReferences(dataDir, characters),
    canonDecisions: loadCanonDecisions(db, getProjectIdForShot(db, shotId)),
    shotOverrides: loadShotOverrides(db, shotId)
  });

  let likenessAligned = true;
  for (const character of characters) {
    if (!character.reference_path) continue;
    const referenceAbsPath = join(dataDir, "assets", character.reference_path);
    if (!existsSync(referenceAbsPath)) continue;
    const verdict = await checkCanonicalLikeness(character.character_name, referenceAbsPath, generatedAbsPath);
    if (!isLikenessAligned(verdict.score, undefined, verdict.instanceCount, 1, verdict.wardrobeStatus)) {
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

  const decision = decideGenerationStatus({
    criticSeverity: critic.severity,
    likenessAligned,
    fidelityAligned,
    priorAttemptCount: countPriorGenerateAttempts(db, shotId)
  });

  const report =
    `Director decision for this shot: ${decision.status} -- ${decision.reasoning}\n\n` +
    `Critic (severity: ${critic.severity}):\n${criticRecord(critic)}\n\n` +
    `Canonical likeness: ${likenessAligned ? "passed" : "FAILED"}. Scene fidelity: ${fidelityAligned ? "passed" : "FAILED"}.` +
    // Distinct labels from critic.ts's own "SUGGESTED FIX:"/"PRESERVE:" trailer lines (already embedded above via
    // critic.findings) -- these are the FINAL, post-override values (see runCritic's crowd-duplicate override),
    // which can differ from the model's own raw trailer line. A parser reading this note back must find these,
    // not accidentally match the model's original (possibly superseded) line first.
    (critic.suggestedFix
      ? `\n\nNEXT ATTEMPT SUGGESTED FIX: ${critic.suggestedFix}\nNEXT ATTEMPT PRESERVE: ${critic.preserve ?? "everything else"}`
      : "");

  const now = Date.now();
  // A fresh review supersedes every earlier unresolved 'qc' note for this
  // shot -- most importantly an earlier "REVIEW STATUS: incomplete" note
  // from a review that previously failed to run. Without this, a
  // SUCCESSFUL re-review left that older note sitting unresolved, so the
  // next stage run's "is this shot's hold recoverable" check kept finding
  // it and retrying forever, even after the attempt was already fixed and
  // its own status already set to 'accepted' below. Reproduced by Codex
  // (2026-09-11): a passing re-review followed by another review of the
  // same image on the very next run.
  db.prepare(`UPDATE review_notes SET resolved = 1 WHERE subject_type = 'shot' AND subject_id = ? AND source = 'qc' AND resolved = 0`).run(
    shotId
  );
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     SELECT ?, sc.project_id, 'shot', ?, 'qc', ?, ?, ?
     FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE s.id = ?`
  ).run(randomUUID(), shotId, report, decision.status === "accepted" ? 1 : 0, now, shotId);

  // Always write the verdict, including 'accepted' -- this review may be
  // re-reviewing an attempt whose status is currently something OTHER
  // than 'accepted' (a retry against an existing image after an earlier
  // incomplete review, see media-generation/index.ts), and a successful
  // verdict must actually clear that back to 'accepted' rather than
  // leaving the row's status stuck at whatever it was downgraded to.
  db.prepare(`UPDATE generation_attempts SET status = ? WHERE id = ?`).run(decision.status, shot.generation_attempt_id);

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
  assertWardrobeReviewBasis(db,attemptId);
  const generatedAbsPath = join(dataDir, "assets", candidate.generated_path);
  if (!existsSync(generatedAbsPath)) throw new Error(`Candidate asset is missing: ${candidate.generated_path}`);

  const fidelityRow = db.prepare(`SELECT crowd_density, continuity_notes FROM shots WHERE id = ?`).get(candidate.id) as
    | { crowd_density: string | null; continuity_notes: string | null }
    | undefined;

  const characters = readShotCharacterRows(db.prepare(
    `SELECT c.id AS character_id, c.name AS character_name, ref.path AS reference_path
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
  ).all(candidate.id));

  const critic = await runCritic({
    action: candidate.action,
    verseRef: candidate.verse_ref,
    continuityNotes: candidate.continuity_notes,
    crowdDensity: fidelityRow?.crowd_density ?? null,
    generatedImagePath: generatedAbsPath,
    scriptureText: loadScriptureText(db, dataDir, candidate.id, candidate.verse_ref),
    characterReferences: toCriticReferences(dataDir, characters),
    canonDecisions: loadCanonDecisions(db, getProjectIdForShot(db, candidate.id)),
    shotOverrides: loadShotOverrides(db, candidate.id)
  });

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
    if (!isLikenessAligned(verdict.score, undefined, verdict.instanceCount, 1, verdict.wardrobeStatus)) {
      likenessAligned = false;
      likenessNotes.push(
        `${character.character_name}: ${verdict.score}/100, ${verdict.instanceCount} instance(s), wardrobe ${verdict.wardrobeStatus} — ` +
        `${verdict.notes} ${verdict.wardrobeNotes}`
      );
    }
  }

  const fidelityVerdict = await checkSceneFidelity(generatedAbsPath, candidate.action,
    fidelityRow?.crowd_density ?? null, fidelityRow?.continuity_notes ?? null);
  const fidelityAligned = isSceneFidelityAligned(fidelityVerdict);
  const decision = decideGenerationStatus({
    criticSeverity: critic.severity,
    likenessAligned,
    fidelityAligned,
    priorAttemptCount: countPriorGenerateAttempts(db, candidate.id)
  });
  const report =
    `Candidate QC decision: ${decision.status} -- ${decision.reasoning}\n\n` +
    `Critic (severity: ${critic.severity}):\n${criticRecord(critic)}\n\n` +
    `Canonical likeness: ${likenessAligned ? "passed" : `FAILED. ${likenessNotes.join(" ")}`}\n` +
    `Scene fidelity: ${fidelityAligned ? "passed" : `FAILED. ${fidelityVerdict.notes}`}` +
    // Distinct labels from critic.ts's own "SUGGESTED FIX:"/"PRESERVE:" trailer lines (already embedded above via
    // critic.findings) -- these are the FINAL, post-override values (see runCritic's crowd-duplicate override),
    // which can differ from the model's own raw trailer line. A parser reading this note back must find these,
    // not accidentally match the model's original (possibly superseded) line first.
    (critic.suggestedFix
      ? `\n\nNEXT ATTEMPT SUGGESTED FIX: ${critic.suggestedFix}\nNEXT ATTEMPT PRESERVE: ${critic.preserve ?? "everything else"}`
      : "");
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
  assertWardrobeReviewBasis(db,attemptId);
  const generatedAbsPath = join(dataDir, "assets", candidate.result_asset_path);
  if (!existsSync(generatedAbsPath)) throw new Error(`Candidate asset is missing: ${candidate.result_asset_path}`);

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
    `SELECT c.id AS character_id, c.name AS character_name, ref.path AS reference_path
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
  const characters = readShotCharacterRows([...characterIds]
    .map((id) => characterRefQuery.get(id) as ShotCharacterRow | undefined)
    .filter((c): c is ShotCharacterRow => c !== undefined) as unknown as Record<string,unknown>[]);

  // The preceding beat's own candidate keyframe (if it has one yet),
  // for the Critic's coverage-beat-continuity check (item 9 in its
  // prompt) -- runCritic already supports this via
  // precedingCoverageFrame, but this review path never actually supplied
  // it, so that check silently never ran for any coverage beat.
  const precedingBeatRow =
    candidate.beat_sequence > 1
      ? (db
          .prepare(`SELECT beat_type, notes, keyframe_asset_path FROM coverage_beats WHERE shot_id = ? AND sequence = ?`)
          .get(candidate.shot_id, candidate.beat_sequence - 1) as
          | { beat_type: string; notes: string | null; keyframe_asset_path: string | null }
          | undefined)
      : undefined;
  const precedingCoverageFrame =
    precedingBeatRow?.keyframe_asset_path && existsSync(assetPath(dataDir, precedingBeatRow.keyframe_asset_path))
      ? {
          label: `beat ${candidate.beat_sequence - 1} (${precedingBeatRow.beat_type})`,
          imagePath: assetPath(dataDir, precedingBeatRow.keyframe_asset_path),
          description: precedingBeatRow.notes ?? ""
        }
      : undefined;

  // Tell the Critic this is one beat of a covered sequence, not a normal
  // single_clip shot -- without this it has no way to know a cutaway/insert
  // may deliberately omit the shot's own action subject (e.g. an
  // over-the-shoulder framing that doesn't show Jesus's face), and would
  // otherwise judge it against the whole shot's action text instead of this
  // beat's own narrower purpose.
  const critic = await runCritic({
    action: candidate.action,
    verseRef: candidate.verse_ref,
    continuityNotes: candidate.continuity_notes,
    crowdDensity: candidate.crowd_density,
    generatedImagePath: generatedAbsPath,
    scriptureText: loadScriptureText(db, dataDir, candidate.shot_id, candidate.verse_ref),
    characterReferences: toCriticReferences(dataDir, characters),
    canonDecisions: loadCanonDecisions(db, getProjectIdForShot(db, candidate.shot_id)),
    // Beat-scoped: an exception recorded for one beat's candidate (e.g.
    // "the missing debris here is fine, people obscure the floor") must
    // not silently excuse a DIFFERENT beat where the same thing is
    // clearly, unambiguously visible. See matchesBeatScope.
    shotOverrides: loadShotOverrides(db, candidate.shot_id, { beatId: candidate.beat_id, attemptId }),
    precedingCoverageFrame,
    coverageBeat: { sequence: candidate.beat_sequence, type: candidate.beat_type, notes: candidate.beat_notes ?? "" }
  });

  // Which character(s) this SPECIFIC beat actually requires to be
  // visible and checkable -- NOT the full shot cast used for the
  // Critic's references above. A lip_sync_insert or a cutaway with a
  // chosen reaction subject mandates exactly that one character
  // (coverage_beats.character_id); a master (or any beat with no
  // character_id set) mandates none -- per schema.sql's own comment,
  // character_id is "NULL for a master/cutaway until a human or Codex
  // picks the reaction subject," i.e. there is no single figure this
  // wide/establishing beat is required to hold identity-consistent for.
  // Running the shot's FULL cast through this check (as before) meant a
  // scribe-only cutaway failed likeness because Jesus -- deliberately
  // off-screen -- couldn't be found: reproduced and confirmed wrong.
  let likenessAligned = true;
  const likenessNotes: string[] = [];
  // Distinguish "this beat has no selected subject" (beat_character_id is
  // NULL -- skip, nothing to check, likenessAligned stays true) from "its
  // selected subject has no usable approved reference" (beat_character_id
  // IS set, but `characters` -- built from an inner join on an approved
  // character_versions row -- doesn't contain it, because that character
  // has no approved version at all). The two collapsed into the same
  // "not found" shape before this fix, so the second case silently PASSED
  // likeness instead of holding for review: reproduced by Codex
  // (2026-09-11) as an accepted verdict with no likeness check performed.
  if (candidate.beat_character_id) {
    const requiredCharacter = characters.find((c) => c.character_id === candidate.beat_character_id);
    if (!requiredCharacter) {
      likenessAligned = false;
      likenessNotes.push(`Required character (id ${candidate.beat_character_id}) has no approved version -- cannot verify identity.`);
    } else if (!requiredCharacter.reference_path) {
      likenessAligned = false;
      likenessNotes.push(`${requiredCharacter.character_name} has no approved comparison asset`);
    } else {
      const referenceAbsPath = join(dataDir, "assets", requiredCharacter.reference_path);
      if (!existsSync(referenceAbsPath)) {
        likenessAligned = false;
        likenessNotes.push(`${requiredCharacter.character_name}'s approved comparison asset is missing`);
      } else {
        const verdict = await checkCanonicalLikeness(requiredCharacter.character_name, referenceAbsPath, generatedAbsPath);
        if (!isLikenessAligned(verdict.score, undefined, verdict.instanceCount, 1, verdict.wardrobeStatus)) {
          likenessAligned = false;
          likenessNotes.push(
            `${requiredCharacter.character_name}: ${verdict.score}/100, ${verdict.instanceCount} instance(s), wardrobe ` +
            `${verdict.wardrobeStatus} — ${verdict.notes} ${verdict.wardrobeNotes}`
          );
        }
      }
    }
  }

  // Same reasoning as the action passed to runCritic above -- this
  // beat's own purpose (e.g. "brief reaction/cutaway while dialogue
  // continues") is what the frame should actually show, not the parent
  // shot's whole action, which a narrow beat only depicts a slice of.
  const fidelityVerdict = await checkSceneFidelity(
    generatedAbsPath,
    candidate.beat_notes || candidate.action,
    candidate.crowd_density,
    candidate.continuity_notes
  );
  const fidelityAligned = isSceneFidelityAligned(fidelityVerdict);
  const decision = decideGenerationStatus({
    criticSeverity: critic.severity,
    likenessAligned,
    fidelityAligned,
    priorAttemptCount: countPriorCoverageBeatAttempts(db, candidate.beat_id)
  });
  const report =
    `Candidate QC decision (coverage beat ${candidate.beat_sequence}, ${candidate.beat_type}): ${decision.status} -- ${decision.reasoning}\n\n` +
    `Critic (severity: ${critic.severity}):\n${criticRecord(critic)}\n\n` +
    `Canonical likeness: ${likenessAligned ? "passed" : `FAILED. ${likenessNotes.join(" ")}`}\n` +
    `Scene fidelity: ${fidelityAligned ? "passed" : `FAILED. ${fidelityVerdict.notes}`}` +
    // Distinct labels from critic.ts's own "SUGGESTED FIX:"/"PRESERVE:" trailer lines (already embedded above via
    // critic.findings) -- these are the FINAL, post-override values (see runCritic's crowd-duplicate override),
    // which can differ from the model's own raw trailer line. A parser reading this note back must find these,
    // not accidentally match the model's original (possibly superseded) line first.
    (critic.suggestedFix
      ? `\n\nNEXT ATTEMPT SUGGESTED FIX: ${critic.suggestedFix}\nNEXT ATTEMPT PRESERVE: ${critic.preserve ?? "everything else"}`
      : "");
  db.prepare(
    `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
     SELECT ?, sc.project_id, 'shot', ?, 'qc', ?, 0, ?
     FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE s.id=?`
  ).run(
    randomUUID(),
    candidate.shot_id,
    // Beat-tagged (not attempt-tagged): loadSuggestedFix should hand its
    // correction to the NEXT candidate of this same beat, so this note
    // deliberately stays a standing per-beat record, not scoped to only
    // the one attempt that just failed. See matchesBeatScope.
    tagNote({ beatId: candidate.beat_id }, `Coverage-beat candidate ${attemptId} composite QC\n${report}`),
    Date.now(),
    candidate.shot_id
  );
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
