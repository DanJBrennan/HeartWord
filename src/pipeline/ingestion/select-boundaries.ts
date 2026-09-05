import type { SilenceGap } from "./detect-silences.js";

export interface SegmentTiming {
  startMs: number;
  endMs: number;
  /**
   * 0-100 assurance score (PRODUCT_VISION.md's Source Material Validator
   * scoring model). null means the boundary is a known fact, not a guess
   * (the chapter's start/end). Every guessed boundary here is capped below
   * 80 — the model's own "hold for a qualified language specialist"
   * threshold — because gap-duration alone, with no ASR/forced-alignment
   * and no ability to read Hatam, is not strong enough evidence to auto-
   * decide a verse-group boundary. See "Known limitations" in
   * docs/ARCHITECTURE.md's ingestion section.
   */
  confidence: number | null;
}

const MAX_HEURISTIC_CONFIDENCE = 75;
const MIN_HEURISTIC_CONFIDENCE = 30;

/**
 * Picks `segmentCount - 1` internal boundaries out of all detected silence
 * gaps, on the heuristic that a boundary between verse-groups tends to be
 * a longer pause than a clause-internal breath — the longest gaps are
 * taken as the boundaries, in chronological order. This is a real but
 * weak signal: it assumes pause length correlates with sense-unit
 * boundaries, which is plausible but unverified for this recording and
 * this language, so every resulting boundary's confidence is capped well
 * below the "auto-decide" threshold (see SegmentTiming.confidence above).
 *
 * Throws if there aren't enough candidate gaps to place every boundary —
 * that's a real signal something is off (wrong audio file, wrong verse
 * count, or a noise floor that's too aggressive) and should surface as a
 * stage failure rather than silently produce fewer segments than the text
 * actually has.
 */
export function selectBoundaries(
  gaps: SilenceGap[],
  segmentCount: number,
  totalDurationMs: number
): SegmentTiming[] {
  if (segmentCount < 1) {
    throw new Error(`selectBoundaries: segmentCount must be >= 1, got ${segmentCount}`);
  }

  const internalBoundaryCount = segmentCount - 1;
  if (gaps.length < internalBoundaryCount) {
    throw new Error(
      `Not enough detected silence gaps (${gaps.length}) to place ${internalBoundaryCount} ` +
        `boundaries for ${segmentCount} text segments. Try a lower noise floor or shorter ` +
        `minimum gap duration (see detect-silences.ts), or confirm the audio actually matches ` +
        `the source text.`
    );
  }

  if (internalBoundaryCount === 0) {
    return [{ startMs: 0, endMs: totalDurationMs, confidence: null }];
  }

  const longestFirst = [...gaps].sort((a, b) => b.durationMs - a.durationMs);
  const chosen = longestFirst.slice(0, internalBoundaryCount);
  const topDurationMs = chosen[0]!.durationMs; // internalBoundaryCount >= 1, checked above

  // Boundary time = the gap's midpoint, so both neighboring segments get a
  // fair share of the silence rather than one absorbing all of it.
  const boundaries = chosen
    .map((gap) => ({
      timeMs: Math.round((gap.startMs + gap.endMs) / 2),
      confidence: confidenceForGap(gap.durationMs, topDurationMs)
    }))
    .sort((a, b) => a.timeMs - b.timeMs);

  const segments: SegmentTiming[] = [];
  let cursorMs = 0;
  let cursorConfidence: number | null = null; // chapter start is certain
  for (const boundary of boundaries) {
    segments.push({ startMs: cursorMs, endMs: boundary.timeMs, confidence: minConfidence(cursorConfidence, boundary.confidence) });
    cursorMs = boundary.timeMs;
    cursorConfidence = boundary.confidence;
  }
  segments.push({ startMs: cursorMs, endMs: totalDurationMs, confidence: cursorConfidence }); // chapter end is certain

  return segments;
}

function confidenceForGap(durationMs: number, topDurationMs: number): number {
  const ratio = topDurationMs > 0 ? durationMs / topDurationMs : 0;
  const scaled = MIN_HEURISTIC_CONFIDENCE + ratio * (MAX_HEURISTIC_CONFIDENCE - MIN_HEURISTIC_CONFIDENCE);
  return Math.round(Math.min(MAX_HEURISTIC_CONFIDENCE, Math.max(MIN_HEURISTIC_CONFIDENCE, scaled)));
}

function minConfidence(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
