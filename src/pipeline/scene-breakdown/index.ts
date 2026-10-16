import { randomUUID } from "node:crypto";
import { getDb } from "../../db/client.js";
import type { Stage } from "../types.js";
import { resolveSourcePaths, type ProjectRow } from "../ingestion/index.js";
import { parseSourceHeadings, parseSourceTextByVerse } from "../ingestion/parse-source-text.js";
import { incompleteSpeakerAttributionHold, missingSpeakerAttributionHold } from "../ingestion/speaker-attribution-gate.js";
import { resolveAndBindSourcePaths } from "../ingestion/source-catalog.js";
import { buildScenesFromHeadings, type SegmentInfo } from "./build-scenes.js";
import { speechCoverageSegments } from "../ingestion/continuous-speech.js";

/**
 * Stage 2: Scene breakdown -- groups the chapter's stage-1 audio segments
 * into scenes using the source text's OWN published pericope headings
 * (parseSourceHeadings) as the scene boundaries, rather than inventing a
 * narrative structure -- see NON_GOALS.md ("Scene/action decisions fill
 * in *how* the text is shown, not *what* the text says") and
 * buildScenesFromHeadings's own header for the reasoning.
 *
 * This stage owns only the `scenes` table (sequence, verse range, and a
 * text-grounded summary). Casting/direction -- `shots`, `shot_characters`,
 * and `scenes.reasoning` (the "casting/direction reasoning log" per its
 * schema comment) -- is stage 3's job, not this one's. See
 * docs/ARCHITECTURE.md pipeline stage 2.
 *
 * Deliberately chapter-agnostic (unlike stage 1's Mark-2-specific quote-
 * aware path): parseSourceHeadings reads whatever pericope headings and
 * parallel-reference lines the source .docx already has, so this same
 * code runs for any chapter that follows that publishing convention. A
 * chapter whose source text has no such headings fails clearly rather
 * than silently inventing scene divisions.
 */
export const runSceneBreakdown: Stage = projectId => observeWork(projectId, "scene_breakdown", () => runSceneBreakdownImpl(projectId));
const runSceneBreakdownImpl: Stage = async (projectId) => {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `Scene breakdown failed: no project with id ${projectId}.` };
  }

  let docxPath: string;
  try {
    ({ docxPath } = resolveSourcePaths(project));
  } catch (err) {
    return { ok: false, reasoning: `Scene breakdown failed: ${(err as Error).message}` };
  }

  const headings = parseSourceHeadings(docxPath);
  if (headings.length === 0) {
    return {
      ok: false,
      reasoning:
        `Scene breakdown failed: found 0 pericope headings in ${docxPath}. This stage builds scenes from the ` +
        `source text's own published section headings (see parseSourceHeadings in parse-source-text.ts) rather ` +
        `than inventing a narrative breakdown -- a chapter whose source .docx doesn't carry that structure needs ` +
        `a different scene-boundary strategy, which isn't built yet.`
    };
  }

  const verses = parseSourceTextByVerse(docxPath);
  if (verses.length === 0) {
    return { ok: false, reasoning: `Scene breakdown failed: parsed 0 verses from ${docxPath}.` };
  }
  const lastVerse = Math.max(...verses.map((v) => v.verse));

  const segmentRows = db
    .prepare(
      `SELECT a.verse_ref AS verseRef, a.start_ms AS startMs, a.end_ms AS endMs, c.name AS speakerName
       FROM audio_segments a
       LEFT JOIN characters c ON c.id = a.speaker_character_id
       WHERE a.project_id = ? AND a.layer = 'original_reading'
       ORDER BY a.start_ms`
    )
    .all(project.id) as Array<{
      verseRef: string | null;
      startMs: number;
      endMs: number;
      speakerName: string | null;
    }>;

  if (segmentRows.length === 0) {
    return {
      ok: false,
      reasoning:
        `Scene breakdown failed: no 'original_reading' audio segments found for this project. Run stage 1 ` +
        `(ingestion) first -- scene breakdown groups stage 1's verse-timed segments into scenes and has ` +
        `nothing to group yet.`
    };
  }

  // This runs immediately after source alignment and before any scene or
  // shot can be created. Quotation marks detect a missing handoff; they never
  // guess a speaker or turn narration into dialogue.
  let referenceVerses: ReturnType<typeof parseSourceTextByVerse> = verses;
  try {
    const parsed = parseSourceTextByVerse(resolveAndBindSourcePaths(db, project).referencePath);
    if (parsed.length) referenceVerses = parsed;
  } catch { /* Minimal source-only fixtures retain the existing source-text fallback. */ }
  let attributionHold: string | null;
  try { attributionHold = incompleteSpeakerAttributionHold(referenceVerses, speechCoverageSegments(db, project.id)) ?? missingSpeakerAttributionHold(verses, segmentRows.filter(segment => segment.speakerName !== null).length); }
  catch (error) { return { ok: false, reasoning: (error as Error).message }; }
  if (attributionHold) return { ok: false, reasoning: attributionHold };
  const coverage = speechCoverageSegments(db, project.id);
  for (const segment of segmentRows) {
    const scope = coverage.find(c => c.startMs === segment.startMs && c.endMs === segment.endMs);
    if (scope) segment.verseRef = scope.verseRef;
  }

  const segments: SegmentInfo[] = segmentRows
    .filter((r): r is { verseRef: string; startMs: number; endMs: number; speakerName: string | null } => r.verseRef !== null)
    .map((r) => ({ verseRef: r.verseRef, speakerName: r.speakerName,
      continuousSpeech: !!coverage.find(c => c.startMs === r.startMs && c.endMs === r.endMs)?.speechRunId }));

  const { scenes, boundaryStraddlingWarnings } = buildScenesFromHeadings(
    headings,
    lastVerse,
    project.book,
    project.chapter,
    segments
  );

  const now = Date.now();
  const SCENE_BREAKDOWN_NOTE_PREFIX = "Scene breakdown:";

  // A replacement scene plan cascades into shots, candidates, accepted clips
  // and human review.  Never use an idempotent planner shortcut to erase
  // those producer decisions; a changed source must be adopted explicitly.
  const protectedWork = db.prepare(`SELECT
    (SELECT COUNT(*) FROM clips c JOIN shots sh ON sh.id=c.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=?) clips,
    (SELECT COUNT(*) FROM review_notes WHERE project_id=? AND source='human' AND subject_type IN ('shot','clip')) reviews`).get(project.id, project.id) as { clips:number; reviews:number };
  if (protectedWork.clips || protectedWork.reviews) return { ok:false, reasoning:"Scene breakdown is held: this chapter has accepted timeline clips or producer shot/clip review. No scenes, shots, candidates, or review evidence were deleted; explicitly adopt a replacement plan first." };

  db.exec("BEGIN TRANSACTION");
  try {
    // Idempotent re-run: replace this project's previous scenes and this
    // stage's own review notes, rather than appending duplicates. Scoped
    // by the note-text prefix so this doesn't touch stage 1's unrelated
    // 'project'-level qc notes.
    db.prepare(`DELETE FROM scenes WHERE project_id = ?`).run(project.id);
    db.prepare(
      `DELETE FROM review_notes
       WHERE project_id = ? AND subject_type = 'project' AND source = 'qc' AND note LIKE ? || '%'`
    ).run(project.id, SCENE_BREAKDOWN_NOTE_PREFIX);

    const insertScene = db.prepare(
      `INSERT INTO scenes (id, project_id, sequence, verse_start, verse_end, summary, reasoning, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
    );
    for (const scene of scenes) {
      insertScene.run(
        randomUUID(),
        project.id,
        scene.sequence,
        scene.verseStartRef,
        scene.verseEndRef,
        scene.summary,
        now
      );
    }

    if (boundaryStraddlingWarnings.length > 0) {
      db.prepare(
        `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
         VALUES (?, ?, 'project', ?, 'qc', ?, 0, ?)`
      ).run(
        randomUUID(),
        project.id,
        project.id,
        `${SCENE_BREAKDOWN_NOTE_PREFIX} ${boundaryStraddlingWarnings.length} audio segment(s) straddle a scene ` +
          `boundary and were counted toward only one side -- a human should confirm the split is acceptable. ` +
          boundaryStraddlingWarnings.join(" "),
        now
      );
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return { ok: false, reasoning: `Scene breakdown failed writing results: ${(err as Error).message}` };
  }

  return {
    ok: true,
    reasoning:
      `Built ${scenes.length} scenes for ${project.book} ${project.chapter} from the source text's own pericope ` +
      `headings (${scenes.map((s) => `"${s.verseStartRef}-${s.verseEndRef}"`).join(", ")}), grouping ` +
      `${segments.length} stage-1 audio segments by verse range. ` +
      (boundaryStraddlingWarnings.length > 0
        ? `${boundaryStraddlingWarnings.length} segment(s) straddled a scene boundary and were flagged in ` +
          `review_notes for human confirmation. `
        : "No segment straddled a scene boundary. ") +
      `Scene summaries state only what's already established by the source text and stage 1's speaker ` +
      `attribution (heading text, synoptic parallel reference, verse range, speaking characters) -- no staging, ` +
      `camera, or action content, which is stage 3's (casting & direction's) job.`
  };
};
import { observeWork } from "../observed-work.js";
