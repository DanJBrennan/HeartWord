import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { reVoiceAudio } from "../../providers/elevenlabs.js";
import { getAudioDurationMs } from "../ingestion/detect-silences.js";
import type { ProjectRow } from "../ingestion/index.js";
import { extractClip } from "./extract-clip.js";

interface OriginalSegmentRow {
  id: string;
  source_path: string;
  start_ms: number;
  end_ms: number;
  speaker_character_id: string | null;
  verse_ref: string | null;
}

interface VoiceAssignmentRow {
  characterId: string;
  versionId: string;
  voiceProvider: string;
  voiceId: string;
}

interface ReviewedMasterRow {
  originalSegmentId: string;
  sourcePathRel: string | null;
  startMs: number | null;
  endMs: number | null;
  sourceHash: string | null;
  voiceVersionId: string | null;
}

export function reviewedCastMasterIsReusable(input: {
  force: boolean; originalDurationMs: number; castStartMs: number | null;
  castEndMs: number | null; measuredCastDurationMs: number | null;
  mappedSourceHash: string | null; currentSourceHash: string | null;
  mappedVoiceVersionId: string | null; currentVoiceVersionId: string | null;
}): boolean {
  return !input.force && input.castStartMs===0 && input.castEndMs!==null &&
    input.measuredCastDurationMs!==null && input.currentSourceHash!==null &&
    Math.abs(input.castEndMs-input.originalDurationMs)<=100 &&
    Math.abs(input.measuredCastDurationMs-input.castEndMs)<=100 &&
    input.mappedSourceHash===input.currentSourceHash &&
    input.mappedVoiceVersionId===input.currentVoiceVersionId;
}

function slugify(verseRef: string | null, index: number): string {
  const base = verseRef ?? `segment-${index}`;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface VoicingRunResult {
  ok: boolean;
  reasoning: string;
  generated: number;
  reused: number;
  passthrough: number;
  skippedNoVoice: number;
}

/**
 * Composite cast master generation -- the audio half of stage 5 (voice &
 * lip-sync). src/pipeline/voice-lipsync/index.ts still owns the lip-sync
 * half, which needs a scene keyframe from stage 4 (media generation) --
 * not built yet -- so this runs standalone rather than through that
 * stage, and is invoked directly (see POST /api/projects/:id/voicing).
 *
 * Builds PRODUCT_VISION.md's "composite complete cast master" layer:
 * - Narration segments (no speaker) carry through from the original
 *   reading unchanged (still re-encoded to their own clip file, so every
 *   composite_cast_master row has the same one-file-per-segment shape).
 * - A segment whose speaker has an approved ElevenLabs voice gets
 *   re-voiced via speech-to-speech: the real Hatam performance clip goes
 *   in, that character's voice comes out. This is NOT text-to-speech --
 *   there's no Hatam TTS model, so the actual recorded delivery (timing,
 *   emphasis, emotion) carries through into the chosen voice.
 * - A segment whose speaker has NO approved voice yet is carried through
 *   unvoiced (like narration) so one missing voice doesn't block the
 *   whole chapter, and flagged in review_notes so it doesn't go unnoticed.
 *
 * Each re-voiced segment costs real ElevenLabs credits, so a segment
 * whose output file already exists is reused rather than regenerated --
 * pass force=true to regenerate anyway (e.g. after re-casting a voice).
 */
export async function runVoicing(projectId: string, opts: { force?: boolean; sourceSegmentIds?: readonly string[] } = {}): Promise<VoicingRunResult> {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `No project with id ${projectId}.`, generated: 0, reused: 0, passthrough: 0, skippedNoVoice: 0 };
  }

  const scopedIds = opts.sourceSegmentIds ? [...new Set(opts.sourceSegmentIds)] : null;
  if (scopedIds && scopedIds.length === 0) return { ok: false, reasoning: "A scoped voicing run needs at least one approved source interval.", generated: 0, reused: 0, passthrough: 0, skippedNoVoice: 0 };
  const segments = db.prepare(
    `SELECT id, source_path, start_ms, end_ms, speaker_character_id, verse_ref
     FROM audio_segments WHERE project_id = ? AND layer = 'original_reading'${scopedIds ? ` AND id IN (${scopedIds.map(() => "?").join(",")})` : ""} ORDER BY start_ms`
  ).all(project.id, ...(scopedIds ?? [])) as unknown as OriginalSegmentRow[];

  if (segments.length === 0) {
    return {
      ok: false,
      reasoning: "No 'original_reading' audio segments found for this project -- run ingestion first.",
      generated: 0,
      reused: 0,
      passthrough: 0,
      skippedNoVoice: 0
    };
  }

  const voiceRows = db
    .prepare(
      `SELECT c.id AS characterId, cv.id AS versionId, cv.voice_provider AS voiceProvider, cv.voice_id AS voiceId
       FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id
       WHERE cv.status = 'approved' AND cv.voice_provider IS NOT NULL AND cv.voice_id IS NOT NULL`
    )
    .all() as unknown as VoiceAssignmentRow[];
  const voiceByCharacter = new Map(voiceRows.map((v) => [v.characterId, v]));

  const dataDir = getDataDir();
  // A producer-confirmed boundary revision may have an already-reviewed,
  // shortened cast master. Reusing the old provider filename below would
  // resurrect its pre-revision tail on the next stage run. Preserve the
  // current mapped asset instead, or hold before any paid re-voicing.
  const reviewedMasters = db.prepare(`SELECT DISTINCT o.id AS originalSegmentId,
      a.source_path AS sourcePathRel, a.start_ms AS startMs, a.end_ms AS endMs,
      m.source_hash AS sourceHash, m.voice_version_id AS voiceVersionId
    FROM source_alignment_boundary_overrides bo
    JOIN audio_segments o ON o.id=bo.audio_segment_id AND o.project_id=? AND o.layer='original_reading'
    JOIN shot_utterance_bindings ub ON ub.source_audio_segment_id=o.id
    LEFT JOIN composite_audio_source_map m ON m.original_segment_id=o.id
    LEFT JOIN audio_segments a ON a.id=m.composite_segment_id AND a.project_id=o.project_id AND a.layer='composite_cast_master'`)
    .all(project.id) as unknown as ReviewedMasterRow[];
  const reviewedByOriginal = new Map(reviewedMasters.map(row => [row.originalSegmentId, row]));
  for (const seg of segments) {
    const protectedMaster = reviewedByOriginal.get(seg.id);
    if (!protectedMaster) continue;
    const assignment = seg.speaker_character_id ? voiceByCharacter.get(seg.speaker_character_id) : undefined;
    const originalPath = join(dataDir, "assets", seg.source_path);
    const currentHash = existsSync(originalPath)
      ? createHash("sha256").update(readFileSync(originalPath)).digest("hex") : null;
    const masterPath = protectedMaster.sourcePathRel
      ? join(dataDir, "assets", protectedMaster.sourcePathRel) : null;
    if (!reviewedCastMasterIsReusable({
      force: opts.force===true, originalDurationMs: seg.end_ms-seg.start_ms,
      castStartMs: protectedMaster.startMs, castEndMs: protectedMaster.endMs,
      measuredCastDurationMs: masterPath && existsSync(masterPath) ? getAudioDurationMs(masterPath) : null,
      mappedSourceHash: protectedMaster.sourceHash, currentSourceHash: currentHash,
      mappedVoiceVersionId: protectedMaster.voiceVersionId,
      currentVoiceVersionId: assignment?.versionId ?? null
    })) {
      return { ok:false, reasoning:`Producer-reviewed source boundary for ${seg.id} needs an explicit cast-master reconciliation before voicing can replace it.`, generated:0, reused:0, passthrough:0, skippedNoVoice:0 };
    }
  }
  const chapterDir = `${project.book}-${project.chapter}`;
  const outDirRel = join("generated", project.language, chapterDir, "composite_cast_master");
  const outDir = join(dataDir, "assets", outDirRel);
  mkdirSync(outDir, { recursive: true });

  let generated = 0;
  let reused = 0;
  let passthrough = 0;
  let skippedNoVoice = 0;
  const notes: string[] = [];
  const newRows: Array<{
    id: string;
    sourcePathRel: string;
    durationMs: number;
    speakerCharacterId: string | null;
    verseRef: string | null;
    originalSegmentId: string;
    sourceHash: string;
    voiceVersionId: string | null;
  }> = [];

  for (const [i, seg] of segments.entries()) {
    const absSourcePath = join(dataDir, "assets", seg.source_path);
    const slug = `${String(i + 1).padStart(2, "0")}-${slugify(seg.verse_ref, i)}`;
    const assignment = seg.speaker_character_id ? voiceByCharacter.get(seg.speaker_character_id) : undefined;

    const protectedMaster = reviewedByOriginal.get(seg.id);
    if (protectedMaster?.sourcePathRel && protectedMaster.endMs !== null && protectedMaster.sourceHash) {
      newRows.push({
        id: randomUUID(), sourcePathRel: protectedMaster.sourcePathRel,
        durationMs: protectedMaster.endMs, speakerCharacterId: seg.speaker_character_id,
        verseRef: seg.verse_ref, originalSegmentId: seg.id,
        sourceHash: protectedMaster.sourceHash, voiceVersionId: protectedMaster.voiceVersionId
      });
      reused++;
      continue;
    }

    const outFileName = assignment ? `${slug}-${assignment.voiceProvider}.mp3` : `${slug}-passthrough.mp3`;
    const outPath = join(outDir, outFileName);

    if (existsSync(outPath) && !opts.force) {
      reused++;
    } else if (assignment) {
      const tmpClipPath = join(outDir, `${slug}-source-clip.tmp.mp3`);
      extractClip(absSourcePath, seg.start_ms, seg.end_ms, tmpClipPath);
      const { audioBuffer } = await reVoiceAudio(assignment.voiceId, tmpClipPath);
      writeFileSync(outPath, audioBuffer);
      rmSync(tmpClipPath, { force: true });
      generated++;
    } else {
      extractClip(absSourcePath, seg.start_ms, seg.end_ms, outPath);
      passthrough++;
    }

    if (!assignment && seg.speaker_character_id) {
      skippedNoVoice++;
      notes.push(
        `Segment ${i + 1} (${seg.verse_ref ?? "unknown verse"}) has a speaker but no approved voice yet -- carried through unvoiced.`
      );
    }

    const durationMs = getAudioDurationMs(outPath);
    newRows.push({
      id: randomUUID(),
      sourcePathRel: join(outDirRel, outFileName),
      durationMs,
      speakerCharacterId: seg.speaker_character_id,
      verseRef: seg.verse_ref
      ,originalSegmentId:seg.id, sourceHash:createHash("sha256").update(readFileSync(absSourcePath)).digest("hex"), voiceVersionId:assignment?.versionId ?? null
    });
  }

  const now = Date.now();
  db.exec("BEGIN TRANSACTION");
  try {
    if (scopedIds) {
      const prior = db.prepare(`SELECT composite_segment_id FROM composite_audio_source_map WHERE original_segment_id IN (${scopedIds.map(() => "?").join(",")})`).all(...scopedIds) as Array<{ composite_segment_id: string }>;
      db.prepare(`DELETE FROM composite_audio_source_map WHERE original_segment_id IN (${scopedIds.map(() => "?").join(",")})`).run(...scopedIds);
      if (prior.length) db.prepare(`DELETE FROM audio_segments WHERE id IN (${prior.map(() => "?").join(",")})`).run(...prior.map(row => row.composite_segment_id));
    } else {
      db.prepare(`DELETE FROM composite_audio_source_map WHERE composite_segment_id IN (SELECT id FROM audio_segments WHERE project_id=? AND layer='composite_cast_master')`).run(project.id);
      db.prepare(`DELETE FROM audio_segments WHERE project_id = ? AND layer = 'composite_cast_master'`).run(project.id);
    }
    const insert = db.prepare(
      `INSERT INTO audio_segments
         (id, project_id, layer, source_path, start_ms, end_ms, speaker_character_id, verse_ref, confidence, created_at)
       VALUES (?, ?, 'composite_cast_master', ?, 0, ?, ?, ?, NULL, ?)`
    );
    for (const row of newRows) {
      insert.run(row.id, project.id, row.sourcePathRel, row.durationMs, row.speakerCharacterId, row.verseRef, now);
      db.prepare(`INSERT INTO composite_audio_source_map (composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at) VALUES (?,?,?,?,?)`).run(row.id,row.originalSegmentId,row.sourceHash,row.voiceVersionId,now);
    }

    if (!scopedIds) db.prepare(
      `DELETE FROM review_notes WHERE project_id = ? AND subject_type = 'project' AND source = 'qc' AND note LIKE 'Composite cast master:%'`
    ).run(project.id);
    if (notes.length > 0) {
      db.prepare(
        `INSERT INTO review_notes (id, project_id, subject_type, subject_id, source, note, resolved, created_at)
         VALUES (?, ?, 'project', ?, 'qc', ?, 0, ?)`
      ).run(randomUUID(), project.id, project.id, `Composite cast master: ${notes.join(" ")}`, now);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    return {
      ok: false,
      reasoning: `Failed writing composite cast master results: ${(err as Error).message}`,
      generated,
      reused,
      passthrough,
      skippedNoVoice
    };
  }

  return {
    ok: true,
    reasoning:
      `Built the composite cast master for ${project.book} ${project.chapter}: ${newRows.length} segments ` +
      `(${generated} newly re-voiced via ElevenLabs, ${reused} reused from a prior run, ${passthrough} narration ` +
      `passthrough clips${skippedNoVoice > 0 ? `, ${skippedNoVoice} carried through unvoiced pending casting` : ""}).`,
    generated,
    reused,
    passthrough,
    skippedNoVoice
  };
}
