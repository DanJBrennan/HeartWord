import type { DatabaseSync } from "node:sqlite";
import { parseVerseRange } from "../scene-breakdown/build-scenes.js";
import { MAX_SINGLE_CLIP_LIPSYNC_MS } from "./coverage.js";

const GAP_TOLERANCE_MS = 1000;

export type ShotDurationSource = "assembled_clip" | "assumed_default";

export interface NarrationCoverageShot {
  shotId: string;
  verseRef: string;
  durationMs: number;
  durationSource: ShotDurationSource;
}

export interface NarrationCoverageSpan {
  verseRef: string;
  verseRefSource: "raw" | "correction";
  realMs: number;
  coveredMs: number;
  gapMs: number;
  status: "ok" | "short" | "overlap_check";
  shots: NarrationCoverageShot[];
}

/** Narration audio deliberately excluded from the coverage question, or
 *  impossible to place against the shot plan -- surfaced rather than
 *  silently dropped, since dropping it understates the real gap. */
export interface NarrationCoverageExclusion {
  segmentId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  reason: "editorial" | "unplaceable";
}

export interface NarrationCoverageReport {
  spans: NarrationCoverageSpan[];
  excluded: NarrationCoverageExclusion[];
  totalRealMs: number;
  totalCoveredMs: number;
  totalGapMs: number;
  /** Editorial (title/cross-reference) narration -- not Scripture needing
   *  visual coverage, so excluded from totalRealMs by design. */
  editorialMs: number;
  /** Real narration with no resolvable verse reference, so it can't be
   *  matched to any shot. Excluded from totalRealMs, but the true chapter
   *  gap is at least totalGapMs + unplaceableMs. */
  unplaceableMs: number;
}

/**
 * Advisory, planning-time narration-coverage report. Generalizes
 * scripts/report-narration-coverage.ts's gap math -- previously hardcoded
 * to one project and only computable AFTER media generation, since it read
 * real assembled-clip durations -- to run for any project at any pipeline
 * stage, including before a single shot has been generated. See
 * docs/plans/CURRENT_GOAL.md, 2026-09-20, for why this moved earlier: the
 * real narration-audio timing this depends on is already known from
 * alignment, long before any video exists.
 *
 * A non-dialogue shot's duration is its real assembled clip's length once
 * one has been accepted; before that, it's assumed to be
 * MAX_SINGLE_CLIP_LIPSYNC_MS -- a single generation call's practical
 * ceiling, and the most generous single-shot assumption available, so a
 * reported shortfall is a genuine one rather than an artifact of
 * underestimating. This lets the same report stay meaningful across a
 * chapter's whole lifecycle: fully-assumed before generation, fully-real
 * after, naturally mixed in between as shots get accepted one at a time.
 *
 * Dialogue (needs_lip_sync) shots never count as narration coverage --
 * their real dialogue audio plays in its own separate
 * composite_cast_master slot (docs/design/timeline.md), and their own
 * duration adequacy is already handled by planCoverage/coveragePlan
 * (coverage.ts) at casting time. This report is specifically about the
 * narration-only stretches that play underneath non-dialogue shots.
 *
 * A shot counts toward a span it OVERLAPS, not only one that wholly
 * contains it, and each shot is claimed by exactly one span (the earliest
 * it overlaps). Containment alone silently dropped every multi-verse shot
 * -- a shot planned for "Mark 3:16-17" is wider than either of the
 * narrower "mark 3:16"/"mark 3:17" narration rows, so it satisfied
 * neither and was counted as covering nothing. Overlap does not risk the
 * double-counting that coverage.ts's verseRangesRelated guards against:
 * that path sums every matching audio segment with no claim set, whereas
 * claimedShotIds here already caps each shot at one span globally. Per-span
 * attribution is therefore approximate for a shot straddling several
 * spans (its whole duration lands on the first), while the chapter totals
 * are exact.
 *
 * A segment's verse reference is read through the same overlay the API
 * projection uses (source-alignment corrections win over the raw column;
 * an editorial classification means title/cross-reference material, not
 * Scripture narration). Reading the raw column alone dropped real
 * narration -- including segments a human had explicitly corrected, and
 * the children of any recorded segment split, which start with a null
 * verse_ref by design.
 *
 * Purely advisory: never blocks anything, never writes anything, makes no
 * provider calls. A reported shortfall is a producer's cue to consider the
 * existing Creative Director / Production Director gap-filling
 * negotiation (creative-direction/index.ts's proposeGapFillers /
 * production-director.ts's negotiateGapProposal), not an automatic
 * trigger for it -- that negotiation makes its own (small, now
 * cost-tracked) real Gemini calls, so running it stays an explicit choice.
 */
export function computeNarrationCoverage(db: DatabaseSync, projectId: string): NarrationCoverageReport {
  const narrationSegs = db.prepare(
    `SELECT id, verse_ref, start_ms, end_ms FROM audio_segments
     WHERE project_id = ? AND layer = 'original_reading' AND speaker_character_id IS NULL
     ORDER BY start_ms`
  ).all(projectId) as Array<{ id: string; verse_ref: string | null; start_ms: number; end_ms: number }>;

  // Same precedence as the API's own alignment projection (projects.ts):
  // a human correction outranks the raw column; an editorial
  // classification marks title/cross-reference material rather than
  // Scripture. Later rows win, so iterate in created_at order.
  const correctedVerseRef = new Map<string, string>();
  for (const row of db.prepare(
    "SELECT audio_segment_id, verse_ref FROM source_alignment_corrections WHERE project_id = ? ORDER BY created_at"
  ).all(projectId) as Array<{ audio_segment_id: string; verse_ref: string }>) {
    correctedVerseRef.set(row.audio_segment_id, row.verse_ref);
  }
  const editorialSegmentIds = new Set(
    (db.prepare(
      "SELECT audio_segment_id FROM source_alignment_editorial_classifications WHERE project_id = ?"
    ).all(projectId) as Array<{ audio_segment_id: string }>).map(row => row.audio_segment_id)
  );

  const shots = db.prepare(
    `SELECT s.id, s.verse_ref, s.needs_lip_sync
     FROM shots s JOIN scenes sc ON sc.id = s.scene_id
     WHERE sc.project_id = ? AND s.verse_ref IS NOT NULL
     ORDER BY sc.sequence, s.sequence`
  ).all(projectId) as Array<{ id: string; verse_ref: string; needs_lip_sync: number }>;

  const clipDurationStmt = db.prepare(
    `SELECT cl.timeline_end_ms - cl.timeline_start_ms AS dur
     FROM clips cl JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
     WHERE cl.shot_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
     ORDER BY ga.created_at DESC LIMIT 1`
  );

  // A shot overlapping several spans plays once in the real timeline, so
  // it is claimed by exactly one: the earliest it overlaps. This set --
  // not the match rule -- is what prevents a shot being counted twice.
  const claimedShotIds = new Set<string>();
  const spans: NarrationCoverageSpan[] = [];
  const excluded: NarrationCoverageExclusion[] = [];
  let totalRealMs = 0;
  let totalCoveredMs = 0;
  let editorialMs = 0;
  let unplaceableMs = 0;

  for (const seg of narrationSegs) {
    const realMs = seg.end_ms - seg.start_ms;
    const correction = correctedVerseRef.get(seg.id);
    const verseRef = correction ?? seg.verse_ref;
    if (!correction && editorialSegmentIds.has(seg.id)) {
      editorialMs += realMs;
      excluded.push({ segmentId: seg.id, startMs: seg.start_ms, endMs: seg.end_ms, durationMs: realMs, reason: "editorial" });
      continue;
    }
    if (!verseRef) {
      unplaceableMs += realMs;
      excluded.push({ segmentId: seg.id, startMs: seg.start_ms, endMs: seg.end_ms, durationMs: realMs, reason: "unplaceable" });
      continue;
    }
    const { start: segStart, end: segEnd } = parseVerseRange(verseRef);
    totalRealMs += realMs;

    const covering = shots.filter(s => {
      if (s.needs_lip_sync) return false;
      if (claimedShotIds.has(s.id)) return false;
      const { start, end } = parseVerseRange(s.verse_ref);
      return start <= segEnd && end >= segStart;
    });
    covering.forEach(s => claimedShotIds.add(s.id));

    let coveredMs = 0;
    const shotDetails: NarrationCoverageShot[] = covering.map(s => {
      const clip = clipDurationStmt.get(s.id) as { dur: number } | undefined;
      const durationMs = clip?.dur ?? MAX_SINGLE_CLIP_LIPSYNC_MS;
      const durationSource: ShotDurationSource = clip ? "assembled_clip" : "assumed_default";
      coveredMs += durationMs;
      return { shotId: s.id, verseRef: s.verse_ref, durationMs, durationSource };
    });
    totalCoveredMs += coveredMs;

    const gapMs = realMs - coveredMs;
    const status = gapMs > GAP_TOLERANCE_MS ? "short" : gapMs < -GAP_TOLERANCE_MS ? "overlap_check" : "ok";
    spans.push({
      verseRef, verseRefSource: correction ? "correction" : "raw",
      realMs, coveredMs, gapMs, status, shots: shotDetails
    });
  }

  return {
    spans, excluded,
    totalRealMs, totalCoveredMs, totalGapMs: totalRealMs - totalCoveredMs,
    editorialMs, unplaceableMs
  };
}
