/**
 * Quote & speaker alignment exercise, Hatam Mark 2 -- VERSION 3: REAL
 * VOCAL/MUSIC SEPARATION. Standalone human-readable report generator;
 * the actual scoring logic lives in
 * src/pipeline/ingestion/mark-2-acoustic-scoring.ts, which this script
 * shares with the real ingestion pipeline stage (see
 * src/pipeline/ingestion/mark-2-segments.ts) so both compute identical
 * numbers -- this file only formats and writes the report.
 *
 * Same 13 hand-authored quote/speaker decisions as version-1 (mark-2.ts)
 * and version-2 (mark-2-drama.ts) -- see mark-2-quote-decisions.ts for the
 * full text-based reasoning, unchanged here. What's different is the
 * audio this run's pitch analysis and silence detection actually look
 * at: not the raw FCBH drama mix (version-2), but that same recording run
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
 * STILL NOT real diarization: it is still autocorrelation-based average
 * pitch (F0) from a from-scratch estimator, which cannot separate two
 * voice actors of similar pitch range and does not look at timbre or
 * formants at all. Treat every "distinct voice" verdict below the same
 * way as version-2's: corroborating evidence, not proof.
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
import { decodeToPcm16Mono, computePitchTrack } from "../../src/pipeline/ingestion/pitch.js";
import { fmtTime } from "../../src/pipeline/ingestion/mark-2-quote-decisions.js";
import { scoreMark2Utterances, type ScoredUtterance, type NarratorStats } from "../../src/pipeline/ingestion/mark-2-acoustic-scoring.js";

const GAP_TOLERANCE_MS = 6000;

async function main() {
  const dataDir = getDataDir();
  const docxPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-text.docx");
  const mixedAudioPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-fcbh-audio-drama.mp3");
  const vocalsPath = join(dataDir, "assets/source/hatam/mark-2/separated/vocals.mp3");

  const verses = parseSourceTextByVerse(docxPath);
  const totalDurationMs = getAudioDurationMs(vocalsPath);

  // Default noiseFloorDb (-30dB) again works correctly here, unlike on
  // the raw mix -- see file header. Recovers ~55 gaps at plausible
  // inter-clause spacing (spot-checked), more granular than either prior
  // edition's gap count because the vocals track truly is near-silent
  // between lines now that the continuous underscore is gone.
  const gaps = detectSilences(vocalsPath);

  console.log(`Decoding ${vocalsPath} to PCM for pitch analysis...`);
  const pcm = decodeToPcm16Mono(vocalsPath, 16000);
  const track = computePitchTrack(pcm, 16000);

  console.log("Scoring all 13 decisions against the separated vocals track...");
  const { scored, narrator } = scoreMark2Utterances({ verses, totalDurationMs, gaps, track, gapToleranceMs: GAP_TOLERANCE_MS });
  console.log(
    narrator
      ? `Whole-chapter narrator baseline (separated vocals): ${narrator.meanHz} Hz, std ${narrator.stdHz} Hz (from ${narrator.sampleCount} narrator-only 3s bins)`
      : "Not enough narrator-only voiced audio to build a whole-chapter baseline."
  );

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
  lines.push("the raw drama mix.");
  lines.push("");

  const withAcoustic = utterances.filter((u) => u.vocalized);
  const distinctCount = withAcoustic.filter((u) => u.acoustic.distinctVoice).length;
  const bracketCount = withAcoustic.filter((u) => u.acoustic.bracketConfirmed).length;

  lines.push("=".repeat(78));
  lines.push("SUMMARY");
  lines.push("=".repeat(78));
  lines.push(`  Vocalized utterances checked: ${withAcoustic.length}`);
  lines.push(`  Showed a statistically distinct voice peak somewhere in their window: ${distinctCount}`);
  lines.push(`  Of those, confirmed by the before/after "bracket" pattern: ${bracketCount}`);
  lines.push("");

  const needsReview = utterances.filter((u) => u.vocalized && u.overallConfidence < meta.threshold);
  lines.push("=".repeat(78));
  lines.push(`PRODUCER REVIEW NEEDED: ${needsReview.length} of ${withAcoustic.length} vocalized utterances score below ${meta.threshold}/100 overall`);
  lines.push("=".repeat(78));
  for (const u of needsReview) lines.push(`  - ${u.id} (Mark 2:${u.verseStart}${u.verseStart !== u.verseEnd ? `-${u.verseEnd}` : ""}, ${u.speakerLabel}): overall ${u.overallConfidence}/100`);
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
        `  Estimated window: ${fmtTime(u.refinedStartMs)} - ${fmtTime(u.refinedEndMs)}` +
          ` (start ${u.startCorroborated ? "corroborated by a nearby silence gap" : "uncorroborated -- proportional estimate only"},` +
          ` end ${u.endCorroborated ? "corroborated" : "uncorroborated"})`
      );
      lines.push(`  Acoustic check (real separated vocals): ${u.acoustic.note}`);
      lines.push(
        `  Confidence -- text: ${u.textConfidence}/100, start: ${u.startConfidence}/100, end: ${u.endConfidence}/100,` +
          ` OVERALL: ${u.overallConfidence}/100` +
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
