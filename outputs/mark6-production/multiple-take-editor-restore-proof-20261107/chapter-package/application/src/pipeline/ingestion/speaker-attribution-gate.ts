import { verseNumbers } from "./continuous-speech.js";

/**
 * A chapter with quoted Scripture needs at least one source-speaker
 * attribution before downstream planning starts. Without this guard, casting
 * has no eligible speaking character and can silently plan every shot as
 * narration.
 *
 * Quotation marks are only an early warning signal: they do not identify a
 * speaker or authorize a binding. Source alignment must still record the
 * exact character and audio interval.
 */
export function directSpeechVerseNumbers(verses: ReadonlyArray<{ verse: number; text: string }>): number[] {
  return verses.filter(({ text }) => /["“”‘’«»]/u.test(text)).map(({ verse }) => verse);
}

/**
 * Quote punctuation in the verified reference is a coverage signal, never
 * speaker evidence. It nevertheless tells us which source verses need a
 * named, reviewed attribution before the film can be planned. The state is
 * deliberately kept across verses, so a quote opened in verse 3 and closed in
 * verse 9 does not leave its interior verses invisible to the gate.
 */
export function directSpeechRuns(verses: ReadonlyArray<{ verse: number; text: string }>): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  let straight = false, curlyDouble = false, curlySingle = false, guillemet = false;
  const quoted = () => straight || curlyDouble || curlySingle || guillemet;
  for (const verse of [...verses].sort((a, b) => a.verse - b.verse)) {
    const before = quoted(); let marked = false;
    for (const char of verse.text) {
      if (char === '"') { straight = !straight; marked = true; }
      else if (char === "“") { curlyDouble = true; marked = true; }
      else if (char === "”") { curlyDouble = false; marked = true; }
      else if (char === "‘") { curlySingle = true; marked = true; }
      else if (char === "’") { curlySingle = false; marked = true; }
      else if (char === "«") { guillemet = true; marked = true; }
      else if (char === "»") { guillemet = false; marked = true; }
    }
    if (before || marked || quoted()) run.push(verse.verse);
    else if (run.length) { runs.push(run); run = []; }
    if (!quoted() && run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}

export interface SourceSpeakerCoverageSegment {
  verseRef: string | null;
  speakerId: string | null;
  reviewedNarration?: boolean;
  /**
   * The original-reading source clock, when the caller has it.  Supplying it
   * lets the gate inspect unlabelled alignment slices between two labelled
   * direct-speech slices instead of accidentally treating them as narration.
   */
  startMs?: number;
  endMs?: number;
}

/**
 * Holds a chapter when a verse inside a reference-text direct-speech run has
 * no named source speaker at all. It does not guess whether an unassigned
 * source slice is narrator lead-in or dialogue; the hold asks for that exact
 * source review instead. This prevents a lone attributed fragment from
 * allowing the rest of a multi-verse speech to become narration.
 */
export function incompleteSpeakerAttributionHold(
  referenceVerses: ReadonlyArray<{ verse: number; text: string }>,
  sourceSegments: ReadonlyArray<SourceSpeakerCoverageSegment>
): string | null {
  const runs = directSpeechRuns(referenceVerses);
  if (!runs.length) return null;
  const attributedVerses = new Set(sourceSegments
    .filter(segment => segment.speakerId !== null || segment.reviewedNarration)
    .flatMap(segment => verseNumbers(segment.verseRef)));
  const missingVerses = [...new Set(runs.flat().filter(verse => !attributedVerses.has(verse)))];

  // A verse-level attribution is necessary but not sufficient.  A source
  // alignment can split one verse into several intervals; in that case a
  // single attributed fragment must not make the later unassigned speech
  // silently become narration.  Within each continuous quoted run, allow
  // narrated setup only *before* the first named speaker.  Every source
  // interval through the run's last labelled interval must then be bound.
  //
  // Callers provide original-reading segments ordered by source time.  Using
  // their order also keeps this safe for compact test fixtures that do not
  // retain timestamps.  Null verse refs are deliberately included between the
  // first and last known run segments: those are precisely the alignment
  // leftovers that must be reviewed rather than skipped.
  const ordered = [...sourceSegments].sort((left, right) =>
    left.startMs === undefined || right.startMs === undefined ? 0 : left.startMs - right.startMs
  );
  const partialRuns: number[] = [];
  for (const run of runs) {
    const runVerses = new Set(run);
    const indices = ordered.flatMap((segment, index) => {
      return verseNumbers(segment.verseRef).some(verse => runVerses.has(verse)) ? [index] : [];
    });
    if (!indices.length) continue;
    const first = indices[0]!;
    const last = indices[indices.length - 1]!;
    const firstNamed = ordered.findIndex((segment, index) =>
      index >= first && index <= last && (segment.speakerId !== null || segment.reviewedNarration)
    );
    if (firstNamed === -1) continue; // The verse-level check reports this clearly.
    const hasUnboundTail = ordered.slice(firstNamed, last + 1).some(segment => segment.speakerId === null && !segment.reviewedNarration);
    if (hasUnboundTail) partialRuns.push(...run);
  }

  const missing = [...new Set([...missingVerses, ...partialRuns])];
  if (!missing.length) return null;
  return `Casting held before storyboard generation: the verified reference text has direct speech whose source-speaker coverage is incomplete in verse(s) ${missing.join(", ")}. Confirm the continuous speech with its outer audio bounds and covered verse range, or review real speaker/narrator interruptions separately. Internal verse boundaries do not need exact timing solely for attribution; no keyframes or media were generated.`;
}

export function missingSpeakerAttributionHold(
  verses: ReadonlyArray<{ verse: number; text: string }>,
  attributedSegmentCount: number
): string | null {
  const directSpeechVerses = directSpeechVerseNumbers(verses);
  if (directSpeechVerses.length === 0 || attributedSegmentCount > 0) return null;

  return (
    `Casting held before storyboard generation: the verified reference text contains direct speech in verse(s) ${directSpeechVerses.join(", ")}, ` +
    "but the aligned source recording has no speaker attributions. Record exact source-speaker interval bindings, then rerun casting; no keyframes or media were generated."
  );
}
