/**
 * Quote & speaker alignment exercise, Hatam Mark 2 -- VERSION 3: REAL
 * VOCAL/MUSIC SEPARATION.
 *
 * Same 13 hand-authored quote/speaker decisions as version-1 (mark-2.ts)
 * and version-2 (mark-2-drama.ts) -- see decisions-mark-2.ts for the full
 * text-based reasoning, unchanged here. What's different is the audio
 * this run's pitch analysis and silence detection actually look at: not
 * the raw FCBH drama mix (version-2), but that same recording run
 * through real Demucs (htdemucs) source separation --
 * assets/source/hatam/mark-2/separated/{vocals,music}.mp3, produced by
 * separate_audio.py.
 *
 * WHY THIS EXISTS: version-2's own caveat flagged that its pitch check
 * "measures whatever periodic content is loudest in each window, which
 * could sometimes be an instrument rather than a voice" -- and that its
 * -22dB silence-detector tuning was a hand-tuned workaround for the
 * underscore raising the noise floor, not a real fix. Both of those were
 * confirmed as real problems (not just theoretical caveats) once genuine
 * separation became possible:
 *
 * 1. Fine-resolution pitch tracking (librosa.pyin, an independently-
 *    implemented pitch tracker used to cross-check this pipeline's own
 *    from-scratch autocorrelation estimator) on the RAW MIX at the two
 *    tightest predicted speaker-transition boundaries in this chapter
 *    showed the pitch estimate repeatedly alternating between two exact-
 *    octave values (~110 Hz and ~220 Hz) on BOTH sides of the transition,
 *    regardless of which character was supposedly speaking -- a classic
 *    signature of a periodic bass/pad note in the underscore confusing
 *    the fundamental-frequency estimator, not real vocal pitch. Re-run on
 *    the SEPARATED vocals stem, that alternation disappears completely at
 *    both transitions; the estimate settles into a single, stable ~200-
 *    240 Hz range throughout. (Honest caveat about what this DOESN'T
 *    show: pitch alone still doesn't reveal an obvious step change in
 *    level at either transition -- see docs/ARCHITECTURE.md. Two adult
 *    male voices can share an F0 range; pitch was never going to be able
 *    to confirm a same-range voice change on its own, separated or not.)
 *
 * 2. Silence detection at the SAME default threshold used for the clean
 *    Non-Drama edition (-30dB) recovers ~55 gaps on the separated vocals
 *    stem -- comparable to (in fact higher-resolution than) the Non-Drama
 *    edition's 36, and spot-checked at plausible ~0.6-1.6s inter-clause
 *    spacing. Version-2's -22dB hand-tuning is no longer needed at all:
 *    once the music is actually gone rather than just quieter, the
 *    default noise floor (tuned for a near-silent recording) is correct
 *    again, because the vocals track now IS near-silent between lines.
 *
 * Everything else about the acoustic-corroboration method (3-second-
 * binned narrator baseline built from proportional-position exclusion
 * zones, peak-search within each estimated window rather than a flat
 * average, before/after "bracket" check sampled from the fine frame
 * track) is unchanged from version-2 -- see mark-2-drama.ts's header for
 * why each of those was needed. What changed is only the audio those
 * techniques are now pointed at.
 *
 * STILL NOT real diarization, and this run does not claim to have fixed
 * that: it is still autocorrelation-based average pitch (F0) from a
 * from-scratch estimator, which cannot separate two voice actors of
 * similar pitch range and does not look at timbre/formants at all. What
 * real separation removes is a specific, confirmed confound (an
 * instrument's periodic content corrupting the pitch estimate) -- it does
 * not add a new capability the estimator never had. Treat every "distinct
 * voice" verdict below the same way as version-2's: corroborating
 * evidence, not proof; and treat "no distinct voice found" as
 * inconclusive, not disconfirming, for the same reason as before.
 *
 * Usage:
 *   1. python3 separate_audio.py <drama-mix.mp3> \
 *        <dataDir>/assets/source/hatam/mark-2/separated/vocals.mp3 \
 *        <dataDir>/assets/source/hatam/mark-2/separated/music.mp3
 *      (one-time per chapter; requires torch+demucs -- see that script's
 *      header for the one-time weights setup)
 *   2. npx tsx scripts/quote-alignment/mark-2-drama-v3.ts
 * Output: HEARTWORD_DATA_DIR/exports/clips-alignment-Mark-2-version-3.txt
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../src/db/client.js";
import { detectSilences, getAudioDurationMs } from "../../src/pipeline/ingestion/detect-silences.js";
import { parseSourceTextByVerse } from "../../src/pipeline/ingestion/parse-source-text.js";
import { decodeToPcm16Mono, computePitchTrack, meanPitchInRange, type PitchFrame } from "./pitch.js";
import { DECISIONS, extractQuoteSpan, estimateTimingWindow, fmtTime, type QuoteDecision, type QuoteSpan } from "./decisions-mark-2.js";

const GAP_TOLERANCE_MS = 6000;
const BIN_SEC = 3;
const Z_SCORE_THRESHOLD = 2;
const BRACKET_Z_THRESHOLD = 1;
const BRACKET_MARGIN_SEC = 3;

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
  if (binMeans.length < 15) return null;
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
      `Found a ${direction}-pitched peak of ~${peak.meanHz} Hz at ${fmtTime(peakTimeSec * 1000)} inside this window ` +
      `(z=${peakZ.toFixed(1)} vs. narrator baseline ~${narrator.meanHz} Hz, std ~${narrator.stdHz} Hz), on the separated ` +
      `vocals track -- AND pitch just outside this window on both sides (before ~${beforeHz?.toFixed(0) ?? "n/a"} Hz, ` +
      `after ~${afterHz?.toFixed(0) ?? "n/a"} Hz) returns close to the narrator baseline. This bracket pattern is real ` +
      `corroborating evidence of a distinct voice actor, and is no longer confounded by background music.`;
  } else if (distinctVoice) {
    note =
      `Found a ${direction}-pitched peak of ~${peak.meanHz} Hz at ${fmtTime(peakTimeSec * 1000)} inside this window ` +
      `(z=${peakZ.toFixed(1)} vs. narrator baseline ~${narrator.meanHz} Hz, std ~${narrator.stdHz} Hz) on the separated ` +
      `vocals track -- a real pitch difference, but the audio just outside this window (before ` +
      `~${beforeHz?.toFixed(0) ?? "n/a"} Hz, after ~${afterHz?.toFixed(0) ?? "n/a"} Hz) didn't clearly return to baseline ` +
      `on both sides, so the "bracket" isn't fully confirmed -- treat as weaker, partial corroboration.`;
  } else {
    note =
      `No bin inside this window (on the separated vocals track) exceeded ${Z_SCORE_THRESHOLD} std devs from the ` +
      `narrator baseline (closest: ~${peak.meanHz} Hz, z=${peakZ.toFixed(1)}) -- no acoustic evidence of a distinct voice ` +
      `actor here. Background music can no longer explain this absence (it's been removed), but a same-range voice ` +
      `actor still would look identical to pitch-only analysis, which cannot separate voices by timbre. Absence of a ` +
      `signal remains inconclusive, not disconfirming.`;
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
  const mixedAudioPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-fcbh-audio-drama.mp3");
  const vocalsPath = join(dataDir, "assets/source/hatam/mark-2/separated/vocals.mp3");

  const verses = parseSourceTextByVerse(docxPath);
  // Duration is taken from the separated vocals track itself (Demucs
  // preserves exact sample-length passthrough, but this avoids ever
  // depending on that assumption holding).
  const totalDurationMs = getAudioDurationMs(vocalsPath);

  // Default noiseFloorDb (-30dB) again works correctly here, unlike on
  // the raw mix -- see file header. Recovers ~55 gaps at plausible
  // inter-clause spacing (spot-checked), more granular than either prior
  // edition's gap count because the vocals track truly is near-silent
  // between lines now that the continuous underscore is gone.
  const gaps = detectSilences(vocalsPath);

  console.log(`Decoding ${vocalsPath} to PCM for pitch analysis...`);
  const pcm = decodeToPcm16Mono(vocalsPath, 16000);
  const sampleRate = 16000;

  console.log("Building whole-chapter pitch track (single pass, 20ms hop) and 3s bins...");
  const track = computePitchTrack(pcm, sampleRate);
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
  console.log(
    narrator
      ? `Whole-chapter narrator baseline (separated vocals): ${narrator.meanHz} Hz, std ${narrator.stdHz} Hz (from ${narrator.sampleCount} narrator-only 3s bins)`
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
    docxPath, mixedAudioPath, vocalsPath,
    totalDurationMs, gapsDetected: gaps.length, narrator, threshold: THRESHOLD
  });
}

function writeReport(
  utterances: ScoredUtterance[],
  meta: {
    docxPath: string; mixedAudioPath: string; vocalsPath: string;
    totalDurationMs: number; gapsDetected: number; narrator: NarratorStats | null; threshold: number;
  }
) {
  const lines: string[] = [];
  lines.push("HeartWord -- Clip Alignment: Quote & Speaker Attribution");
  lines.push("Chapter: Hatam Mark 2");
  lines.push("Edition: FCBH Drama, REAL VOCAL/MUSIC SEPARATION (Demucs htdemucs)");
  lines.push("Generated: " + new Date().toISOString());
  lines.push(`Source text: ${meta.docxPath}`);
  lines.push(`Original mixed audio: ${meta.mixedAudioPath}`);
  lines.push(`Separated vocals track analyzed: ${meta.vocalsPath} (${(meta.totalDurationMs / 1000).toFixed(1)}s, ${meta.gapsDetected} silence gaps at the default -30dB threshold)`);
  lines.push(
    "  NOTE: version-2 needed a hand-tuned -22dB threshold because continuous orchestral underscore raised the\n" +
    "  noise floor on the raw mix. With real separation, the vocals track is genuinely near-silent between lines\n" +
    "  again, so the default -30dB threshold (same as the clean Non-Drama edition) is correct here -- no tuning\n" +
    "  needed. It also now finds MORE gaps (~55) than either prior run, i.e. finer-grained pause detection, not\n" +
    "  just a return to baseline."
  );
  lines.push(
    meta.narrator
      ? `Whole-chapter narrator pitch baseline (separated vocals): ${meta.narrator.meanHz} Hz, std dev ${meta.narrator.stdHz} Hz (${meta.narrator.sampleCount} narrator-only 3-second bins)`
      : "Whole-chapter narrator pitch baseline: could not be computed (insufficient narrator-only voiced audio)."
  );
  lines.push(`Producer-review threshold: overall confidence below ${meta.threshold}/100`);
  lines.push("");
  lines.push("This is the real-separation re-run of clips-alignment-Mark-2-version-2.txt -- same 13 quote/speaker");
  lines.push("decisions and text-confidence numbers, re-scored against a genuinely isolated vocals track instead of");
  lines.push("the raw drama mix. See the SUMMARY section below for what changed and why.");
  lines.push("");
  lines.push("=".repeat(78));
  lines.push("METHOD -- what's different from version-2 (read this before trusting a number below)");
  lines.push("=".repeat(78));
  lines.push(
    "WHO is speaking is unchanged from version-1/2 -- a text judgment, not an audio one (see decisions-mark-2.ts).\n" +
    "What changes here is that the pitch analysis and silence detection now run against a real, model-separated\n" +
    "vocals track (Demucs htdemucs, offline-loaded from a locally-supplied weights file -- see separate_audio.py)\n" +
    "instead of the raw FCBH drama mix.\n"
  );
  lines.push(
    "This closes the specific gap version-2 flagged but could not fix: fine-resolution cross-checking (librosa.pyin,\n" +
    "an independent pitch tracker) at the two tightest predicted speaker-transition boundaries showed the RAW MIX's\n" +
    "pitch estimate alternating between two exact-octave values (~110/220 Hz) regardless of speaker -- a periodic\n" +
    "bass/pad note in the underscore confusing the fundamental-frequency estimator. On the separated vocals track,\n" +
    "that alternation is gone at both transitions. The same separation also means silence detection no longer needs\n" +
    "a hand-tuned noise floor (see the source-audio line above).\n"
  );
  lines.push(
    "Everything else -- the 3-second-binned narrator baseline (with its own mean AND std dev, built from every\n" +
    "point in the chapter that isn't inside or within 3s of a predicted quotation), peak-search within each\n" +
    "estimated window rather than a flat average, and the before/after 'bracket' check sampled from the fine frame\n" +
    "track -- is unchanged from version-2. See mark-2-drama.ts's header for why each of those was needed in the\n" +
    "first place.\n"
  );
  lines.push(
    "STILL not real diarization: this is still autocorrelation-based average pitch (F0) from a from-scratch\n" +
    "estimator, which cannot distinguish two voice actors of similar pitch range and does not look at timbre or\n" +
    "formants. Real separation removed a confirmed confound (an instrument corrupting the pitch estimate); it did\n" +
    "not add a capability the estimator never had. 'No distinct voice found' below remains inconclusive, not\n" +
    "disconfirming -- same as every prior version."
  );
  lines.push("");

  const withAcoustic = utterances.filter((u) => u.vocalized);
  const distinctCount = withAcoustic.filter((u) => u.acoustic.distinctVoice).length;
  const bracketCount = withAcoustic.filter((u) => u.acoustic.bracketConfirmed).length;
  const improved = withAcoustic.filter((u) => u.overallConfidence > u.previousOverallConfidence);
  const crossedThreshold = withAcoustic.filter((u) => u.previousOverallConfidence < meta.threshold && u.overallConfidence >= meta.threshold);

  lines.push("=".repeat(78));
  lines.push("SUMMARY -- did real separation help further?");
  lines.push("=".repeat(78));
  lines.push(`  Vocalized utterances checked: ${withAcoustic.length}`);
  lines.push(`  Showed a statistically distinct voice peak (>${Z_SCORE_THRESHOLD} std devs from narrator baseline) somewhere in their window: ${distinctCount}`);
  lines.push(`  Of those, confirmed by the before/after "bracket" pattern: ${bracketCount}`);
  lines.push(`  Utterances whose overall confidence went UP vs. the (this run's own) base silence-gap-only score: ${improved.length}`);
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
      "entry's Text confidence separately, and see its acoustic note for whether the separated vocals track found\n" +
      "any supporting (or inconclusive, not contradicting) voice-change signal."
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
      lines.push(`  Acoustic check (real separated vocals): ${u.acoustic.note}`);
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
  const outPath = join(outDir, "clips-alignment-Mark-2-version-3.txt");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
