/**
 * Splits one already-ingested `original_reading` audio_segments row into
 * several phrase-level sub-segments -- built 2026-09-08 for the real gap
 * Dan/Codex found: Scene 3 Shots 3-6 (Mark 2:19, 2:20, 2:21, 2:22) each
 * carry their own verse but all four currently share ONE 76.7s
 * original_reading row spanning the whole "Mark 2:19-22" range (ingestion
 * grouped verses coarser than one-shot-per-verse turned out to need).
 * Every downstream duration lookup matches by verse-range overlap
 * (src/pipeline/casting/index.ts's dialogueDurationForShot), so all four
 * shots currently get credited with the full 76.7s instead of their own
 * slice -- this is what actually needs fixing, not a planning bug.
 *
 * Reuses the exact same heuristic already used to place verse-group
 * boundaries at chapter-ingestion time (detect-silences.ts's ffmpeg
 * silencedetect + select-boundaries.ts's longest-gaps-as-boundaries pick)
 * rather than inventing a second boundary-picking method -- just scoped to
 * one segment's own audio instead of the whole chapter, and producing one
 * boundary per new verse instead of one per scene. Confidence is
 * therefore capped the same way (see select-boundaries.ts) -- this is a
 * proposal for a human/Codex to confirm, not an auto-decided fact.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { detectSilences, getAudioDurationMs } from "./detect-silences.js";
import { selectBoundaries, type SegmentTiming } from "./select-boundaries.js";
import { extractClip } from "../voicing/extract-clip.js";

export interface ProposedSubSegment {
  verseRef: string;
  startMs: number; // absolute, within the original segment's source_path
  endMs: number;
  durationMs: number;
  confidence: number | null;
}

export interface SplitProposal {
  segmentId: string;
  sourcePath: string;
  speakerCharacterId: string | null;
  originalVerseRef: string | null;
  originalStartMs: number;
  originalEndMs: number;
  subSegments: ProposedSubSegment[];
}

interface SegmentRow {
  id: string;
  source_path: string;
  start_ms: number;
  end_ms: number;
  verse_ref: string | null;
  speaker_character_id: string | null;
}

/**
 * Analyzes one segment's own audio and proposes `verseRefs.length`
 * sub-segments spanning it, in order. Does not touch the database -- see
 * applySplit() for committing a proposal (or a reviewed/edited version of
 * one) once a human has looked at the confidence scores.
 */
export function proposeSplit(
  db: DatabaseSync,
  dataDirAssetsPath: string,
  segmentId: string,
  verseRefs: string[]
): SplitProposal {
  const segment = db
    .prepare(
      `SELECT id, source_path, start_ms, end_ms, verse_ref, speaker_character_id
       FROM audio_segments WHERE id = ? AND layer = 'original_reading'`
    )
    .get(segmentId) as SegmentRow | undefined;
  if (!segment) {
    throw new Error(`No original_reading audio_segments row with id ${segmentId}.`);
  }
  if (verseRefs.length < 2) {
    throw new Error(`splitOriginalReadingSegment needs at least 2 verseRefs to split into, got ${verseRefs.length}.`);
  }

  const absSourcePath = join(dataDirAssetsPath, segment.source_path);
  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-split-"));
  const tmpClipPath = join(tmpDir, "segment.mp3");

  try {
    extractClip(absSourcePath, segment.start_ms, segment.end_ms, tmpClipPath);
    const clipDurationMs = getAudioDurationMs(tmpClipPath);
    const allGaps = detectSilences(tmpClipPath);

    // Exclude gaps touching either edge of this sub-clip: they're almost
    // always leading/trailing room-tone from where the wider segment was
    // originally cut, not a real internal verse pause -- confirmed on the
    // real Mark 2:19-22 clip, where the single LONGEST detected gap ended
    // 4ms before the clip's own end and, left in, produced a nonsensical
    // 0.6s "verse". A real internal pause has actual speech on both sides.
    const edgeMarginMs = 300;
    const gaps = allGaps.filter(
      (g) => g.startMs > edgeMarginMs && g.endMs < clipDurationMs - edgeMarginMs
    );

    const timings: SegmentTiming[] = selectBoundaries(gaps, verseRefs.length, clipDurationMs);

    const subSegments: ProposedSubSegment[] = timings.map((t, i) => ({
      // safe: selectBoundaries(gaps, verseRefs.length, ...) always returns
      // exactly verseRefs.length timings, so index i is always in bounds.
      verseRef: verseRefs[i]!,
      startMs: segment.start_ms + t.startMs,
      endMs: segment.start_ms + t.endMs,
      durationMs: t.endMs - t.startMs,
      confidence: t.confidence
    }));

    return {
      segmentId: segment.id,
      sourcePath: segment.source_path,
      speakerCharacterId: segment.speaker_character_id,
      originalVerseRef: segment.verse_ref,
      originalStartMs: segment.start_ms,
      originalEndMs: segment.end_ms,
      subSegments
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Commits a (possibly human-adjusted) split proposal: deletes the one
 * wide original_reading row and inserts its sub-segments in its place.
 * Does NOT touch composite_cast_master -- re-running voicing afterward
 * naturally regenerates just the new verse slugs (their output filenames
 * don't exist yet) and leaves every other segment's cached file alone, so
 * that stays a deliberate, separately-triggered (and separately paid,
 * since it calls ElevenLabs) step rather than something this function
 * does implicitly.
 */
export function applySplit(db: DatabaseSync, projectId: string, proposal: SplitProposal): void {
  const insert = db.prepare(
    `INSERT INTO audio_segments
       (id, project_id, layer, source_path, start_ms, end_ms, speaker_character_id, verse_ref, confidence, created_at)
     VALUES (?, ?, 'original_reading', ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = Date.now();

  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`DELETE FROM audio_segments WHERE id = ?`).run(proposal.segmentId);
    for (const sub of proposal.subSegments) {
      insert.run(
        randomUUID(),
        projectId,
        proposal.sourcePath,
        sub.startMs,
        sub.endMs,
        proposal.speakerCharacterId,
        sub.verseRef,
        sub.confidence,
        now
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
