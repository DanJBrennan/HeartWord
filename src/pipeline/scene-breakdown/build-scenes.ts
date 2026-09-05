/**
 * Pure scene-grouping logic for stage 2 (scene breakdown) -- separated
 * from index.ts's database glue so it's directly testable. See index.ts
 * for how this plugs into the real pipeline.
 */
import type { SourceHeading } from "../ingestion/parse-source-text.js";

export interface SceneDescriptor {
  sequence: number;
  verseStart: number;
  verseEnd: number;
  verseStartRef: string;
  verseEndRef: string;
  summary: string;
}

export interface SegmentInfo {
  verseRef: string;
  speakerName: string | null; // null = narration (no character speaks)
}

export interface BuildScenesResult {
  scenes: SceneDescriptor[];
  /** A segment whose verse range crosses a scene boundary -- the audio
   *  itself was never split at the exact word/verse that boundary falls
   *  on (stage 1 only pins down verse-level timing where a quotation's
   *  own boundary happens to land there), so this can't be resolved
   *  without more audio work than exists yet. Flagged so a human knows,
   *  rather than the segment being silently counted as fully belonging
   *  to one scene or the other. */
  boundaryStraddlingWarnings: string[];
}

/** Extracts the first (and, if present, last) verse number out of a
 *  verse_ref string like "Mark 2:8-10" or "Mark 2:28 (narration)". */
export function parseVerseRange(verseRef: string): { start: number; end: number } {
  // Anchor on the colon so "Mark 2:8-10" extracts 8-10, not the chapter
  // number "2" that precedes the colon.
  const afterColon = verseRef.includes(":") ? verseRef.slice(verseRef.indexOf(":") + 1) : verseRef;
  const match = afterColon.match(/(\d+)(?:-(\d+))?/);
  if (!match) throw new Error(`parseVerseRange: could not find a verse number in "${verseRef}"`);
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return { start, end };
}

/**
 * Groups a chapter's audio segments into scenes using the source text's
 * OWN pericope headings (parseSourceHeadings) as the scene boundaries --
 * following the translation's already-published structure rather than
 * inventing a narrative breakdown, per AGENTS.md/NON_GOALS.md. Each
 * scene's summary states only what's already established: the heading
 * text, its synoptic cross-reference, the verse range, and which
 * characters (per stage 1's real speaker attribution) actually speak in
 * it -- no staging, camera, or action content, which is stage 3's job.
 */
export function buildScenesFromHeadings(
  headings: SourceHeading[],
  lastVerse: number,
  book: string,
  chapter: number,
  segments: SegmentInfo[]
): BuildScenesResult {
  const bookTitle = book.charAt(0).toUpperCase() + book.slice(1);
  const ranges = headings.map((heading, i) => ({
    heading,
    verseStart: heading.verseStart,
    verseEnd: i + 1 < headings.length ? headings[i + 1]!.verseStart - 1 : lastVerse
  }));

  const sceneIndexOf = (verse: number): number => ranges.findIndex((r) => verse >= r.verseStart && verse <= r.verseEnd);

  const warnings = new Set<string>();
  const speakersByScene: Array<Set<string>> = ranges.map(() => new Set());

  for (const seg of segments) {
    const { start, end } = parseVerseRange(seg.verseRef);
    const startScene = sceneIndexOf(start);
    const endScene = sceneIndexOf(end);
    if (startScene === -1) continue; // out of range of any known heading -- shouldn't happen, skip defensively
    if (endScene !== -1 && endScene !== startScene) {
      warnings.add(
        `Segment "${seg.verseRef}" spans scene ${startScene + 1} and scene ${endScene + 1} -- the audio was never ` +
          `split at that exact boundary (only quotation edges get verse-level timing), so this can't be resolved ` +
          `without more audio work. Counted toward scene ${startScene + 1} only.`
      );
    }
    if (seg.speakerName) speakersByScene[startScene]!.add(seg.speakerName);
  }

  const scenes: SceneDescriptor[] = ranges.map((r, i) => {
    const verseStartRef = `${bookTitle} ${chapter}:${r.verseStart}`;
    const verseEndRef = `${bookTitle} ${chapter}:${r.verseEnd}`;
    const parallelNote = r.heading.parallelRefs ? ` (parallel: ${r.heading.parallelRefs})` : "";
    const speakers = [...speakersByScene[i]!];
    const speakerNote =
      speakers.length > 0
        ? ` Speaking characters already attributed in this scene: ${speakers.join(", ")}.`
        : " No character dialogue attributed in this scene yet.";
    return {
      sequence: i + 1,
      verseStart: r.verseStart,
      verseEnd: r.verseEnd,
      verseStartRef,
      verseEndRef,
      summary: `${r.heading.headingText}${parallelNote}. Covers ${verseStartRef}-${verseEndRef}.${speakerNote}`
    };
  });

  return { scenes, boundaryStraddlingWarnings: [...warnings] };
}
