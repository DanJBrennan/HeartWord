/**
 * Shared acoustic-corroboration scoring for Hatam Mark 2's quote/speaker
 * decisions (mark-2-quote-decisions.ts). Extracted from
 * scripts/quote-alignment/mark-2-drama-v3.ts so the real pipeline's
 * ingestion stage (see mark-2-segments.ts) and that standalone report
 * script compute the exact same numbers from one place, rather than two
 * copies that could drift apart.
 *
 * This is REAL, load-bearing pipeline logic now, not just a diagnostic
 * script's internals -- see docs/plans/CURRENT_GOAL.md's "wire in today's
 * Mark 2 work as-is" decision (2026-09-05+1). It is still explicitly
 * Mark-2-specific (a hand-authored 13-decision array, not a general
 * chapter-agnostic algorithm) -- a deliberate v1 simplification, not an
 * oversight. See mark-2-quote-decisions.ts's own header for why, and
 * docs/ARCHITECTURE.md's "Real vocal isolation achieved" section for the
 * acoustic methodology this implements (3-second-binned narrator
 * baseline, peak-search within each estimated window, before/after
 * "bracket" check) and its findings on Hatam Mark 2 specifically.
 */
import type { PitchFrame } from "./pitch.js";
import { meanPitchInRange } from "./pitch.js";
import {
  DECISIONS,
  extractQuoteSpan,
  estimateTimingWindow,
  type QuoteDecision,
  type QuoteSpan
} from "./mark-2-quote-decisions.js";
import type { SilenceGap } from "./detect-silences.js";
import type { VerseRecord } from "./parse-source-text.js";

const BIN_SEC = 3;
const Z_SCORE_THRESHOLD = 2;
const BRACKET_Z_THRESHOLD = 1;
const BRACKET_MARGIN_SEC = 3;

export interface Bin {
  tStartSec: number;
  tEndSec: number;
  meanHz: number | null;
  voicedFrameCount: number;
}

export function buildBinTrack(track: PitchFrame[], totalDurationSec: number): Bin[] {
  const bins: Bin[] = [];
  for (let t = 0; t < totalDurationSec; t += BIN_SEC) {
    const r = meanPitchInRange(track, t, t + BIN_SEC);
    bins.push({ tStartSec: t, tEndSec: t + BIN_SEC, meanHz: r.meanHz, voicedFrameCount: r.voicedFrameCount });
  }
  return bins;
}

export interface NarratorStats {
  meanHz: number;
  stdHz: number;
  sampleCount: number;
}

export function computeNarratorStats(bins: Bin[], exclusionZonesSec: Array<[number, number]>): NarratorStats | null {
  const binMeans: number[] = [];
  for (const bin of bins) {
    if (bin.meanHz === null || bin.voicedFrameCount < 5) continue;
    const excluded = exclusionZonesSec.some(([start, end]) => bin.tStartSec < end && bin.tEndSec > start);
    if (!excluded) binMeans.push(bin.meanHz);
  }
  if (binMeans.length < 15) return null;
  const meanHz = binMeans.reduce((a, b) => a + b, 0) / binMeans.length;
  const variance = binMeans.reduce((sum, hz) => sum + (hz - meanHz) ** 2, 0) / (binMeans.length - 1);
  return { meanHz: Math.round(meanHz * 10) / 10, stdHz: Math.round(Math.sqrt(variance) * 10) / 10, sampleCount: binMeans.length };
}

function zScoreOf(hz: number, narrator: NarratorStats): number {
  return narrator.stdHz > 0 ? (hz - narrator.meanHz) / narrator.stdHz : 0;
}

export interface AcousticVerdict {
  peakHz: number | null;
  peakZ: number | null;
  peakTimeSec: number | null;
  beforeHz: number | null;
  afterHz: number | null;
  distinctVoice: boolean;
  bracketConfirmed: boolean;
  note: string;
}

export function checkAcoustics(
  track: PitchFrame[],
  bins: Bin[],
  narrator: NarratorStats | null,
  refinedStartMs: number,
  refinedEndMs: number
): AcousticVerdict {
  if (narrator === null) {
    return {
      peakHz: null, peakZ: null, peakTimeSec: null, beforeHz: null, afterHz: null,
      distinctVoice: false, bracketConfirmed: false,
      note: "Not enough narrator-only audio elsewhere in the chapter to build a reliable pitch baseline for comparison."
    };
  }

  const startSec = refinedStartMs / 1000;
  const endSec = refinedEndMs / 1000;
  const windowBins = bins.filter((b) => b.tStartSec < endSec && b.tEndSec > startSec && b.meanHz !== null && b.voicedFrameCount >= 5);

  if (windowBins.length === 0) {
    return {
      peakHz: null, peakZ: null, peakTimeSec: null, beforeHz: null, afterHz: null,
      distinctVoice: false, bracketConfirmed: false,
      note: "Not enough voiced audio in this window to estimate pitch."
    };
  }

  let peak = windowBins[0]!;
  let peakZ = zScoreOf(peak.meanHz!, narrator);
  for (const b of windowBins) {
    const z = zScoreOf(b.meanHz!, narrator);
    if (Math.abs(z) > Math.abs(peakZ)) {
      peak = b;
      peakZ = z;
    }
  }

  const distinctVoice = Math.abs(peakZ) > Z_SCORE_THRESHOLD;

  const beforeRange = meanPitchInRange(track, Math.max(0, startSec - BRACKET_MARGIN_SEC), startSec);
  const afterRange = meanPitchInRange(track, endSec, endSec + BRACKET_MARGIN_SEC);
  const beforeHz = beforeRange.voicedFrameCount >= 5 ? beforeRange.meanHz : null;
  const afterHz = afterRange.voicedFrameCount >= 5 ? afterRange.meanHz : null;
  const beforeNear = beforeHz !== null && Math.abs(zScoreOf(beforeHz, narrator)) < BRACKET_Z_THRESHOLD;
  const afterNear = afterHz !== null && Math.abs(zScoreOf(afterHz, narrator)) < BRACKET_Z_THRESHOLD;
  const bracketConfirmed = distinctVoice && beforeNear && afterNear;

  const peakTimeSec = (peak.tStartSec + peak.tEndSec) / 2;
  const direction = peakZ < 0 ? "lower" : "higher";
  let note: string;
  if (distinctVoice && bracketConfirmed) {
    note =
      `Found a ${direction}-pitched peak of ~${peak.meanHz} Hz at ${peakTimeSec.toFixed(1)}s inside this window ` +
      `(z=${peakZ.toFixed(1)} vs. narrator baseline ~${narrator.meanHz} Hz, std ~${narrator.stdHz} Hz), on the separated ` +
      `vocals track -- AND pitch just outside this window on both sides (before ~${beforeHz?.toFixed(0) ?? "n/a"} Hz, ` +
      `after ~${afterHz?.toFixed(0) ?? "n/a"} Hz) returns close to the narrator baseline. This bracket pattern is real ` +
      `corroborating evidence of a distinct voice actor.`;
  } else if (distinctVoice) {
    note =
      `Found a ${direction}-pitched peak of ~${peak.meanHz} Hz at ${peakTimeSec.toFixed(1)}s inside this window ` +
      `(z=${peakZ.toFixed(1)} vs. narrator baseline ~${narrator.meanHz} Hz, std ~${narrator.stdHz} Hz) on the separated ` +
      `vocals track -- a real pitch difference, but the audio just outside this window (before ` +
      `~${beforeHz?.toFixed(0) ?? "n/a"} Hz, after ~${afterHz?.toFixed(0) ?? "n/a"} Hz) didn't clearly return to baseline ` +
      `on both sides, so the "bracket" isn't fully confirmed -- treat as weaker, partial corroboration.`;
  } else {
    note =
      `No bin inside this window (on the separated vocals track) exceeded ${Z_SCORE_THRESHOLD} std devs from the ` +
      `narrator baseline (closest: ~${peak.meanHz} Hz, z=${peakZ.toFixed(1)}) -- no acoustic evidence of a distinct voice ` +
      `actor here. A same-range voice actor would look identical to pitch-only analysis, which cannot separate voices ` +
      `by timbre. Absence of a signal remains inconclusive, not disconfirming.`;
  }

  return { peakHz: peak.meanHz, peakZ, peakTimeSec, beforeHz, afterHz, distinctVoice, bracketConfirmed, note };
}

export interface ScoredUtterance extends QuoteDecision {
  hatamQuote: string;
  refinedStartMs: number;
  refinedEndMs: number;
  startCorroborated: boolean;
  endCorroborated: boolean;
  startConfidence: number;
  endConfidence: number;
  overallConfidence: number;
  acoustic: AcousticVerdict;
}

export interface ScoringInputs {
  verses: VerseRecord[];
  totalDurationMs: number;
  gaps: SilenceGap[];
  track: PitchFrame[];
  gapToleranceMs: number;
}

export interface ScoringResult {
  scored: ScoredUtterance[];
  narrator: NarratorStats | null;
}

/**
 * Runs the full version-3 scoring pass (timing estimate + refinement,
 * whole-chapter narrator baseline, per-decision acoustic corroboration,
 * confidence blending) over every decision in mark-2-quote-decisions.ts,
 * against caller-supplied audio analysis (expected to be the SEPARATED
 * VOCALS track -- see mark-2-segments.ts and
 * docs/ARCHITECTURE.md's "Real vocal isolation achieved" section for why).
 */
export function scoreMark2Utterances(inputs: ScoringInputs): ScoringResult {
  const { verses, totalDurationMs, gaps, track, gapToleranceMs } = inputs;
  const bins = buildBinTrack(track, totalDurationMs / 1000);

  const spans = new Map<string, QuoteSpan>();
  const exclusionZonesSec: Array<[number, number]> = [];
  for (const decision of DECISIONS) {
    const span = extractQuoteSpan(verses, decision);
    spans.set(decision.id, span);
    const rawStartMs = (span.startCharOffset / span.totalChars) * totalDurationMs;
    const rawEndMs = (span.endCharOffset / span.totalChars) * totalDurationMs;
    exclusionZonesSec.push([Math.max(0, rawStartMs / 1000 - 3), rawEndMs / 1000 + 3]);
  }

  const narrator = computeNarratorStats(bins, exclusionZonesSec);

  const scored: ScoredUtterance[] = [];
  for (const decision of DECISIONS) {
    const span = spans.get(decision.id)!;
    const timing = estimateTimingWindow(span, totalDurationMs, gaps, gapToleranceMs);
    const { refinedStartMs, refinedEndMs, startCorroborated, endCorroborated } = timing;

    const acoustic = decision.vocalized
      ? checkAcoustics(track, bins, narrator, refinedStartMs, refinedEndMs)
      : {
          peakHz: null, peakZ: null, peakTimeSec: null, beforeHz: null, afterHz: null,
          distinctVoice: false, bracketConfirmed: false,
          note: "Not applicable -- this passage is not vocalized (see rationale)."
        };

    const baseStart = startCorroborated ? 55 : 25;
    const baseEnd = endCorroborated ? 55 : 25;
    let acousticBonus = 0;
    if (acoustic.distinctVoice) acousticBonus += 15;
    if (acoustic.bracketConfirmed) acousticBonus += 10;
    const startConfidence = Math.min(85, baseStart + acousticBonus);
    const endConfidence = Math.min(85, baseEnd + acousticBonus);
    const overallConfidence = Math.round(0.5 * decision.textConfidence + 0.25 * startConfidence + 0.25 * endConfidence);

    scored.push({
      ...decision,
      hatamQuote: span.hatamQuote,
      refinedStartMs: Math.round(refinedStartMs),
      refinedEndMs: Math.round(refinedEndMs),
      startCorroborated,
      endCorroborated,
      startConfidence,
      endConfidence,
      overallConfidence,
      acoustic
    });
  }

  return { scored, narrator };
}
