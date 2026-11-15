/**
 * Shared quote/speaker decisions for Hatam Mark 2, plus the mechanical
 * quote-span extraction that locates each decision's text in the real
 * parsed source .docx. Split out from mark-2.ts so both the "Non-Drama"
 * (version-1) and "Drama" (version-2, drama-corroborated) alignment runs
 * work from the exact same 13 hand-authored decisions instead of two
 * copies that could drift apart.
 *
 * See mark-2.ts for the full explanation of how these decisions were
 * reached (a close reading of Hatam against English, not an algorithm).
 */
import type { VerseRecord } from "./parse-source-text.js";

export const OPEN_QUOTE = "“";
export const CLOSE_QUOTE = "”";

export interface QuoteDecision {
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
export const DECISIONS: QuoteDecision[] = [
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
export interface QuoteSpan {
  hatamQuote: string;
  /** Character offset of the quote's start within the full concatenated
   *  chapter text (all 28 verses' text, in order, joined by a single
   *  space) -- the basis for the proportional time estimate below. */
  startCharOffset: number;
  endCharOffset: number;
  totalChars: number;
}

export function extractQuoteSpan(verses: VerseRecord[], decision: QuoteDecision): QuoteSpan {
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

/**
 * Shared timing-estimation step: a proportional guess based on the
 * quote's character position within the full chapter text (assuming
 * roughly constant speech rate), nudged onto the nearest real detected
 * silence gap when one exists within `toleranceMs`. Used identically by
 * the Non-Drama (version-1) and Drama (version-2) alignment runs, each
 * against its own audio's own duration and detected silence gaps -- the
 * two editions are NOT assumed to share timing.
 */
import type { SilenceGap } from "./detect-silences.js";

export interface TimingEstimate {
  estimatedStartMs: number;
  estimatedEndMs: number;
  refinedStartMs: number;
  refinedEndMs: number;
  startCorroborated: boolean;
  endCorroborated: boolean;
  collapsedWindowNote: string | null;
}

export function nearestGapMs(targetMs: number, gaps: SilenceGap[], toleranceMs: number): { midpointMs: number } | null {
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

export function estimateTimingWindow(
  span: QuoteSpan,
  totalDurationMs: number,
  gaps: SilenceGap[],
  toleranceMs: number
): TimingEstimate {
  const estimatedStartMs = Math.round((span.startCharOffset / span.totalChars) * totalDurationMs);
  const estimatedEndMs = Math.round((span.endCharOffset / span.totalChars) * totalDurationMs);

  const startGap = nearestGapMs(estimatedStartMs, gaps, toleranceMs);
  const endGap = nearestGapMs(estimatedEndMs, gaps, toleranceMs);

  let refinedStartMs = startGap?.midpointMs ?? estimatedStartMs;
  let refinedEndMs = endGap?.midpointMs ?? estimatedEndMs;
  let startCorroborated = startGap !== null;
  let endCorroborated = endGap !== null;
  let collapsedWindowNote: string | null = null;

  // A short quotation's start and end proportional estimates can land
  // close enough together that both snap to the same nearby silence gap,
  // collapsing the window to a single point -- a snapping artifact, not a
  // real zero-duration clip. Fall back to the unrefined proportional
  // estimates rather than report a window nothing could be cut from.
  if (refinedEndMs <= refinedStartMs) {
    refinedStartMs = estimatedStartMs;
    refinedEndMs = Math.max(estimatedEndMs, estimatedStartMs + 500);
    startCorroborated = false;
    endCorroborated = false;
    collapsedWindowNote =
      "Start and end both snapped to the same nearby silence gap, collapsing the window to a single point " +
      "(likely because this quotation is very short) -- reverted to the unrefined proportional estimate instead.";
  }

  return {
    estimatedStartMs,
    estimatedEndMs,
    refinedStartMs: Math.round(refinedStartMs),
    refinedEndMs: Math.round(refinedEndMs),
    startCorroborated,
    endCorroborated,
    collapsedWindowNote
  };
}

/** mm:ss.ff formatting shared by both alignment report writers. */
export function fmtTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, "0")}`;
}
