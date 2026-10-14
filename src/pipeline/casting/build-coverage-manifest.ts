/**
 * DB glue for coverage-manifest.ts's pure planCoverageBeats() -- same
 * split as coverage.ts (pure logic) vs. index.ts (DB/Gemini glue). Reads a
 * covered_sequence shot's real dialogue duration straight from
 * audio_segments (the same verse-range-overlap match casting/index.ts uses
 * when it first decides coveragePlan), plans the beats, and writes them to
 * `coverage_beats`.
 *
 * Idempotent re-plan: only replaces beats still in 'planned' status for a
 * shot. A beat already 'generated' or 'accepted' (real media exists for
 * it) is left alone -- re-running this after some beats are already shot
 * must never orphan or duplicate that work. If ANY beat for a shot is past
 * 'planned', the shot is skipped entirely and reported, rather than
 * silently mixing an old plan's accepted beats with a new plan's
 * different cut points.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../../db/client.js";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import { planCoverageBeats } from "./coverage-manifest.js";
import { computeDialogueDurationMs, planCoverage, verseRangesRelated } from "./coverage.js";
import { readConfirmedSpeechRuns } from "../ingestion/continuous-speech.js";

interface CoveredShotRow {
  id: string;
  verse_ref: string | null;
  dialogue_character_id: string | null;
}

interface DialogueSegmentRow {
  start_ms: number;
  end_ms: number;
  verse_ref: string | null;
}

export interface ShotManifestResult {
  shotId: string;
  verseRef: string | null;
  status: "planned" | "skipped_existing_progress" | "skipped_unparseable_verse" | "skipped_no_dialogue" | "needs_exact_interval";
  beatCount: number;
  detail?: string;
}

export interface BuildManifestsResult {
  ok: boolean;
  reasoning: string;
  shots: ShotManifestResult[];
}

function dialogueDurationForShot(
  db: DatabaseSync,
  projectId: string,
  characterId: string,
  verseStart: number,
  verseEnd: number,
  shotId: string
): number | null {
  const binding = db.prepare("SELECT source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?").get(shotId) as { source_start_ms: number; source_end_ms: number } | undefined;
  if (binding) return binding.source_end_ms - binding.source_start_ms;
  const runs = readConfirmedSpeechRuns(db, projectId);
  if (runs.some(r => r.characterId === characterId && verseRangesRelated(parseVerseRange(r.verseRef), { start: verseStart, end: verseEnd }))) return null;
  const rows = db
    .prepare(
      `SELECT start_ms, end_ms, verse_ref FROM audio_segments
       WHERE project_id = ? AND layer = 'composite_cast_master' AND speaker_character_id = ? AND verse_ref IS NOT NULL`
    )
    .all(projectId, characterId) as unknown as DialogueSegmentRow[];

  const matching = rows
    .filter((s) => verseRangesRelated(parseVerseRange(s.verse_ref!), { start: verseStart, end: verseEnd }))
  if (matching.some(s => { const ref = parseVerseRange(s.verse_ref!); return ref.start < verseStart || ref.end > verseEnd; })) return null;

  return computeDialogueDurationMs(matching.map(s => ({ startMs: s.start_ms, endMs: s.end_ms })));
}

export interface ReconcileResult {
  shotId: string;
  verseRef: string | null;
  from: string;
  to: string;
  durationMs: number;
  plannedBeatsRemoved: number;
}

/**
 * Re-checks every lip-synced shot's coverage_plan against its CURRENT real
 * dialogue duration and corrects any that have gone stale -- e.g. after
 * split-segment.ts divides a shared audio_segments row into per-verse
 * pieces, a shot that used to inherit a whole neighboring speech's
 * duration may now genuinely fit in one clip. Only ever downgrades
 * covered_sequence -> single_clip or upgrades single_clip ->
 * covered_sequence to match reality; never touches framing, action, or
 * any other casting decision (full re-casting is deliberately out of
 * scope here -- it deletes shot-associated records, per
 * docs/production/CODEX_HANDOFF.md).
 *
 * Downgrading to single_clip removes that shot's still-'planned' coverage
 * beats (they're no longer needed) -- exactly like buildCoverageManifestsForProject,
 * a beat already 'generated'/'accepted' is left alone and reported instead
 * of silently discarded, since that would destroy real completed work.
 */
export function reconcileCoveragePlans(projectId: string): ReconcileResult[] {
  const db = getDb();

  const shots = db
    .prepare(
      `SELECT id, verse_ref, dialogue_character_id, coverage_plan, coverage_notes FROM shots
       WHERE needs_lip_sync = 1 AND dialogue_character_id IS NOT NULL
         AND scene_id IN (SELECT id FROM scenes WHERE project_id = ?)`
    )
    .all(projectId) as unknown as Array<CoveredShotRow & { coverage_plan: string; coverage_notes: string | null }>;

  const updateShot = db.prepare(`UPDATE shots SET coverage_plan = ?, coverage_notes = ? WHERE id = ?`);
  const deletePlannedBeats = db.prepare(`DELETE FROM coverage_beats WHERE shot_id = ? AND status = 'planned'`);
  const countPlannedBeats = db.prepare(`SELECT COUNT(*) as n FROM coverage_beats WHERE shot_id = ? AND status = 'planned'`);

  const results: ReconcileResult[] = [];

  for (const shot of shots) {
    if (!shot.verse_ref || !shot.dialogue_character_id) continue;
    let verseStart: number, verseEnd: number;
    try {
      ({ start: verseStart, end: verseEnd } = parseVerseRange(shot.verse_ref));
    } catch {
      continue; // same unparseable-verse case build-coverage-manifest.ts already reports
    }

    const durationMs = dialogueDurationForShot(db, projectId, shot.dialogue_character_id, verseStart, verseEnd, shot.id);
    if (durationMs === null || durationMs <= 0) continue;

    const recomputed = planCoverage(durationMs);
    // Compare notes too, not just the plan enum -- a duration correction
    // that doesn't cross the single_clip/covered_sequence threshold (e.g.
    // Scene 1 Shot 8's real 18.8s vs. its wrongly-computed 36.8s, both
    // still covered_sequence) would otherwise leave stale, wrong-duration
    // text sitting in shots.coverage_notes indefinitely.
    if (recomputed.coveragePlan === shot.coverage_plan && recomputed.notes === shot.coverage_notes) continue;

    let plannedBeatsRemoved = 0;
    if (recomputed.coveragePlan === "single_clip" && shot.coverage_plan !== "single_clip") {
      plannedBeatsRemoved = (countPlannedBeats.get(shot.id) as { n: number }).n;
      deletePlannedBeats.run(shot.id);
    }
    updateShot.run(recomputed.coveragePlan, recomputed.notes, shot.id);

    results.push({
      shotId: shot.id,
      verseRef: shot.verse_ref,
      from: shot.coverage_plan,
      to: recomputed.coveragePlan,
      durationMs,
      plannedBeatsRemoved
    });
  }

  return results;
}

/**
 * Plans (or replans) coverage beats for every covered_sequence shot in a
 * project. Safe to call repeatedly -- see module docstring for the
 * skip-if-in-progress rule. Does NOT reconcile stale coverage_plan values
 * itself -- call reconcileCoveragePlans() first (the CLI script does).
 */
export function buildCoverageManifestsForProject(projectId: string): BuildManifestsResult {
  const db = getDb();

  const shots = db
    .prepare(
      `SELECT id, verse_ref, dialogue_character_id FROM shots
       WHERE coverage_plan = 'covered_sequence'
         AND scene_id IN (SELECT id FROM scenes WHERE project_id = ?)
       ORDER BY scene_id, sequence`
    )
    .all(projectId) as unknown as CoveredShotRow[];

  const insertBeat = db.prepare(
    `INSERT INTO coverage_beats
       (id, shot_id, sequence, beat_type, audio_start_ms, audio_end_ms, audio_confidence,
        needs_lip_sync, character_id, requires_new_keyframe, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'planned', ?)`
  );
  const deletePlanned = db.prepare(`DELETE FROM coverage_beats WHERE shot_id = ? AND status = 'planned'`);
  const countNonPlanned = db.prepare(
    `SELECT COUNT(*) as n FROM coverage_beats WHERE shot_id = ? AND status != 'planned'`
  );

  const results: ShotManifestResult[] = [];
  const now = Date.now();

  for (const shot of shots) {
    const existingProgress = (countNonPlanned.get(shot.id) as { n: number }).n;
    if (existingProgress > 0) {
      results.push({
        shotId: shot.id,
        verseRef: shot.verse_ref,
        status: "skipped_existing_progress",
        beatCount: 0,
        detail: `${existingProgress} beat(s) already generated/accepted -- replan would orphan or duplicate that work.`
      });
      continue;
    }

    if (!shot.verse_ref || !shot.dialogue_character_id) {
      results.push({ shotId: shot.id, verseRef: shot.verse_ref, status: "skipped_no_dialogue", beatCount: 0 });
      continue;
    }

    let verseStart: number, verseEnd: number;
    try {
      ({ start: verseStart, end: verseEnd } = parseVerseRange(shot.verse_ref));
    } catch {
      results.push({
        shotId: shot.id,
        verseRef: shot.verse_ref,
        status: "skipped_unparseable_verse",
        beatCount: 0,
        detail: `could not parse verseRef "${shot.verse_ref}"`
      });
      continue;
    }

    const durationMs = dialogueDurationForShot(db, projectId, shot.dialogue_character_id, verseStart, verseEnd, shot.id);
    if (durationMs === null) {
      results.push({ shotId: shot.id, verseRef: shot.verse_ref, status: "needs_exact_interval", beatCount: 0,
        detail: "Speaker attribution covers the speech; an exact performance/phrase window is still required for timed coverage. Verse metadata does not partition the soundtrack." });
      continue;
    }
    if (durationMs <= 0) {
      results.push({ shotId: shot.id, verseRef: shot.verse_ref, status: "skipped_no_dialogue", beatCount: 0 });
      continue;
    }

    const beats = planCoverageBeats(durationMs);

    db.exec("BEGIN TRANSACTION");
    try {
      deletePlanned.run(shot.id);
      for (const beat of beats) {
        insertBeat.run(
          randomUUID(),
          shot.id,
          beat.sequence,
          beat.beatType,
          beat.audioStartMs,
          beat.audioEndMs,
          beat.needsLipSync ? 1 : 0,
          beat.needsLipSync ? shot.dialogue_character_id : null,
          beat.requiresNewKeyframe ? 1 : 0,
          beat.notes,
          now
        );
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    results.push({ shotId: shot.id, verseRef: shot.verse_ref, status: "planned", beatCount: beats.length });
  }

  const planned = results.filter((r) => r.status === "planned").length;
  const skipped = results.length - planned;
  return {
    ok: true,
    reasoning:
      `Coverage manifest planning for ${results.length} covered_sequence shot(s): ${planned} planned, ` +
      `${skipped} skipped (already in progress, missing dialogue, or an unparseable verse range).`,
    shots: results
  };
}
