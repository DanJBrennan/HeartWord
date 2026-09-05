/**
 * Quote & speaker alignment exercise, Hatam Mark 2 -- see the "Ingestion &
 * alignment (v1)" section of docs/ARCHITECTURE.md for how this relates to
 * (and currently stands apart from) the wired pipeline's ingestion stage.
 *
 * What this does, in Dan's own terms: finds every direct quotation in the
 * Hatam text, decides who's speaking it by reading the Hatam text itself
 * (not just the English reference) for explicit quotative-introduction
 * phrases ("Yesus buhup" = "Jesus answered", "X hig Y" = "X said to Y",
 * etc.), cross-checks that against the English reference and the Griffiths
 * dictionary where a word is unfamiliar, watches for quotes that don't
 * respect verse boundaries, and estimates a confidence-scored audio time
 * window for each one. Every quote decision (WHO said WHAT) -- shared with
 * mark-2-drama.ts in decisions-mark-2.ts -- was reached by actually
 * reading all 28 verses side by side in Hatam and English; there's no
 * dictionary-driven or ASR-driven algorithm that does this step. The exact
 * quote TEXT and its offsets, though, are pulled mechanically from the
 * real parsed source text (see extractQuoteSpan) rather than retyped by
 * hand, so they can't drift from the source.
 *
 * This is the "Non-Drama" edition run (a single reader voices the whole
 * chapter, so the acoustic pitch check here is expected to find no real
 * speaker change -- see mark-2-drama.ts for the version-2 run against
 * FCBH's actual multi-voice dramatized recording).
 *
 * Usage: npx tsx scripts/quote-alignment/mark-2.ts
 * Output: HEARTWORD_DATA_DIR/exports/clips-alignment-Mark-2-version-1.txt
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../src/db/client.js";
import { detectSilences, getAudioDurationMs } from "../../src/pipeline/ingestion/detect-silences.js";
import { parseSourceTextByVerse } from "../../src/pipeline/ingestion/parse-source-text.js";
import { decodeToPcm16Mono, estimateMeanPitchHz } from "./pitch.js";
import { DECISIONS, extractQuoteSpan, estimateTimingWindow, fmtTime, type QuoteDecision } from "./decisions-mark-2.js";


interface ScoredUtterance extends QuoteDecision {
  hatamQuote: string;
  estimatedStartMs: number;
  estimatedEndMs: number;
  startCorroborated: boolean;
  endCorroborated: boolean;
  startConfidence: number;
  endConfidence: number;
  overallConfidence: number;
  acousticNote: string;
}

async function main() {
  const dataDir = getDataDir();
  const docxPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-text.docx");
  const audioPath = join(dataDir, "assets/source/hatam/mark-2/mark-2-fcbh-audio.mp3");

  const verses = parseSourceTextByVerse(docxPath);
  const totalDurationMs = getAudioDurationMs(audioPath);
  const gaps = detectSilences(audioPath);

  // Time-estimation tolerance: how far a proportional text-position
  // estimate may be from a real detected silence gap before we treat that
  // gap as corroborating it. Wide on purpose -- ingestion's own paragraph-
  // level timing (docs/ARCHITECTURE.md) already showed this recording's
  // pauses don't line up tightly with a constant-speech-rate assumption,
  // so a tight tolerance would just manufacture false corroboration.
  const GAP_TOLERANCE_MS = 6000;

  console.log(`Decoding ${audioPath} to PCM for pitch analysis...`);
  const pcm = decodeToPcm16Mono(audioPath, 16000);
  const sampleRate = 16000;

  // Narrator baseline: verses 1-4 are pure narration with no quoted
  // speech anywhere in this chapter (see DECISIONS -- the first quote is
  // q1 in verse 5), so the audio before it is a clean, unambiguous
  // narrator-only sample.
  const baselineEndMs = Math.min(totalDurationMs, 15000);
  const baseline = estimateMeanPitchHz(pcm, sampleRate, 0, baselineEndMs / 1000);
  console.log(`Narrator baseline pitch (0-${(baselineEndMs / 1000).toFixed(1)}s): ${baseline.meanHz ?? "n/a"} Hz (${baseline.voicedFrameCount}/${baseline.totalFrameCount} voiced frames)`);

  const scored: ScoredUtterance[] = [];

  for (const decision of DECISIONS) {
    const span = extractQuoteSpan(verses, decision);
    const timing = estimateTimingWindow(span, totalDurationMs, gaps, GAP_TOLERANCE_MS);
    const { refinedStartMs, refinedEndMs, startCorroborated, endCorroborated, collapsedWindowNote } = timing;

    // Time confidence is deliberately low even when corroborated: a
    // nearby silence gap is consistent with a boundary there, not proof
    // of one -- see "Known limitations" in docs/ARCHITECTURE.md's
    // ingestion section for the same caveat on the wired stage.
    const startConfidence = startCorroborated ? 55 : 25;
    const endConfidence = endCorroborated ? 55 : 25;

    let acousticNote = "Not enough voiced audio in this window to estimate pitch.";
    if (decision.vocalized && baseline.meanHz !== null) {
      const utterance = estimateMeanPitchHz(pcm, sampleRate, refinedStartMs / 1000, refinedEndMs / 1000);
      if (utterance.meanHz !== null) {
        const relativeDiff = Math.abs(utterance.meanHz - baseline.meanHz) / baseline.meanHz;
        acousticNote =
          relativeDiff > 0.15
            ? `Utterance pitch ~${utterance.meanHz} Hz vs. narrator baseline ~${baseline.meanHz} Hz (${(relativeDiff * 100).toFixed(0)}% different) -- possibly a distinct voice, but this source recording is FCBH's "Non-Drama" edition (a single reader, not a dramatized multi-actor cast), so a real difference here is more likely to be read-aloud emphasis than an actual different speaker. Treat as weak, not confirming, evidence.`
            : `Utterance pitch ~${utterance.meanHz} Hz is close to the narrator baseline (~${baseline.meanHz} Hz) -- consistent with what's expected from this "Non-Drama" single-reader recording; no acoustic evidence of a distinct voice actor here (expected -- HeartWord's own per-character voices are synthesized later, in the voice-lipsync stage, not read from this source audio).`;
      }
    } else if (!decision.vocalized) {
      acousticNote = "Not applicable -- this passage is not vocalized (see rationale).";
    }

    const overallConfidence = Math.round(0.5 * decision.textConfidence + 0.25 * startConfidence + 0.25 * endConfidence);

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
      acousticNote: collapsedWindowNote ? `${collapsedWindowNote} ${acousticNote}` : acousticNote
    });
  }

  const THRESHOLD = 80; // matches PRODUCT_VISION.md's auto-decide threshold, for consistency
  writeReport(scored, { docxPath, audioPath, totalDurationMs, gapsDetected: gaps.length, baseline, threshold: THRESHOLD });
}

function writeReport(
  utterances: ScoredUtterance[],
  meta: { docxPath: string; audioPath: string; totalDurationMs: number; gapsDetected: number; baseline: { meanHz: number | null }; threshold: number }
) {
  const lines: string[] = [];
  lines.push("HeartWord -- Clip Alignment: Quote & Speaker Attribution");
  lines.push("Chapter: Hatam Mark 2");
  lines.push("Edition: FCBH Non-Drama (single reader)");
  lines.push("Generated: " + new Date().toISOString());
  lines.push(`Source text: ${meta.docxPath}`);
  lines.push(`Source audio: ${meta.audioPath} (${(meta.totalDurationMs / 1000).toFixed(1)}s, ${meta.gapsDetected} silence gaps detected)`);
  lines.push(`Narrator baseline pitch: ${meta.baseline.meanHz ?? "n/a"} Hz`);
  lines.push(`Producer-review threshold: overall confidence below ${meta.threshold}/100`);
  lines.push("");
  lines.push("See clips-alignment-Mark-2-version-2.txt for the drama-edition-corroborated re-run of this same analysis.");
  lines.push("");
  lines.push("=".repeat(78));
  lines.push("METHOD (read this before trusting a number below)");
  lines.push("=".repeat(78));
  lines.push(
    "WHO is speaking each quotation was decided by reading all 28 verses of\n" +
    "Hatam Mark 2 against the English reference translation, looking for\n" +
    "explicit Hatam quotative-introduction phrases (\"X buhup\" = \"X answered\",\n" +
    "\"X hig Y\" = \"X said to Y\", etc.) -- the same approach BVET used for Mark\n" +
    "1 (see docs/ARCHITECTURE.md). There is no dictionary-driven or ASR-driven\n" +
    "algorithm that does this step for a language this under-resourced; it is\n" +
    "a close-reading judgment, cited with the actual Hatam evidence phrase\n" +
    "for every decision below so a Hatam specialist can check it quickly."
  );
  lines.push("");
  lines.push(
    "WHEN each quotation happens in the audio is a much weaker estimate: a\n" +
    "proportional guess based on the quote's character position within the\n" +
    "full chapter text (assuming roughly constant speech rate), nudged onto\n" +
    "the nearest real detected silence gap when one exists within 6 seconds.\n" +
    "This is NOT verified audio alignment -- see 'Known limitations' in\n" +
    "docs/ARCHITECTURE.md's ingestion section for why this recording's pauses\n" +
    "don't reliably mark verse or clause boundaries. Timestamps below are a\n" +
    "starting point for a producer to scrub to, not a cut list."
  );
  lines.push("");
  lines.push(
    "The acoustic pitch check is the weakest signal of the three and is\n" +
    "reported separately, not folded into the confidence score: this FCBH\n" +
    "recording is the \"Non-Drama\" edition (Original-FCBH-Audio/\n" +
    "Hatam_had_LAI_NT_Non-Drama/...), meaning one reader voices the entire\n" +
    "chapter -- so finding NO pitch difference between a quotation and the\n" +
    "narrator baseline is the EXPECTED, unremarkable result, not a failure\n" +
    "of the check. A large difference is only weak corroborating evidence of\n" +
    "a different speaker, not proof."
  );
  lines.push("");

  const needsReview = utterances.filter((u) => u.vocalized && u.overallConfidence < meta.threshold);
  lines.push("=".repeat(78));
  lines.push(`PRODUCER REVIEW NEEDED: ${needsReview.length} of ${utterances.filter((u) => u.vocalized).length} vocalized utterances score below ${meta.threshold}/100 overall`);
  lines.push("=".repeat(78));
  if (needsReview.length > 0) {
    lines.push(
      "In every case here it is the TIME estimate dragging the score down, not\n" +
      "the speaker decision -- check each entry's Text confidence separately."
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
      lines.push(`  Acoustic check: ${u.acousticNote}`);
      lines.push(
        `  Confidence -- text: ${u.textConfidence}/100, start: ${u.startConfidence}/100, end: ${u.endConfidence}/100,` +
          ` OVERALL: ${u.overallConfidence}/100${u.overallConfidence < meta.threshold ? "  [BELOW THRESHOLD -- see producer review list above]" : ""}`
      );
    }
  }
  lines.push("");

  const outDir = join(getDataDir(), "exports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "clips-alignment-Mark-2-version-1.txt");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
