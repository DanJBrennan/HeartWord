import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type { Stage } from "../types.js";
import { detectSilences, getAudioDurationMs } from "./detect-silences.js";
import { parseSourceText } from "./parse-source-text.js";
import { selectBoundaries } from "./select-boundaries.js";

interface ProjectRow {
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
function resolveSourcePaths(project: ProjectRow): { docxPath: string; audioPath: string; audioRelPath: string } {
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
 * audio and translated/latinized text, aligns text to audio timing. See
 * docs/ARCHITECTURE.md pipeline stage 1.
 *
 * v1 approach (no ASR or forced-alignment model exists for Hatam, and no
 * one on this team reads it, so this can't be verified by listening):
 *   1. Parse the source .docx into paragraph-level verse groups (each
 *      paragraph in the source docx already reads as one sense-unit
 *      spanning one or more verses — see parse-source-text.ts).
 *   2. Detect every silence gap in the source audio (detect-silences.ts).
 *   3. Assume verse-group boundaries fall on the *longest* pauses, and
 *      pick exactly as many of the longest gaps as there are internal
 *      boundaries needed (select-boundaries.ts).
 *   4. Score every resulting boundary well below the "auto-decide"
 *      threshold from PRODUCT_VISION.md's assurance model (except the
 *      chapter's true start/end, which are certain) and record that
 *      explicitly via a review_notes row, since gap duration alone is a
 *      real but weak signal for this recording/language.
 *
 * Known limitations (see docs/ARCHITECTURE.md's ingestion section for the
 * fuller writeup): this produces paragraph-level timing, not per-verse;
 * it assumes the audio contains only the 28 verses with no spoken section
 * headings; and there is no reviewer UI yet to act on the review_notes
 * flag this stage writes — a human has to query the database directly to
 * see it for now.
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
