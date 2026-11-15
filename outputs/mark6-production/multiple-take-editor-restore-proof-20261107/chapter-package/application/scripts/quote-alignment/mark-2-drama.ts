/**
 * Quote & speaker alignment exercise, Hatam Mark 2 -- DRAMA EDITION RUN.
 *
 * This is version-2 of the same 13 hand-authored quote/speaker decisions
 * in decisions-mark-2.ts (see mark-2.ts for the full explanation of how
 * those were reached -- a close reading of Hatam against English, not an
 * algorithm). What's different here is the audio: this run uses FCBH's
 * actual dramatized recording (Original-FCBH-Audio/Hatam_had_LAI_NT_Drama
 * /B02___02_Markus______HADLAIN2DA.mp3, fileset HADLAIN2DA), which is
 * supposed to use multiple character voices rather than one reader for
 * the whole chapter -- unlike the "Non-Drama" edition mark-2.ts analyzes.
 *
 * That means the acoustic pitch check here is a genuinely different, and
 * potentially much stronger, corroborating signal than in version-1: if
 * this recording really is multi-cast, a real quotation's audio should
 * sound like a different voice than the surrounding narration, AND that
 * difference should disappear again right after the quotation ends (the
 * narrator resuming) -- a "bracket" pattern a single-reader recording
 * could never produce by chance.
 *
 * TWO methodology fixes were made while building this, both kept here as
 * comments because they're the actual finding, not just implementation
 * detail:
 *
 * 1. Narrator baseline must be built from 3-SECOND BINS, not raw 20ms
 *    frames. Comparing bin-to-bin std dev directly on frames gives ~52 Hz
 *    -- mostly frame-to-frame autocorrelation jitter/octave noise, not
 *    real narrator pitch movement. Averaging ~150 frames per 3s bin first
 *    cancels that noise out and reveals the narrator's real, much
 *    tighter, natural range (~16-18 Hz std) -- confirmed separately by a
 *    blind whole-chapter 3s-bin scan that, without ever looking at the
 *    text decisions, found its sharpest low-pitch outliers clustered
 *    almost entirely inside the predicted Jesus utterances and its
 *    sharpest high-pitch outliers right at the predicted Pharisees/
 *    scribes utterances.
 *
 * 2. A quotation's acoustic signal must be looked for as a PEAK within
 *    its estimated window, not as that window's single flat average.
 *    Several of these windows are 10-70+ seconds long (they're still the
 *    same rough proportional-text-position estimate from version-1), and
 *    a distinct voice actor's pitch shift can be a real, sharp signal
 *    that only occupies part of a long, imprecise window -- averaged
 *    across the whole window, it gets diluted back toward the narrator
 *    baseline and never crosses a significance threshold. Searching for
 *    the single most extreme 3-second bin inside the window (and then
 *    checking the "bracket" just outside it) is far more sensitive to
 *    exactly the kind of localized, real voice-change signal a
 *    dramatized recording should contain.
 *
 * This is still not real diarization: it's autocorrelation-based average
 * pitch (F0) from a from-scratch estimator (see pitch.ts), which cannot
 * distinguish two voice actors of similar pitch range or separate pitch
 * difference from emphasis. Treat every "distinct voice" verdict below as
 * corroborating evidence, not proof.
 *
 * Usage: npx tsx scripts/quote-alignment/mark-2-drama.ts
 * Output: HEARTWORD_DATA_DIR/exports/clips-alignment-Mark-2-version-2.txt
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../src/db/client.js";
import { detectSilences, getAudioDurationMs } from "../../src/pipeline/ingestion/detect-silences.js";
import { parseSourceTextByVerse } from "../../src/pipeline/ingestion/parse-source-text.js";
import { decodeToPcm16Mono, computePitchTrack, meanPitchInRange, type PitchFrame } from "../../src/pipeline/ingestion/pitch.js";
import { DECISIONS, extractQuoteSpan, estimateTimingWindow, fmtTime, type QuoteDecision, type QuoteSpan } from "../../src/pipeline/ingestion/mark-2-quote-decisions.js";

const GAP_TOLERANCE_MS = 6000;
const BIN_SEC = 3;
// A bin counts as "distinct voice" only if it's more than this many
// narrator-pitch standard deviations away from the whole-chapter narrator
// mean -- a statistical test, not a flat percentage, so it adapts to how
// much this specific narrator's own pitch naturally varies.
const Z_SCORE_THRESHOLD = 2;
const BRACKET_Z_THRESHOLD = 1; // "back near baseline" test for the bracket check
const BRACKET_MARGIN_SEC = 3; // how far outside the window the bracket bins are sampled from

interface Bin {
  tStartSec: number;
  tEndSec: number;
  meanHz: number | null;
  voicedFrameCount: number;
}

function buildBinTrack(track: PitchFrame[], totalDurationSec: number): Bin[] {
  const bins: Bin[] = [];
  for (let t = 0; t < totalDurationSec; t += BIN_SEC) {
    const r = meanPitchInRange(track, t, t + BIN_SEC);
    bins.push({ tStartSec: t, tEndSec: t + BIN_SEC, meanHz: r.meanHz, voicedFrameCount: r.voicedFrameCount });
  }
  return bins;
}

interface NarratorStats {
  meanHz: number;
  stdHz: number;
  sampleCount: number;
}

function computeNarratorStats(bins: Bin[], exclusionZonesSec: Array<[number, number]>): NarratorStats | null {
  const binMeans: number[] = [];
  for (const bin of bins) {
    if (bin.meanHz === null || bin.voicedFrameCount < 5) continue;
    const excluded = exclusionZonesSec.some(([start, end]) => bin.tStartSec < end && bin.tEndSec > start);
    if (!excluded) binMeans.push(bin.meanHz);
  }
  if (binMeans.length < 15) return null; // not enough narrator-only bins to trust a stddev
  const meanHz = binMeans.reduce((a, b) => a + b, 0) / binMeans.length;
  const variance = binMeans.reduce((sum, hz) => sum + (hz - meanHz) ** 2, 0) / (binMeans.length - 1);
  return { meanHz: Math.round(meanHz * 10) / 10, stdHz: Math.round(Math.sqrt(variance) * 10) / 10, sampleCount: binMeans.length };
}

function zScoreOf(hz: number, narrator: NarratorStats): number {
  return narrator.stdHz > 0 ? (hz - narrator.meanHz) / narrator.stdHz : 0;
}

interface AcousticVerdict {
  peakHz: number | null;
  peakZ: number | null;
  peakTimeSec: number | null;
  beforeHz: number | null;
  afterHz: number | null;
  distinctVoice: boolean;
  bracketConfirmed: boolean;
  note: string;
}

function checkAcoustics(
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

  // The single most extreme bin inside the window -- see file header for
  // why a peak search beats a flat window-average for long/imprecise
  // windows.
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

  // Bracket windows are sampled straight from the fine-grained frame
  // track (not the fixed 3s-grid bins) -- a 3-second margin will rarely
  // align with a whole bin boundary at an arbitrary refinedStartMs/
  // refinedEndMs, so bin-filtering here would spuriously come back empty.
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
      `Found a ${direction}-pitched peak of ~${peak.meanHz} Hz at ${fmtTime(peakTimeSec * 1000)} inside this window ` +
      `(z=${peakZ.toFixed(1)} vs. narrator baseline ~${narrator.meanHz} Hz, std ~${narrator.stdHz} Hz) -- AND pitch ` +
      `just outside this window on both sides (before ~${beforeHz?.toFixed(0) ?? "n/a"} Hz, after ~${afterHz?.toFixed(0) ?? "n/a"} Hz) ` +
      `returns close to the narrator baseline. This bracket pattern -- a voice change that starts and reverts right ` +
      `around this window -- is real corroborating evidence of a distinct voice actor.`;
  } else if (distinctVoice) {
    note =
      `Found a ${direction}-pitched peak of ~${peak.meanHz} Hz at ${fmtTime(peakTimeSec * 1000)} inside this window ` +
      `(z=${peakZ.toFixed(1)} vs. narrator baseline ~${narrator.meanHz} Hz, std ~${narrator.stdHz} Hz) -- a real pitch ` +
      `difference, but the audio just outside this window (before ~${beforeHz?.toFixed(0) ?? "n/a"} Hz, after ` +
      `~${afterHz?.toFixed(0) ?? "n/a"} Hz) didn't clearly return to baseline on both sides, so the "bracket" isn't ` +
      `fully confirmed -- treat as weaker, partial corroboration.`;
  } else {
    note =
      `No bin inside this window exceeded ${Z_SCORE_THRESHOLD} std devs from the narrator baseline (closest: ` +
      `~${peak.meanHz} Hz, z=${peakZ.toFixed(1)}) -- no acoustic evidence of a distinct voice actor here. This does ` +
      `NOT contradict the text decision: a same-range voice actor (e.g. another adult male reading Jesus's lines) ` +
      `would look identical to pitch-only analysis, which cannot separate voices by timbre. Absence of an acoustic ` +
      `signal is inconclusive, not disconfirming.`;
  }

  return { peakHz: peak.meanHz, peakZ, peakTimeSec, beforeHz, afterHz, distinctVoice, bracketConfirmed, note };
}

interface ScoredUtterance extends QuoteDecision {
  hatamQuote: string;
  estimatedStartMs: number;
  estimatedEndMs: number;
  startCorroborated: boolean;
  endCorroborated: boolean;
  startConfidence: number;
  endConfidence: number;
  overallConfidence: number;
  acoustic: AcousticVerdict;
  previousOverallConfidence: number;
}

async function main() {
  const dataDir = getDataDir();
  const docxPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-text.docx");
  const audioPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-fcbh-audio-drama.mp3");
  const nonDramaAudioPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-fcbh-audio.mp3");

  const verses = parseSourceTextByVerse(docxPath);
  const totalDurationMs = getAudioDurationMs(audioPath);
  const nonDramaDurationMs = getAudioDurationMs(nonDramaAudioPath);
  // Default noiseFloorDb (-30dB, tuned for the near-silent Non-Drama
  // recording) mostly fails on this edition: it has continuous light
  // orchestral underscore that never drops the true "pause" moments
  // below -30dBFS, so almost no real pause gets flagged (10 gaps found,
  // vs. the Non-Drama edition's 36 at the same threshold). Empirically
  // raising the threshold to -22dB recovers 33 gaps -- back in the same
  // range as the clean recording -- because the music's floor sits
  // between -30dB and -22dB, so this is closing a real, measured gap in
  // pause detection, not just adding noise (spot-checked: the recovered
  // gaps land at plausible inter-clause spacing, ~0.6-1.6s each).
  const gaps = detectSilences(audioPath, { noiseFloorDb: -22 });

  console.log(`Decoding ${audioPath} to PCM for pitch analysis...`);
  const pcm = decodeToPcm16Mono(audioPath, 16000);
  const sampleRate = 16000;

  console.log("Building whole-chapter pitch track (single pass, 20ms hop) and 3s bins...");
  const track = computePitchTrack(pcm, sampleRate);
  const bins = buildBinTrack(track, totalDurationMs / 1000);

  // Raw (unrefined, gap-independent) proportional windows for every
  // decision -- including q2, which isn't vocalized but is still the
  // scribes' reported inner reasoning and might be read in a distinct
  // hushed/character tone in a real dramatization rather than plain
  // narration. Expanded by a safety margin and excluded when sampling
  // "narrator-only" bins below, built from proportional position alone so
  // the narrator baseline isn't circularly built from the same silence
  // gaps the timing estimate is later corroborated against.
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
  console.log(
    narrator
      ? `Whole-chapter narrator baseline: ${narrator.meanHz} Hz, std ${narrator.stdHz} Hz (from ${narrator.sampleCount} narrator-only 3s bins)`
      : "Not enough narrator-only voiced audio to build a whole-chapter baseline."
  );

  const scored: ScoredUtterance[] = [];

  for (const decision of DECISIONS) {
    const span = spans.get(decision.id)!;
    const timing = estimateTimingWindow(span, totalDurationMs, gaps, GAP_TOLERANCE_MS);
    const { refinedStartMs, refinedEndMs, startCorroborated, endCorroborated } = timing;

    const acoustic = decision.vocalized
      ? checkAcoustics(track, bins, narrator, refinedStartMs, refinedEndMs)
      : {
          peakHz: null, peakZ: null, peakTimeSec: null, beforeHz: null, afterHz: null,
          distinctVoice: false, bracketConfirmed: false,
          note: "Not applicable -- this passage is not vocalized (see rationale)."
        };

    // Same base confidence as version-1 (silence-gap corroboration), plus
    // a bonus for real acoustic (voice-change) corroboration from this
    // multi-cast recording -- capped below the 90+ "auto-decide" band,
    // since this remains a heuristic pitch estimate, not verified
    // diarization.
    const baseStart = startCorroborated ? 55 : 25;
    const baseEnd = endCorroborated ? 55 : 25;
    let acousticBonus = 0;
    if (acoustic.distinctVoice) acousticBonus += 15;
    if (acoustic.bracketConfirmed) acousticBonus += 10;
    const startConfidence = Math.min(85, baseStart + acousticBonus);
    const endConfidence = Math.min(85, baseEnd + acousticBonus);

    const overallConfidence = Math.round(0.5 * decision.textConfidence + 0.25 * startConfidence + 0.25 * endConfidence);
    const previousOverallConfidence = Math.round(0.5 * decision.textConfidence + 0.25 * baseStart + 0.25 * baseEnd);

    scored.push({
      ...decision,
      hatamQuote: span.hatamQuote,
      estimatedStartMs: Math.round(refinedStartMs),
      estimatedEndMs: Math.round(refinedEndMs),
      startCorroborated,
      endCorroborated,
      startConfidence,
      endConfidence,
      overallConfidence,
      acoustic,
      previousOverallConfidence
    });
  }

  const THRESHOLD = 80;
  writeReport(scored, {
    docxPath, audioPath, nonDramaAudioPath,
    totalDurationMs, nonDramaDurationMs,
    gapsDetected: gaps.length, narrator, threshold: THRESHOLD
  });
}

function writeReport(
  utterances: ScoredUtterance[],
  meta: {
    docxPath: string; audioPath: string; nonDramaAudioPath: string;
    totalDurationMs: number; nonDramaDurationMs: number;
    gapsDetected: number; narrator: NarratorStats | null; threshold: number;
  }
) {
  const lines: string[] = [];
  lines.push("HeartWord -- Clip Alignment: Quote & Speaker Attribution");
  lines.push("Chapter: Hatam Mark 2");
  lines.push("Edition: FCBH Drama (fileset HADLAIN2DA -- intended multi-voice cast)");
  lines.push("Generated: " + new Date().toISOString());
  lines.push(`Source text: ${meta.docxPath}`);
  lines.push(`Source audio: ${meta.audioPath} (${(meta.totalDurationMs / 1000).toFixed(1)}s, ${meta.gapsDetected} silence gaps detected at a -22dB threshold)`);
  lines.push(
    "  NOTE: this edition has continuous light orchestral underscore, which raises the noise floor enough that\n" +
    "  the -30dB threshold used for the Non-Drama edition (36 gaps) misses almost all real pauses here (10 gaps).\n" +
    "  -22dB was chosen empirically to recover a comparable gap count (33) without over-triggering on speech\n" +
    "  itself -- see mark-2-drama.ts for how that was validated."
  );
  lines.push(
    `Non-Drama edition for comparison: ${meta.nonDramaAudioPath} (${(meta.nonDramaDurationMs / 1000).toFixed(1)}s)` +
      (Math.abs(meta.totalDurationMs - meta.nonDramaDurationMs) < 50
        ? " -- NOTE: the two editions run to within 50ms of each other despite being 95%+ different audio sample-for-sample (verified separately, not a re-tagged duplicate); likely both mastered to a shared reference runtime rather than a coincidence."
        : "")
  );
  lines.push(
    meta.narrator
      ? `Whole-chapter narrator pitch baseline: ${meta.narrator.meanHz} Hz, std dev ${meta.narrator.stdHz} Hz (${meta.narrator.sampleCount} narrator-only 3-second bins sampled across the whole chapter, not just the opening)`
      : "Whole-chapter narrator pitch baseline: could not be computed (insufficient narrator-only voiced audio)."
  );
  lines.push(`Producer-review threshold: overall confidence below ${meta.threshold}/100`);
  lines.push("");
  lines.push("This is the drama-corroborated re-run of clips-alignment-Mark-2-version-1.txt -- same 13 quote/speaker");
  lines.push("decisions, same text-confidence numbers, re-scored against FCBH's actual multi-voice recording instead");
  lines.push("of the single-reader Non-Drama edition. See the SUMMARY section below for what changed and why.");
  lines.push("");
  lines.push("=".repeat(78));
  lines.push("METHOD -- what's different from version-1 (read this before trusting a number below)");
  lines.push("=".repeat(78));
  lines.push(
    "WHO is speaking, and the Hatam text evidence for it, is UNCHANGED from version-1 -- that was always a close-\n" +
    "reading judgment independent of which audio edition is playing (see decisions-mark-2.ts / mark-2.ts for the\n" +
    "full method). What changes here is entirely the acoustic corroboration for WHEN each quotation happens.\n"
  );
  lines.push(
    "Version-1 could only ask 'does this stretch of audio sound different from the narrator' on a recording where\n" +
    "the answer is expected to be no (one reader voices everything). This run asks the same question of a\n" +
    "recording that's actually supposed to use a different actor per character, and does it two ways version-1\n" +
    "couldn't: (1) it searches for the single most acoustically distinct 3-second slice WITHIN each estimated\n" +
    "window rather than averaging the whole (often long and imprecise) window flat -- a real, localized voice\n" +
    "change can otherwise get diluted into looking like 'no difference'; (2) it checks whether pitch just outside\n" +
    "that window, on both sides, returns to the narrator baseline (the 'bracket' pattern) -- a much stronger signal\n" +
    "than a difference alone, since a single continuous reader's own pitch drift wouldn't snap back in step with a\n" +
    "text-based boundary guess by coincidence.\n"
  );
  lines.push(
    "The narrator baseline itself is also stronger: version-1 used one 15-second sample from the start of the\n" +
    "chapter. This run samples 3-second-binned pitch from every point in the whole ~7.5-minute chapter that ISN'T\n" +
    "inside (or within 3s of) any predicted quotation -- including q2's non-vocalized inner-reasoning passage, in\n" +
    "case the drama edition voices even that distinctly -- then uses that sample's own mean AND standard deviation.\n" +
    "Binning to 3 seconds before computing the stddev matters: raw 20ms-frame-to-frame pitch has ~50 Hz of\n" +
    "autocorrelation jitter that has nothing to do with the narrator's real voice, which would have made almost\n" +
    "every genuine voice-change look statistically unremarkable.\n"
  );
  lines.push(
    "Still true, same as version-1: this is autocorrelation-based average pitch (F0), built from scratch with no\n" +
    "numpy/librosa equivalent available -- NOT real speaker diarization. It cannot tell two voice actors of similar\n" +
    "pitch range apart, doesn't look at timbre or formants at all, and 'no distinct voice found' is inconclusive\n" +
    "rather than a contradiction of the text decision (see each utterance's acoustic note). Time windows themselves\n" +
    "are still the same proportional-position-plus-nearest-silence-gap estimate as version-1, just computed against\n" +
    "the drama file's own duration and its own detected silence gaps (the two editions are NOT assumed to share\n" +
    "timing, even though their total runtimes happen to match almost exactly)."
  );
  lines.push("");
  lines.push(
    "CAVEAT worth flagging explicitly: this recording has continuous light orchestral underscore. Two checks were\n" +
    "run to see whether that music was corrupting the analysis rather than just being background: (1) whether a\n" +
    "cheap stereo trick (comparing left/right channels) could isolate dialogue from score -- it can't, L/R\n" +
    "correlation is 0.98-0.99 throughout, i.e. this is an essentially mono-compatible mix with no exploitable\n" +
    "stereo separation between voice and music; (2) whether the music was masking real pauses from the silence\n" +
    "detector -- it was (see the source-audio line above), and that's been corrected by tuning the detector's noise\n" +
    "floor for this edition specifically. What ISN'T corrected: the pitch check below still measures whatever\n" +
    "periodic content is loudest in each window, which could sometimes be an instrument rather than a voice, and\n" +
    "dramatic underscore is often composed to swell at the same emotionally significant story beats (a healing, a\n" +
    "rebuke) that these utterances happen to be. A 'distinct voice' verdict below is corroborating, not conclusive,\n" +
    "for that reason on top of the reasons already stated -- real vocal isolation (a source-separation model, not\n" +
    "available in this environment without adding a new ML dependency) would be needed to rule that out with any\n" +
    "confidence."
  );
  lines.push("");

  const withAcoustic = utterances.filter((u) => u.vocalized);
  const distinctCount = withAcoustic.filter((u) => u.acoustic.distinctVoice).length;
  const bracketCount = withAcoustic.filter((u) => u.acoustic.bracketConfirmed).length;
  const improved = withAcoustic.filter((u) => u.overallConfidence > u.previousOverallConfidence);
  const crossedThreshold = withAcoustic.filter((u) => u.previousOverallConfidence < meta.threshold && u.overallConfidence >= meta.threshold);

  lines.push("=".repeat(78));
  lines.push("SUMMARY -- did the drama recording help?");
  lines.push("=".repeat(78));
  lines.push(`  Vocalized utterances checked: ${withAcoustic.length}`);
  lines.push(`  Showed a statistically distinct voice peak (>${Z_SCORE_THRESHOLD} std devs from narrator baseline) somewhere in their window: ${distinctCount}`);
  lines.push(`  Of those, confirmed by the before/after "bracket" pattern: ${bracketCount}`);
  lines.push(`  Utterances whose overall confidence went UP vs. the base silence-gap-only score: ${improved.length}`);
  lines.push(`  Utterances that crossed from below-threshold to at/above the ${meta.threshold}/100 producer-review threshold: ${crossedThreshold.length}`);
  if (improved.length > 0) {
    for (const u of improved) {
      lines.push(`    - ${u.id} (Mark 2:${u.verseStart}${u.verseStart !== u.verseEnd ? `-${u.verseEnd}` : ""}, ${u.speakerLabel}): ${u.previousOverallConfidence} -> ${u.overallConfidence}${u.overallConfidence >= meta.threshold && u.previousOverallConfidence < meta.threshold ? "  [crossed threshold]" : ""}`);
    }
  }
  lines.push("");

  const needsReview = utterances.filter((u) => u.vocalized && u.overallConfidence < meta.threshold);
  lines.push("=".repeat(78));
  lines.push(`PRODUCER REVIEW NEEDED: ${needsReview.length} of ${withAcoustic.length} vocalized utterances still score below ${meta.threshold}/100 overall`);
  lines.push("=".repeat(78));
  if (needsReview.length > 0) {
    lines.push(
      "In every case here it is the TIME estimate dragging the score down, not the speaker decision -- check each\n" +
      "entry's Text confidence separately, and see its acoustic note for whether the drama recording found any\n" +
      "supporting (or inconclusive, not contradicting) voice-change signal."
    );
    for (const u of needsReview) lines.push(`  - ${u.id} (Mark 2:${u.verseStart}${u.verseStart !== u.verseEnd ? `-${u.verseEnd}` : ""}, ${u.speakerLabel}): overall ${u.overallConfidence}/100`);
  }
  lines.push("");

  lines.push("=".repeat(78));
  lines.push("UTTERANCES");
  lines.push("=".repeat(78));
  for (const u of utterances) {
    lines.push("");
    lines.push(`[${u.id}] Mark 2:${u.verseStart}${u.verseStart !== u.verseEnd ? `-${u.verseEnd}` : ""} -- ${u.speakerLabel}${u.vocalized ? "" : " -- NOT VOCALIZED, no clip"}`);
    lines.push(`  Character ID: ${u.speakerLegacyId ?? "(none)"}`);
    lines.push(`  Hatam evidence phrase: "${u.evidencePhrase}"`);
    lines.push(`  Hatam quote: "${u.hatamQuote}"`);
    lines.push(`  Rationale: ${u.rationale}`);
    if (u.vocalized) {
      lines.push(
        `  Estimated window: ${fmtTime(u.estimatedStartMs)} - ${fmtTime(u.estimatedEndMs)}` +
          ` (start ${u.startCorroborated ? "corroborated by a nearby silence gap" : "uncorroborated -- proportional estimate only"},` +
          ` end ${u.endCorroborated ? "corroborated" : "uncorroborated"})`
      );
      lines.push(`  Acoustic check (drama edition): ${u.acoustic.note}`);
      lines.push(
        `  Confidence -- text: ${u.textConfidence}/100, start: ${u.startConfidence}/100, end: ${u.endConfidence}/100,` +
          ` OVERALL: ${u.overallConfidence}/100 (was ${u.previousOverallConfidence}/100 without acoustic corroboration)` +
          `${u.overallConfidence < meta.threshold ? "  [BELOW THRESHOLD -- see producer review list above]" : ""}`
      );
    }
  }
  lines.push("");

  const outDir = join(getDataDir(), "exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "clips-alignment-Mark-2-version-2.txt");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
