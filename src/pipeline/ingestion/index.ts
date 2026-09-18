import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import type { Stage } from "../types.js";
import { detectSilences, getAudioDurationMs } from "./detect-silences.js";
import { parseNarratedParagraphTitles, parseSourceText, parseSourceTextByVerse, type VerseRecord } from "./parse-source-text.js";
import { selectBoundaries } from "./select-boundaries.js";
import { decodeToPcm16Mono, computePitchTrack } from "./pitch.js";
import { scoreMark2Utterances } from "./mark-2-acoustic-scoring.js";
import { buildMark2Segments, type SegmentDescriptor } from "./mark-2-segments.js";
import { discoverSourcePaths, resolveAndBindSourcePaths } from "./source-catalog.js";
import { alignWithGemini, alignmentKey } from "./gemini-alignment.js";
import { correctionReplacementMap } from "./correction-remap.js";

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
  const paths = discoverSourcePaths(project);
  return { docxPath: paths.docxPath, audioPath: paths.audioPath, audioRelPath: paths.audioRelPath };
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
export const runIngestion: Stage = async (projectId) => runIngestionWithAlignment(projectId);

/** Injectable seam keeps tests offline; production always uses the provider. */
export async function runIngestionWithAlignment(projectId: string, aligner = alignWithGemini) {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `Ingestion failed: no project with id ${projectId}.` };
  }

  let docxPath: string, audioPath: string, audioRelPath: string;
  try {
    ({ docxPath, audioPath, audioRelPath } = resolveAndBindSourcePaths(db, project));
  } catch (err) {
    return { ok: false, reasoning: `Ingestion failed: ${(err as Error).message}` };
  }

  // Replacing source intervals would orphan an approved utterance binding or
  // make a producer's source review point at a deleted row.  The durable
  // orchestrator normally reuses stage 1; this guard also protects a direct
  // stage invocation from silently destroying review evidence.
  const protectedWork = db.prepare(`SELECT
      (SELECT COUNT(*) FROM shot_utterance_bindings b JOIN audio_segments a ON a.id=b.source_audio_segment_id WHERE a.project_id=?) bindings,
      (SELECT COUNT(*) FROM review_notes WHERE project_id=? AND source='human' AND subject_type='audio_segment') source_reviews`).get(projectId, projectId) as { bindings: number; source_reviews: number };
  if (protectedWork.bindings || protectedWork.source_reviews) {
    return { ok: false, reasoning: "Ingestion is held: this chapter has producer-reviewed source segments or approved utterance bindings. Adopt/reconcile a new source version explicitly; no original-reading rows or review evidence were deleted." };
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

  // General corpus alignment is evidence-first. It never supplies speaker
  // identities and never removes an unmatched interval; failures are retained
  // as reviewable evidence while the conservative timing fallback remains.
  const verseRecords = parseSourceTextByVerse(docxPath);
  const narratedTitles = parseNarratedParagraphTitles(docxPath);
  const sourceHash = alignmentKey(audioPath, verseRecords);
  let geminiEvidence: Awaited<ReturnType<typeof alignWithGemini>> | null = null;
  const cached = db.prepare("SELECT result_json,status FROM alignment_evidence WHERE project_id=? AND source_hash=?").get(projectId, sourceHash) as {result_json:string;status:string}|undefined;
  if (cached?.status === "submission_started" || cached?.status === "submission_uncertain") {
    return { ok: false, reasoning: "Ingestion is held: a previous Gemini alignment submission has no durable result. Reconcile its evidence explicitly; HeartWord will not repeat a possibly paid submission." };
  }
  if (cached?.result_json && (cached.status === "provisional" || cached.status === "critical_hold")) geminiEvidence = JSON.parse(cached.result_json);
  else if (process.env.GEMINI_API_KEY) {
    // Record intent before calling a paid provider. A crash or network loss is
    // intentionally a producer hold, never an automatic duplicate request.
    db.prepare("INSERT OR REPLACE INTO alignment_evidence(project_id,source_hash,model,result_json,status,created_at) VALUES (?,?,?,?,?,?)").run(projectId,sourceHash,"gemini-text",JSON.stringify({submittedAt:Date.now()}),"submission_started",Date.now());
    try {
      geminiEvidence = await aligner({ audioPath, verses: verseRecords, titles: narratedTitles, durationMs: totalDurationMs, gaps });
      const critical = geminiEvidence.coverage < .95 || geminiEvidence.segments.some(segment => segment.status === "unresolved");
      db.prepare("INSERT OR REPLACE INTO alignment_evidence(project_id,source_hash,model,result_json,status,created_at) VALUES (?,?,?,?,?,?)").run(projectId,sourceHash,geminiEvidence.model,JSON.stringify(geminiEvidence),critical ? "critical_hold" : "provisional",Date.now());
    } catch (error) {
      db.prepare("INSERT OR REPLACE INTO alignment_evidence(project_id,source_hash,model,result_json,status,created_at) VALUES (?,?,?,?,?,?)").run(projectId,sourceHash,"gemini-text",JSON.stringify({error:(error as Error).message}),"submission_uncertain",Date.now());
      return { ok: false, reasoning: "Ingestion is held: Gemini alignment submission/result is uncertain. No fallback was written and no retry will be sent automatically." };
    }
  } else {
    db.prepare("INSERT OR REPLACE INTO alignment_evidence(project_id,source_hash,model,result_json,status,created_at) VALUES (?,?,?,?,?,?)").run(projectId,sourceHash,"none",JSON.stringify({method:"estimated_timing"}),"estimated_timing",Date.now());
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

  const evidenceSegments = geminiEvidence?.segments ?? [];
  const persisted = evidenceSegments.length > 0 ? evidenceSegments.map(segment => ({
    startMs: segment.startMs, endMs: segment.endMs, verseRef: segment.verseRef ? `${project.book} ${project.chapter}:${segment.verseRef.replace(/^v/, "")}` : null,
    confidence: segment.status === "matched" ? Math.round(segment.score * 100) : null
  })) : verseGroups.map((group, i) => ({ startMs: timings[i]!.startMs, endMs: timings[i]!.endMs, verseRef: group.verseRef, confidence: timings[i]!.confidence }));
  const now = Date.now();
  const segmentIds: string[] = [];
  let lowConfidenceCount = 0;

  db.exec("BEGIN TRANSACTION");
  try {
    const insertSegment = db.prepare(
      `INSERT INTO audio_segments
         (id, project_id, layer, source_path, start_ms, end_ms, speaker_character_id, verse_ref, confidence, created_at)
       VALUES (?, ?, 'original_reading', ?, ?, ?, NULL, ?, ?, ?)`
    );

    const oldSegments=db.prepare("SELECT id,start_ms,end_ms FROM audio_segments WHERE project_id=? AND layer='original_reading'").all(projectId) as Array<{id:string;start_ms:number;end_ms:number}>;
    let corrections:Array<{id:string;audio_segment_id:string}>=[];
    try { corrections=db.prepare("SELECT id,audio_segment_id FROM source_alignment_corrections WHERE project_id=?").all(projectId) as typeof corrections; } catch { /* pre-migration test DB */ }
    let editorialClassifications:Array<{id:string;audio_segment_id:string}>=[];
    try { editorialClassifications=db.prepare("SELECT id,audio_segment_id FROM source_alignment_editorial_classifications WHERE project_id=?").all(projectId) as typeof editorialClassifications; } catch { /* pre-migration test DB */ }
    let boundaryOverrides:Array<{id:string;audio_segment_id:string;original_start_ms:number;original_end_ms:number;start_ms:number;end_ms:number}>=[];
    try { boundaryOverrides=db.prepare("SELECT id,audio_segment_id,original_start_ms,original_end_ms,start_ms,end_ms FROM source_alignment_boundary_overrides WHERE project_id=? ORDER BY created_at").all(projectId) as typeof boundaryOverrides; } catch { /* pre-migration test DB */ }
    // A boundary-overridden segment's row holds its CORRECTED bounds, but a
    // fresh re-ingest regenerates segments at their original automated
    // timings. A correction/classification on such a segment must be matched
    // against those original bounds, not the live corrected ones, or a
    // correction that itself triggered a boundary override can never find
    // its exact replacement (see docs/plans/CURRENT_GOAL.md, 2026-09-18).
    const originalBoundsBySegmentId=new Map(boundaryOverrides.map(override=>[override.audio_segment_id,{start_ms:override.original_start_ms,end_ms:override.original_end_ms}]));
    const oldSegmentsAtOriginalBounds=oldSegments.map(segment=>originalBoundsBySegmentId.get(segment.id) ? {...segment,...originalBoundsBySegmentId.get(segment.id)!} : segment);
    const replacements=new Map<string,string>();
    for (let i = 0; i < persisted.length; i++) {
      const id = randomUUID();
      const timing = persisted[i]!;
      insertSegment.run(id, projectId, audioRelPath, timing.startMs, timing.endMs, timing.verseRef, timing.confidence, now);
      replacements.set(`${timing.startMs}:${timing.endMs}`,id);
      segmentIds.push(id);
      if (timing.confidence !== null && timing.confidence < 80) lowConfidenceCount++;
    }
    for(const remap of correctionReplacementMap(oldSegmentsAtOriginalBounds,replacements,corrections))db.prepare("UPDATE source_alignment_corrections SET audio_segment_id=? WHERE id=?").run(remap.replacement,remap.correctionId);
    for(const remap of correctionReplacementMap(oldSegmentsAtOriginalBounds,replacements,editorialClassifications))db.prepare("UPDATE source_alignment_editorial_classifications SET audio_segment_id=? WHERE id=?").run(remap.replacement,remap.correctionId);
    for(const override of boundaryOverrides){const replacement=replacements.get(`${override.original_start_ms}:${override.original_end_ms}`);if(!replacement)throw new Error(`Cannot safely re-ingest: boundary override ${override.id} has no exactly equivalent replacement interval.`);db.prepare("UPDATE source_alignment_boundary_overrides SET audio_segment_id=? WHERE id=?").run(replacement,override.id);db.prepare("UPDATE audio_segments SET start_ms=?,end_ms=? WHERE id=?").run(override.start_ms,override.end_ms,replacement);}
    const deleteOld=db.prepare("DELETE FROM audio_segments WHERE id=?");
    for(const old of oldSegments) deleteOld.run(old.id);
    db.prepare(`DELETE FROM review_notes WHERE project_id = ? AND subject_type = 'project' AND source = 'qc'`).run(projectId);

    const criticalEvidence = geminiEvidence && (geminiEvidence.coverage < .95 || geminiEvidence.segments.some(segment => segment.status === "unresolved"));
    if (lowConfidenceCount > 0 || criticalEvidence) {
      db.prepare(
        `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
         VALUES (?, ?, 'project', ?, 'qc', ?, 0, ?)`
      ).run(
        randomUUID(),
        projectId,
        projectId,
        `Ingestion produced ${persisted.length} retained audio intervals for ` +
          `${project.book} ${project.chapter}, but ${lowConfidenceCount} of their boundaries are a ` +
          `${criticalEvidence ? `Gemini evidence has uncovered/contradictory source text (coverage ${(geminiEvidence!.coverage * 100).toFixed(1)}%; uncovered verses ${geminiEvidence!.uncoveredVerses.join(",") || "none"}). ` : ""}Timing remains estimated rather than forced alignment and scores ` +
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

  const criticalEvidence = geminiEvidence && (geminiEvidence.coverage < .95 || geminiEvidence.segments.some(segment => segment.status === "unresolved"));
  return {
    ok: !criticalEvidence,
    reasoning:
      criticalEvidence ? `Ingestion retained ${geminiEvidence!.segments.length} source intervals but is held: Gemini evidence covers ${(geminiEvidence!.coverage * 100).toFixed(1)}% of verified text, with uncovered verses ${geminiEvidence!.uncoveredVerses.join(",") || "none"}. Listen to the flagged intervals and reconcile before planning.` :
      `${geminiEvidence ? `Gemini evidence retained ${geminiEvidence.segments.length} intervals with ${(geminiEvidence.coverage * 100).toFixed(1)}% text coverage.` : `Aligned ${verseGroups.length} verse-group intervals with silence-based estimated timing because no Gemini provider is configured.`} ${lowConfidenceCount} intervals require named source review before downstream work.`
  };
}

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
