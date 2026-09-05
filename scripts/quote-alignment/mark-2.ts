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
 * window for each one. Every quote decision below (WHO said WHAT) was
 * reached by actually reading all 28 verses side by side in Hatam and
 * English -- there's no dictionary-driven or ASR-driven algorithm that
 * does this step; see "Why this isn't a deterministic algorithm" further
 * down. The exact quote TEXT and its offsets, though, are pulled
 * mechanically from the real parsed source text (see extractQuoteSpan)
 * rather than retyped by hand, so they can't drift from the source.
 *
 * Usage: npx tsx scripts/quote-alignment/mark-2.ts
 * Output: HEARTWORD_DATA_DIR/exports/clips-alignment-Mark-2-version-1.txt
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../src/db/client.js";
import { detectSilences, getAudioDurationMs, type SilenceGap } from "../../src/pipeline/ingestion/detect-silences.js";
import { parseSourceTextByVerse, type VerseRecord } from "../../src/pipeline/ingestion/parse-source-text.js";
import { decodeToPcm16Mono, estimateMeanPitchHz } from "./pitch.js";

const OPEN_QUOTE = "“"; // “
const CLOSE_QUOTE = "”"; // ”

interface QuoteDecision {
  id: string;
  verseStart: number;
  verseEnd: number;
  speakerLabel: string;
  /** Matches a character's legacy_identity_id in the Mark 2 import
   *  manifest (HEARTWORD_DATA_DIR/assets/characters/import-manifest.json),
   *  or null when nothing should be voiced for this passage at all. */
  speakerLegacyId: string | null;
  /** false = this is reported/inner speech ("questioning in their
   *  hearts"), not something a character says aloud in the scene -- no
   *  clip should be cut for it regardless of confidence. */
  vocalized: boolean;
  /** 0-100: confidence in the TEXT decision alone (who's speaking, and
   *  which words are theirs) -- independent of whether we can currently
   *  place it accurately in the audio. Based on how explicit and how
   *  well-precedented the Hatam quotative marker is; see evidencePhrase. */
  textConfidence: number;
  /** The Hatam phrase that actually signals the quotation and its
   *  speaker (quoted verbatim from the source text as evidence). */
  evidencePhrase: string;
  /** Plain-language explanation, written for a producer who doesn't read
   *  Hatam -- per PRODUCT_VISION.md's text-first assurance model. */
  rationale: string;
}

/**
 * Every direct-speech passage in Hatam Mark 2, decided by reading the
 * whole chapter in Hatam against the English reference
 * (HEARTWORD_DATA_DIR/assets/reference/english/mark-2/mark-2-text.docx,
 * imported from BVET-Data for this exercise) and, where a Hatam word
 * needed checking, the Griffiths dictionary
 * (OpenAI-Code Comics/assets/hatam-dictionary/hatam-lexicon.json -- Dan
 * pointed at a path ending "hatam-dictionary copy" that doesn't exist on
 * this machine; this is the closest match, the same 2009 Griffiths
 * lexicon PRODUCT_VISION.md's Source Material Validator names -- worth
 * Dan confirming this is the intended one).
 *
 * Character IDs match legacy_identity_id in the Mark 2 import manifest.
 * Verses 6-7 (the scribes "questioning in their hearts") are the one
 * passage in this chapter that reads as a direct quotation but is
 * explicitly reported/inner speech, not scene dialogue -- included here
 * with vocalized:false so it's accounted for, not silently dropped.
 */
const DECISIONS: QuoteDecision[] = [
  {
    id: "q1", verseStart: 5, verseEnd: 5,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 92,
    evidencePhrase: "pai bak no di las hwen",
    rationale:
      "\"pai bak no di las hwen\" (\"said to the paralytic\") directly introduces the quotation, and it closes within the same verse. Matches the reviewed Hatam Mark 1 precedent's \"X pai bak Y\" construction for \"X said to Y\"."
  },
  {
    id: "q2", verseStart: 6, verseEnd: 7,
    speakerLabel: "Scribes (silent reasoning -- not vocalized)", speakerLegacyId: null, vocalized: false, textConfidence: 88,
    evidencePhrase: "ibou poi di ingat rin ei mpia dima ikan",
    rationale:
      "\"ingat rin\" (\"thinking/considering\") is not a speech verb, and the English reference frames the same lines as the scribes \"questioning in their hearts\" -- reported inner thought, not something said aloud in the scene. No clip should be cut for this passage; the Principal scribe character has no line here (matches the caveat already on his import-manifest entry)."
  },
  {
    id: "q3", verseStart: 8, verseEnd: 10,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 85,
    evidencePhrase: "hig singgre yok",
    rationale:
      "\"hig singgre yok\" (\"said to them\") introduces Jesus's rebuke to the scribes. The quotation runs through most of verse 10, where a narrator aside (\"Api Noni cuk no di las hwen,\" = \"Then he said to the paralytic,\") interrupts it before Jesus's next sentence -- see q4. Verse 9's embedded hypothetical lines (\"...to say, 'Rise, take up your bed and walk'?\") are part of Jesus's own rhetorical question, not a separate speaker."
  },
  {
    id: "q4", verseStart: 10, verseEnd: 11,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 93,
    evidencePhrase: "Api Noni cuk no di las hwen",
    rationale:
      "\"Api Noni cuk no di las hwen\" (\"Then he said to the paralytic\") is a fresh, explicit reintroduction inside verse 10, right after q3's quotation closes -- the clearest example in this chapter of one continuous scene's dialogue being split by the Hatam text across a narrator aside rather than left as one unbroken quotation. Same speaker as q3."
  },
  {
    id: "q5", verseStart: 12, verseEnd: 12,
    speakerLabel: "Crowd (amazed witnesses)", speakerLegacyId: "mark-2-crowd-anchors-video-real", vocalized: true, textConfidence: 90,
    evidencePhrase: "ipai biyam",
    rationale:
      "\"ipai biyam\" (\"they said\") is plural, matching the English reference's crowd exclamation after Jesus heals the paralytic. Per the crowd character's import-manifest note (and PRODUCT_VISION.md's crowd-voicing convention), this should be voiced by one representative witness rather than the whole group."
  },
  {
    id: "q6", verseStart: 14, verseEnd: 14,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 96,
    evidencePhrase: "Yesus hig noni",
    rationale:
      "\"Yesus hig noni\" (\"Jesus said to him\") is about as explicit and short as a quotative marker gets in this chapter -- directly parallel to the reviewed Hatam Mark 1:17 construction (\"Yesus hig yok\"). The quotation is two words and closes within the same verse."
  },
  {
    id: "q7", verseStart: 16, verseEnd: 16,
    speakerLabel: "Scribes of the Pharisees", speakerLegacyId: "mark-2-principal-scribe-video-real", vocalized: true, textConfidence: 90,
    evidencePhrase: "ihig ser yo di igya kui Noni",
    rationale:
      "\"ihig ser yo di igya kui Noni\" (\"they said to his disciples\") -- note the question is addressed to the disciples, not to Jesus directly, matching the English reference exactly. Matches the Principal scribe character's Mark 2:16 objection noted on his import-manifest entry."
  },
  {
    id: "q8", verseStart: 17, verseEnd: 17,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 94,
    evidencePhrase: "Yesus miap ighyet leu api buhup",
    rationale:
      "\"buhup\" (\"answered\") is the same verb the reviewed Hatam Mark 1 decisions repeatedly relied on for \"Jesus answered\" (e.g. Mark 1:38, 1:25). Quotation closes within the same verse."
  },
  {
    id: "q9", verseStart: 18, verseEnd: 18,
    speakerLabel: "Unnamed questioners (crowd)", speakerLegacyId: "mark-2-crowd-anchors-video-real", vocalized: true, textConfidence: 75,
    evidencePhrase: "tungwatu nya ibou poi ikwei hig ser Yesus",
    rationale:
      "\"tungwatu nya ... hig ser Yesus\" (\"people ... said to Jesus\") is clear on the quotative marker, but unlike q5 this group is never given a distinguishing description -- attributing it to the same crowd character as q5 is a producer convenience, not something the text itself confirms is the same group. Flagged lower confidence for that reason; worth a producer decision either way."
  },
  {
    id: "q10", verseStart: 19, verseEnd: 22,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 91,
    evidencePhrase: "Yesus buhup",
    rationale:
      "\"Yesus buhup\" (\"Jesus answered\") opens verse 19, and the quotation runs uninterrupted through the end of verse 22 with no closing mark and no narrator aside anywhere in between -- the clearest example in this chapter of a single quotation spanning multiple verses with nothing breaking it up."
  },
  {
    id: "q11", verseStart: 24, verseEnd: 24,
    speakerLabel: "Pharisees", speakerLegacyId: "mark-2-principal-scribe-video-real", vocalized: true, textConfidence: 90,
    evidencePhrase: "Farisi nya inso tut bak Yesus bipai",
    rationale:
      "\"Farisi nya ... bipai\" (\"the Pharisees ... said\") explicitly names the speaker group and closes within the same verse. Matches the Principal scribe character's Mark 2:24 objection noted on his import-manifest entry."
  },
  {
    id: "q12", verseStart: 25, verseEnd: 26,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 90,
    evidencePhrase: "Yesus buhup",
    rationale:
      "\"Yesus buhup\" (\"Jesus answered\") opens verse 25; the quotation about David closes with its own mark at the end of verse 26 -- see q13 for why this is treated as a separate quotation from what follows, unlike the English reference."
  },
  {
    id: "q13", verseStart: 27, verseEnd: 28,
    speakerLabel: "Jesus", speakerLegacyId: "jesus", vocalized: true, textConfidence: 88,
    evidencePhrase: "Lene Yesus pai bu",
    rationale:
      "IMPORTANT DIVERGENCE FROM THE ENGLISH REFERENCE: English renders Mark 2:25-28 as one continuous quotation. Hatam instead closes the David story at the end of verse 26 (q12) and reopens with a fresh quotative marker, \"Lene Yesus pai bu\" (\"Then Jesus said further\"), at the start of verse 27 for the Sabbath teaching. Same speaker as q12 in the same continuous scene, so this has no effect on casting -- but it's concrete proof that Hatam's own quote structure has to be trusted over the English translation's quote boundaries, exactly as PRODUCT_VISION.md's text-first assurance model requires."
  }
];

/** A quotation's span located in the actual parsed source text, plus the
 *  Hatam text itself -- pulled mechanically so it can't drift from the
 *  real .docx by a retyping error. */
interface QuoteSpan {
  hatamQuote: string;
  /** Character offset of the quote's start within the full concatenated
   *  chapter text (all 28 verses' text, in order, joined by a single
   *  space) -- the basis for the proportional time estimate below. */
  startCharOffset: number;
  endCharOffset: number;
  totalChars: number;
}

function extractQuoteSpan(verses: VerseRecord[], decision: QuoteDecision): QuoteSpan {
  const byVerse = new Map(verses.map((v) => [v.verse, v.text]));
  let cumulative = 0;
  let startCharOffset = -1;
  let endCharOffset = -1;
  let quoteChars: string[] = [];

  for (let verse = 1; verse <= 28; verse++) {
    const text = byVerse.get(verse);
    if (text === undefined) continue;

    if (verse >= decision.verseStart && verse <= decision.verseEnd) {
      const openIndex = text.indexOf(OPEN_QUOTE);
      const closeIndex = text.lastIndexOf(CLOSE_QUOTE);

      if (verse === decision.verseStart) {
        // Quote opens partway through this verse if a mark is present;
        // otherwise it's already open from a decision that started
        // earlier (not used by any entry in DECISIONS above, but handled
        // for completeness/future chapters).
        const localStart = openIndex >= 0 ? openIndex : 0;
        startCharOffset = cumulative + localStart;
      }
      if (verse === decision.verseEnd) {
        const localEnd = closeIndex >= 0 ? closeIndex + 1 : text.length;
        endCharOffset = cumulative + localEnd;
      }
      quoteChars.push(text.slice(verse === decision.verseStart && openIndex >= 0 ? openIndex : 0, verse === decision.verseEnd && closeIndex >= 0 ? closeIndex + 1 : text.length));
    }

    cumulative += text.length + 1; // +1 for the joining space, matching the join below
  }

  if (startCharOffset < 0 || endCharOffset < 0) {
    throw new Error(`${decision.id}: could not locate quote marks for verses ${decision.verseStart}-${decision.verseEnd}.`);
  }

  return {
    hatamQuote: quoteChars.join(" ").replace(/[“”]/g, "").trim(),
    startCharOffset,
    endCharOffset,
    totalChars: cumulative - 1
  };
}

function nearestGapMs(targetMs: number, gaps: SilenceGap[], toleranceMs: number): { midpointMs: number } | null {
  let best: SilenceGap | null = null;
  let bestDistance = Infinity;
  for (const gap of gaps) {
    const midpoint = (gap.startMs + gap.endMs) / 2;
    const distance = Math.abs(midpoint - targetMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = gap;
    }
  }
  if (!best || bestDistance > toleranceMs) return null;
  return { midpointMs: (best.startMs + best.endMs) / 2 };
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
    const estimatedStartMs = Math.round((span.startCharOffset / span.totalChars) * totalDurationMs);
    const estimatedEndMs = Math.round((span.endCharOffset / span.totalChars) * totalDurationMs);

    const startGap = nearestGapMs(estimatedStartMs, gaps, GAP_TOLERANCE_MS);
    const endGap = nearestGapMs(estimatedEndMs, gaps, GAP_TOLERANCE_MS);

    let refinedStartMs = startGap?.midpointMs ?? estimatedStartMs;
    let refinedEndMs = endGap?.midpointMs ?? estimatedEndMs;
    let startCorroborated = startGap !== null;
    let endCorroborated = endGap !== null;
    let collapsedWindowNote: string | null = null;

    // A short quotation's start and end proportional estimates can land
    // close enough together that both snap to the same nearby silence
    // gap, collapsing the window to a single point (seen on q6's two-word
    // quote). That's a snapping artifact, not a real zero-duration clip
    // -- fall back to the unrefined proportional estimates rather than
    // report a window nothing could actually be cut from.
    if (refinedEndMs <= refinedStartMs) {
      refinedStartMs = estimatedStartMs;
      refinedEndMs = Math.max(estimatedEndMs, estimatedStartMs + 500);
      startCorroborated = false;
      endCorroborated = false;
      collapsedWindowNote =
        "Start and end both snapped to the same nearby silence gap, collapsing the window to a single point " +
        "(likely because this quotation is very short) -- reverted to the unrefined proportional estimate instead.";
    }

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

function fmtTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, "0")}`;
}

function writeReport(
  utterances: ScoredUtterance[],
  meta: { docxPath: string; audioPath: string; totalDurationMs: number; gapsDetected: number; baseline: { meanHz: number | null }; threshold: number }
) {
  const lines: string[] = [];
  lines.push("HeartWord -- Clip Alignment: Quote & Speaker Attribution");
  lines.push("Chapter: Hatam Mark 2");
  lines.push("Generated: " + new Date().toISOString());
  lines.push(`Source text: ${meta.docxPath}`);
  lines.push(`Source audio: ${meta.audioPath} (${(meta.totalDurationMs / 1000).toFixed(1)}s, ${meta.gapsDetected} silence gaps detected)`);
  lines.push(`Narrator baseline pitch: ${meta.baseline.meanHz ?? "n/a"} Hz`);
  lines.push(`Producer-review threshold: overall confidence below ${meta.threshold}/100`);
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
