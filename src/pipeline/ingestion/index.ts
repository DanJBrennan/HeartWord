import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type { Stage } from "../types.js";
import { detectSilences, getAudioDurationMs } from "./detect-silences.js";
import { parseSourceText, parseSourceTextByVerse, type VerseRecord } from "./parse-source-text.js";
import { selectBoundaries } from "./select-boundaries.js";
import { decodeToPcm16Mono, computePitchTrack } from "./pitch.js";
import { scoreMark2Utterances } from "./mark-2-acoustic-scoring.js";
import { buildMark2Segments, type SegmentDescriptor } from "./mark-2-segments.js";

export interface ProjectRow {
  id: string;
  language: string;
  book: string;
  chapter: number;
}

/**
 * Source files live at HEARTWORD_DATA_DIR/assets/source/<language>/
 * <book>-<chapter>/<book>-<chapter>-{text.docx,fcbh-audio.mp3} — the
 * layout the Mark 2 import used (docs/plans/CURRENT_GOAL.md). A chapter
 * not yet imported this way fails here with a clear message rather than
 * a confusing downstream error.
 */
export function resolveSourcePaths(project: ProjectRow): { docxPath: string; audioPath: string; audioRelPath: string } {
  const chapterDir = `${project.book}-${project.chapter}`;
  const baseName = `${project.book}-${project.chapter}`;
  const audioRelPath = join("source", project.language, chapterDir, `${baseName}-fcbh-audio.mp3`);

  const docxPath = join(getDataDir(), "assets", "source", project.language, chapterDir, `${baseName}-text.docx`);
  const audioPath = join(getDataDir(), "assets", audioRelPath);

  if (!existsSync(docxPath)) {
    throw new Error(
      `No source text found at ${docxPath}. Import this chapter's text/audio into ` +
        `HEARTWORD_DATA_DIR/assets/source/${project.language}/${chapterDir}/ before running ingestion.`
    );
  }
  if (!existsSync(audioPath)) {
    throw new Error(`No source audio found at ${audioPath}.`);
  }

  return { docxPath, audioPath, audioRelPath };
}

/**
 * Stage 1: Ingestion & alignment. Takes the chapter's source-language
 * audio and translated/latinized text, aligns text to audio timing, and
 * — per PRODUCT_VISION.md's "Source Material Validator" spec — identifies
 * quotation boundaries and speaker attribution too, each with a 0-100
 * assurance score. See docs/ARCHITECTURE.md pipeline stage 1.
 *
 * TWO CODE PATHS, deliberately:
 *
 * - Hatam Mark 2 (this project's v1 proving chapter), when its real
 *   Demucs-separated vocals track exists: runs the full quote-aware path
 *   (runMark2QuoteAwareIngestion below) — hand-authored quote/speaker
 *   decisions (mark-2-quote-decisions.ts) scored against real audio
 *   corroboration (mark-2-acoustic-scoring.ts) and assembled into a
 *   contiguous, non-overlapping segment timeline (mark-2-segments.ts).
 *   This is genuinely real work, not a stub — see
 *   docs/plans/CURRENT_GOAL.md's "wire in today's Mark 2 work as-is"
 *   entry for why it's intentionally chapter-specific rather than a
 *   general algorithm: no chapter-agnostic quotation/speaker-detection
 *   model exists yet, and building one was explicitly deferred past v1.
 * - Every other chapter falls back to the original v1 approach: parse the
 *   source .docx into paragraph-level verse groups, detect silence gaps,
 *   and assume verse-group boundaries fall on the longest ones — no
 *   speaker attribution at all (speaker_character_id stays NULL). This is
 *   honestly low-confidence, by design: there's no ASR or forced-
 *   alignment model for Hatam, so every boundary is capped below
 *   PRODUCT_VISION.md's 80-point auto-decide threshold and flagged for a
 *   language specialist to confirm — see "Ingestion & alignment (v1)" in
 *   docs/ARCHITECTURE.md for the full approach and its known limitations.
 */
export const runIngestion: Stage = async (projectId) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `Ingestion failed: no project with id ${projectId}.` };
  }

  let docxPath: string, audioPath: string, audioRelPath: string;
  try {
    ({ docxPath, audioPath, audioRelPath } = resolveSourcePaths(project));
  } catch (err) {
    return { ok: false, reasoning: `Ingestion failed: ${(err as Error).message}` };
  }

  if (project.language === "hatam" && project.book === "mark" && project.chapter === 2) {
    const vocalsPath = join(getDataDir(), "assets/source/hatam/mark-2/separated/vocals.mp3");
    if (existsSync(vocalsPath)) {
      try {
        return await runMark2QuoteAwareIngestion(db, project, docxPath, vocalsPath);
      } catch (err) {
        return { ok: false, reasoning: `Ingestion (Mark 2 quote-aware path) failed: ${(err as Error).message}` };
      }
    }
    // No separated vocals track yet for this project — fall through to
    // the generic path below rather than failing outright, so ingestion
    // still produces *something* usable (paragraph-level timing, no
    // speakers) before separate_audio.py has been run for this chapter.
  }

  const verseGroups = parseSourceText(docxPath, project.book, project.chapter);
  if (verseGroups.length === 0) {
    return {
      ok: false,
      reasoning: `Ingestion failed: parsed 0 verse groups from ${docxPath}. The verse-marker ` +
        `heuristic in parse-source-text.ts likely doesn't match this file's formatting.`
    };
  }

  let totalDurationMs: number;
  let gaps: ReturnType<typeof detectSilences>;
  try {
    totalDurationMs = getAudioDurationMs(audioPath);
    gaps = detectSilences(audioPath);
  } catch (err) {
    return { ok: false, reasoning: `Ingestion failed reading/analyzing ${audioPath}: ${(err as Error).message}` };
  }

  let timings: ReturnType<typeof selectBoundaries>;
  try {
    timings = selectBoundaries(gaps, verseGroups.length, totalDurationMs);
  } catch (err) {
    return {
      ok: false,
      reasoning:
        `Ingestion failed: could not place ${verseGroups.length - 1} boundaries for ` +
        `${verseGroups.length} verse groups. ${(err as Error).message}`
    };
  }

  const now = Date.now();
  const segmentIds: string[] = [];
  let lowConfidenceCount = 0;

  db.exec("BEGIN TRANSACTION");
  try {
    // Ingestion re-runs replace this project's previous original_reading
    // segments rather than appending duplicates alongside them.
    db.prepare(`DELETE FROM audio_segments WHERE project_id = ? AND layer = 'original_reading'`).run(projectId);
    db.prepare(`DELETE FROM review_notes WHERE project_id = ? AND subject_type = 'project' AND source = 'qc'`).run(
      projectId
    );

    const insertSegment = db.prepare(
      `INSERT INTO audio_segments
         (id, project_id, layer, source_path, start_ms, end_ms, speaker_character_id, verse_ref, confidence, created_at)
       VALUES (?, ?, 'original_reading', ?, ?, ?, NULL, ?, ?, ?)`
    );

    for (let i = 0; i < verseGroups.length; i++) {
      const id = randomUUID();
      const group = verseGroups[i]!; // timings has exactly verseGroups.length entries
      const timing = timings[i]!;
      insertSegment.run(id, projectId, audioRelPath, timing.startMs, timing.endMs, group.verseRef, timing.confidence, now);
      segmentIds.push(id);
      if (timing.confidence !== null && timing.confidence < 80) lowConfidenceCount++;
    }

    if (lowConfidenceCount > 0) {
      db.prepare(
        `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
         VALUES (?, ?, 'project', ?, 'qc', ?, 0, ?)`
      ).run(
        randomUUID(),
        projectId,
        projectId,
        `Ingestion produced ${verseGroups.length} candidate audio segments for ` +
          `${project.book} ${project.chapter}, but ${lowConfidenceCount} of their boundaries are a ` +
          `gap-duration heuristic (no ASR/forced-alignment exists for ${project.language}) and score ` +
          `below the 80-point auto-decide threshold in PRODUCT_VISION.md's assurance model. A language ` +
          `specialist should confirm these boundaries against the audio before scene breakdown treats ` +
          `them as final.`,
        now
      );
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return { ok: false, reasoning: `Ingestion failed writing results: ${(err as Error).message}` };
  }

  return {
    ok: true,
    reasoning:
      `Aligned ${verseGroups.length} verse-group segments (${verseGroups[0]!.verseRef} through ` +
      `${verseGroups[verseGroups.length - 1]!.verseRef}) against ${Math.round(totalDurationMs / 1000)}s of source ` +
      `audio using a longest-silence-gap heuristic (${gaps.length} candidate gaps detected). ` +
      `${lowConfidenceCount} of ${verseGroups.length} segment boundaries scored below the auto-decide ` +
      `threshold and were flagged in review_notes for language-specialist confirmation -- see ` +
      `"Known limitations" in src/pipeline/ingestion/index.ts.`
  };
};

/**
 * Real quote-aware ingestion for Hatam Mark 2 -- see runIngestion's
 * header for why this chapter gets its own path. Scores
 * mark-2-quote-decisions.ts's 13 hand-authored decisions against the real
 * separated vocals track (mark-2-acoustic-scoring.ts), assembles a
 * contiguous non-overlapping segment timeline (mark-2-segments.ts), and
 * writes it to audio_segments with real speaker_character_id values and
 * a per-segment review_notes row for anything below the 80-point
 * auto-decide threshold.
 *
 * source_path for every segment (both narration and dialogue) points at
 * the separated vocals track, not the original drama mix -- it's both
 * more accurate for this stage's own analysis (see
 * docs/ARCHITECTURE.md's "Real vocal isolation achieved" section) and,
 * being genuinely clean dialogue audio, plausibly the better source for
 * later per-character voice/lip-sync clipping too. That second part is a
 * reasonable default, not a settled decision -- worth revisiting once
 * stage 5 (voice & lip-sync) is actually built and audio *quality* (not
 * just timing accuracy) becomes directly consequential.
 */
async function runMark2QuoteAwareIngestion(
  db: ReturnType<typeof getDb>,
  project: ProjectRow,
  docxPath: string,
  vocalsPath: string
) {
  const dataDir = getDataDir();
  const vocalsRelPath = join("source", project.language, `${project.book}-${project.chapter}`, "separated", "vocals.mp3");

  const verses: VerseRecord[] = parseSourceTextByVerse(docxPath);
  const totalDurationMs = getAudioDurationMs(vocalsPath);
  const gaps = detectSilences(vocalsPath); // default -30dB is correct on the separated track -- see header
  const pcm = decodeToPcm16Mono(vocalsPath, 16000);
  const track = computePitchTrack(pcm, 16000);

  const { scored, narrator } = scoreMark2Utterances({ verses, totalDurationMs, gaps, track, gapToleranceMs: 6000 });
  const segments: SegmentDescriptor[] = buildMark2Segments(scored, verses, totalDurationMs, project.book, project.chapter);

  const characterRows = db.prepare(`SELECT id, legacy_identity_id FROM characters WHERE legacy_identity_id IS NOT NULL`).all() as Array<{
    id: string;
    legacy_identity_id: string;
  }>;
  const legacyToCharacterId = new Map(characterRows.map((r) => [r.legacy_identity_id, r.id]));

  const now = Date.now();
  const insertedSegmentIds: string[] = [];
  let reviewCount = 0;

  db.exec("BEGIN TRANSACTION");
  try {
    db.prepare(`DELETE FROM audio_segments WHERE project_id = ? AND layer = 'original_reading'`).run(project.id);
    db.prepare(
      `DELETE FROM review_notes WHERE project_id = ? AND source = 'qc' AND subject_type IN ('project','audio_segment')`
    ).run(project.id);

    const insertSegment = db.prepare(
      `INSERT INTO audio_segments
         (id, project_id, layer, source_path, start_ms, end_ms, speaker_character_id, verse_ref, confidence, created_at)
       VALUES (?, ?, 'original_reading', ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertReviewNote = db.prepare(
      `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
       VALUES (?, ?, 'audio_segment', ?, 'qc', ?, 0, ?)`
    );

    for (const seg of segments) {
      const characterId = seg.speakerLegacyId !== null ? legacyToCharacterId.get(seg.speakerLegacyId) : null;
      if (seg.speakerLegacyId !== null && characterId === undefined) {
        throw new Error(
          `Decision references speakerLegacyId "${seg.speakerLegacyId}" (verse ${seg.verseRef}), but no character ` +
            `with that legacy_identity_id exists in the database. Run npm run db:seed-characters, or check ` +
            `mark-2-quote-decisions.ts against the current import manifest.`
        );
      }
      const id = randomUUID();
      insertSegment.run(
        id, project.id, vocalsRelPath, seg.startMs, seg.endMs,
        characterId ?? null, seg.verseRef, seg.confidence, now
      );
      insertedSegmentIds.push(id);
      if (seg.reviewNote) {
        insertReviewNote.run(randomUUID(), project.id, id, seg.reviewNote, now);
        reviewCount++;
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const dialogueCount = segments.filter((s) => s.speakerLegacyId !== null).length;
  const narrationCount = segments.length - dialogueCount;

  return {
    ok: true,
    reasoning:
      `Quote-aware ingestion (real Demucs-separated vocals, ${(totalDurationMs / 1000).toFixed(1)}s, ${gaps.length} ` +
      `silence gaps) produced ${segments.length} contiguous audio segments for Mark ${project.chapter}: ` +
      `${dialogueCount} character-attributed dialogue segments and ${narrationCount} narration segments, from the ` +
      `13 hand-authored quote/speaker decisions in mark-2-quote-decisions.ts. ` +
      (narrator
        ? `Whole-chapter narrator pitch baseline: ${narrator.meanHz} Hz (std ${narrator.stdHz} Hz, ${narrator.sampleCount} bins). `
        : "") +
      `${reviewCount} of ${segments.length} segments scored below the 80-point auto-decide threshold and were ` +
      `flagged individually in review_notes for a language specialist -- see docs/ARCHITECTURE.md's "Real vocal ` +
      `isolation achieved" section and clips-alignment-Mark-2-version-3.txt for the full corroboration writeup.`
  };
}
