/**
 * Builds the final, non-overlapping, chapter-spanning list of audio
 * segments (alternating narration and character dialogue) for Hatam
 * Mark 2, from mark-2-acoustic-scoring.ts's per-decision results --
 * ready for insertion into the real `audio_segments` table. See
 * index.ts's runIngestion for how this plugs into the real pipeline, and
 * docs/plans/CURRENT_GOAL.md's "wire in today's Mark 2 work as-is" entry
 * for why this is deliberately Mark-2-specific rather than a general
 * chapter-agnostic algorithm.
 *
 * Two things this module does that the standalone report script
 * (scripts/quote-alignment/mark-2-drama-v3.ts) never needed to, because a
 * human reading a text report can eyeball inconsistencies a database
 * schema can't tolerate:
 *
 * 1. FILLS THE GAPS. The report only ever showed each of the 13
 *    decisions' own estimated window in isolation. A real segment table
 *    has to cover the WHOLE chapter continuously, so this inserts a
 *    narration segment (speaker NULL) in every gap between one
 *    quotation's end and the next one's start (including before the
 *    first and after the last) -- this is also exactly where Mark 2:6-7
 *    (q2, the scribes' silent reasoning -- not vocalized) ends up: folded
 *    into ordinary narration, since nothing should be voiced as a
 *    separate character line there.
 *
 * 2. RESOLVES OVERLAPS. Each decision's timing window is an INDEPENDENT
 *    proportional-position-plus-nearest-silence-gap estimate (see
 *    mark-2-quote-decisions.ts's estimateTimingWindow) -- nothing ever
 *    checked that adjacent decisions' windows don't overlap, because a
 *    text report just prints each one on its own. They mostly don't, but
 *    one real case does (q3's estimated end and q4's estimated start
 *    overlap by several seconds) -- a genuine finding from actually
 *    trying to build a real timeline, not a synthetic edge case. Resolved
 *    by snapping both to their shared midpoint and marking that boundary
 *    uncorroborated on both sides, with a review note explaining why.
 */
import { minConfidence } from "./select-boundaries.js";
import { fmtTime } from "./mark-2-quote-decisions.js";
import type { ScoredUtterance } from "./mark-2-acoustic-scoring.js";
import type { VerseRecord } from "./parse-source-text.js";

export interface SegmentDescriptor {
  startMs: number;
  endMs: number;
  /** Legacy character id (characters.legacy_identity_id), resolved to a
   *  real characters.id by the caller -- null for narration. */
  speakerLegacyId: string | null;
  verseRef: string;
  /** Timing-only assurance score (audio_segments.confidence's documented
   *  meaning) -- min of this segment's two boundary confidences, null
   *  when a boundary is certain (chapter start/end) rather than
   *  estimated. Deliberately NOT the same number as a quote's
   *  overallConfidence (see reviewNote), which also weighs in text/
   *  speaker-attribution confidence -- that's a different axis. */
  confidence: number | null;
  /** Set (non-null) when this segment needs a language specialist's
   *  confirmation per PRODUCT_VISION.md's Source Material Validator
   *  scoring model -- full context for the reviewer, not just a flag. */
  reviewNote: string | null;
}

const REVIEW_THRESHOLD = 80;
/** Same 55/25 corroborated/uncorroborated convention as
 *  select-boundaries.ts's generic heuristic, applied here to a boundary
 *  shared between a quote and its neighboring narration segment. */
const EDGE_CONFIDENCE_CORROBORATED = 55;
const EDGE_CONFIDENCE_UNCORROBORATED = 25;

function verseLabel(fromVerse: number, toVerse: number, book: string, chapter: number): string {
  const bookLabel = `${book[0]!.toUpperCase()}${book.slice(1)} ${chapter}`;
  return fromVerse === toVerse ? `${bookLabel}:${fromVerse} (narration)` : `${bookLabel}:${fromVerse}-${toVerse} (narration)`;
}

function narrationReviewNote(verseRef: string, startMs: number, endMs: number, confidence: number): string {
  return (
    `Narration segment ${verseRef} (${fmtTime(startMs)}-${fmtTime(endMs)}): at least one boundary is an unconfirmed ` +
    `proportional-position-plus-nearest-silence-gap estimate (confidence ${confidence}/100, below the ` +
    `${REVIEW_THRESHOLD}-point auto-decide threshold) -- a language specialist should confirm against the audio.`
  );
}

export function buildMark2Segments(
  scored: ScoredUtterance[],
  verses: VerseRecord[],
  totalDurationMs: number,
  book: string,
  chapter: number
): SegmentDescriptor[] {
  const vocalized = scored.filter((d) => d.vocalized);
  const lastVerse = Math.max(...verses.map((v) => v.verse));

  // Pass 1: resolve any overlap between consecutive vocalized decisions'
  // windows (see file header) before building segments from them. Works
  // on mutable copies so the caller's ScoredUtterance objects (shared
  // with the report script) aren't mutated.
  interface Edge {
    id: string;
    startMs: number;
    endMs: number;
    startCorroborated: boolean;
    endCorroborated: boolean;
    overlapNote: string | null;
  }
  const edges: Edge[] = vocalized.map((d) => ({
    id: d.id,
    startMs: d.refinedStartMs,
    endMs: d.refinedEndMs,
    startCorroborated: d.startCorroborated,
    endCorroborated: d.endCorroborated,
    overlapNote: null
  }));
  for (let i = 1; i < edges.length; i++) {
    const prev = edges[i - 1]!;
    const curr = edges[i]!;
    if (curr.startMs < prev.endMs) {
      const overlapMs = prev.endMs - curr.startMs;
      const resolved = Math.round((curr.startMs + prev.endMs) / 2);
      const note =
        `${prev.id}'s estimated end (${fmtTime(prev.endMs)}) and ${curr.id}'s estimated start (${fmtTime(curr.startMs)}) ` +
        `overlapped by ${(overlapMs / 1000).toFixed(1)}s -- both are independent proportional-position-plus-nearest-` +
        `silence-gap estimates that were never checked against each other. Resolved to their shared midpoint ` +
        `(${fmtTime(resolved)}); treat this specific boundary as uncorroborated on both sides pending a language ` +
        `specialist's confirmation, regardless of what the timing confidence score below says.`;
      prev.endMs = resolved;
      prev.endCorroborated = false;
      prev.overlapNote = note;
      curr.startMs = resolved;
      curr.startCorroborated = false;
      curr.overlapNote = note;
      if (curr.startMs < prev.endMs) {
        // Would only happen with a chain of 3+ overlapping decisions,
        // which doesn't occur in this chapter's 13 hand-authored
        // decisions -- fail loudly rather than silently emit a
        // still-inconsistent timeline.
        throw new Error(
          `buildMark2Segments: could not resolve overlap chain around ${curr.id} -- ` +
            "pairwise overlap resolution isn't enough here; needs a real look."
        );
      }
    }
  }

  const segments: SegmentDescriptor[] = [];
  let cursorMs = 0;
  let cursorEdgeConfidence: number | null = null; // chapter start is certain

  for (let i = 0; i < vocalized.length; i++) {
    const decision = vocalized[i]!;
    const edge = edges[i]!;
    const edgeStartConfidence = edge.startCorroborated ? EDGE_CONFIDENCE_CORROBORATED : EDGE_CONFIDENCE_UNCORROBORATED;
    const edgeEndConfidence = edge.endCorroborated ? EDGE_CONFIDENCE_CORROBORATED : EDGE_CONFIDENCE_UNCORROBORATED;

    // Narration segment filling the gap since the last quote ended (or
    // since the chapter began, for i === 0). Zero-width gaps (back-to-
    // back quotations with no narration between them, e.g. q7/q8) are
    // skipped rather than emitting an empty segment.
    if (edge.startMs > cursorMs) {
      const fromVerse = i === 0 ? 1 : vocalized[i - 1]!.verseEnd;
      const toVerse = decision.verseStart;
      const verseRef = verseLabel(fromVerse, toVerse, book, chapter);
      const confidence = minConfidence(cursorEdgeConfidence, edgeStartConfidence);
      segments.push({
        startMs: cursorMs,
        endMs: edge.startMs,
        speakerLegacyId: null,
        verseRef,
        confidence,
        reviewNote:
          confidence !== null && confidence < REVIEW_THRESHOLD
            ? narrationReviewNote(verseRef, cursorMs, edge.startMs, confidence)
            : null
      });
    }

    // Quote segment. `confidence` here is deliberately the TIMING-only
    // score (min of the two edges), not decision.overallConfidence,
    // which also folds in text/speaker-attribution confidence -- see
    // SegmentDescriptor's doc comment. The review-note GATE, however,
    // uses overallConfidence, since a segment can have well-corroborated
    // timing but a shaky speaker attribution (e.g. q9) and still needs a
    // human to look at it.
    const quoteConfidence = Math.min(decision.startConfidence, decision.endConfidence);
    let reviewNote: string | null = null;
    if (decision.overallConfidence < REVIEW_THRESHOLD) {
      reviewNote =
        `[${decision.id}] Mark ${chapter}:${decision.verseStart}${decision.verseStart !== decision.verseEnd ? `-${decision.verseEnd}` : ""} -- ` +
        `${decision.speakerLabel}. Hatam evidence: "${decision.evidencePhrase}". Rationale: ${decision.rationale} ` +
        `Confidence -- text: ${decision.textConfidence}/100, start: ${decision.startConfidence}/100, end: ` +
        `${decision.endConfidence}/100, OVERALL: ${decision.overallConfidence}/100 (below the ${REVIEW_THRESHOLD}-point ` +
        `auto-decide threshold in PRODUCT_VISION.md's assurance model -- a language specialist should confirm this ` +
        `quotation's speaker and/or timing against the audio). Acoustic check: ${decision.acoustic.note}` +
        (edge.overlapNote ? ` OVERLAP NOTE: ${edge.overlapNote}` : "");
    } else if (edge.overlapNote) {
      reviewNote = `[${decision.id}] ${edge.overlapNote}`;
    }
    segments.push({
      startMs: edge.startMs,
      endMs: edge.endMs,
      speakerLegacyId: decision.speakerLegacyId,
      verseRef: `Mark ${chapter}:${decision.verseStart}${decision.verseStart !== decision.verseEnd ? `-${decision.verseEnd}` : ""}`,
      confidence: quoteConfidence,
      reviewNote
    });

    cursorMs = edge.endMs;
    cursorEdgeConfidence = edgeEndConfidence;
  }

  // Trailing narration from the last quote to the chapter's end (certain).
  if (cursorMs < totalDurationMs) {
    const fromVerse = vocalized.length > 0 ? vocalized[vocalized.length - 1]!.verseEnd : 1;
    const verseRef = verseLabel(fromVerse, lastVerse, book, chapter);
    const confidence = cursorEdgeConfidence; // right edge (chapter end) is certain -> minConfidence(x, null) = x
    segments.push({
      startMs: cursorMs,
      endMs: totalDurationMs,
      speakerLegacyId: null,
      verseRef,
      confidence,
      reviewNote:
        confidence !== null && confidence < REVIEW_THRESHOLD
          ? narrationReviewNote(verseRef, cursorMs, totalDurationMs, confidence)
          : null
    });
  }

  return segments;
}
