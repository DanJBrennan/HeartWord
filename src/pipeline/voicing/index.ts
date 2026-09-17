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
export async function runVoicing(projectId: string, opts: { force?: boolean } = {}): Promise<VoicingRunResult> {
  const db = getDb();
  const project = db.prepare(`SELECT id, language, book, chapter FROM projects WHERE id = ?`).get(projectId) as
    | ProjectRow
    | undefined;

  if (!project) {
    return { ok: false, reasoning: `No project with id ${projectId}.`, generated: 0, reused: 0, passthrough: 0, skippedNoVoice: 0 };
  }

  const segments = db
    .prepare(
      `SELECT id, source_path, start_ms, end_ms, speaker_character_id, verse_ref
       FROM audio_segments WHERE project_id = ? AND layer = 'original_reading' ORDER BY start_ms`
    )
    .all(project.id) as unknown as OriginalSegmentRow[];

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
    db.prepare(`DELETE FROM composite_audio_source_map WHERE composite_segment_id IN (SELECT id FROM audio_segments WHERE project_id=? AND layer='composite_cast_master')`).run(project.id);
    db.prepare(`DELETE FROM audio_segments WHERE project_id = ? AND layer = 'composite_cast_master'`).run(project.id);
    const insert = db.prepare(
      `INSERT INTO audio_segments
         (id, project_id, layer, source_path, start_ms, end_ms, speaker_character_id, verse_ref, confidence, created_at)
       VALUES (?, ?, 'composite_cast_master', ?, 0, ?, ?, ?, NULL, ?)`
    );
    for (const row of newRows) {
      insert.run(row.id, project.id, row.sourcePathRel, row.durationMs, row.speakerCharacterId, row.verseRef, now);
      db.prepare(`INSERT INTO composite_audio_source_map (composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at) VALUES (?,?,?,?,?)`).run(row.id,row.originalSegmentId,row.sourceHash,row.voiceVersionId,now);
    }

    db.prepare(
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
