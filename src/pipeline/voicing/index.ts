import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../../db/client.js";
import { reVoiceAudio } from "../../providers/elevenlabs.js";
import { getAudioDurationMs } from "../ingestion/detect-silences.js";
import type { ProjectRow } from "../ingestion/index.js";
import { extractClip } from "./extract-clip.js";
import { readConfirmedSpeechRuns } from "../ingestion/continuous-speech.js";

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
  return observeWork(projectId, "voice_lipsync", () => runVoicingImpl(projectId, opts));
}
async function runVoicingImpl(projectId: string, opts: { force?: boolean; sourceSegmentIds?: readonly string[] }): Promise<VoicingRunResult> {
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
  let speechRuns: ReturnType<typeof readConfirmedSpeechRuns>;
  try { speechRuns = readConfirmedSpeechRuns(db, projectId); }
  catch (error) { return { ok: false, reasoning: (error as Error).message, generated: 0, reused: 0, passthrough: 0, skippedNoVoice: 0 }; }
  for (const run of speechRuns) {
    if (run.members.some(m => segments.some(s => s.id === m.id)) && !run.members.every(m => segments.some(s => s.id === m.id))) {
      return { ok: false, reasoning: `Scoped voicing must retain the complete confirmed speech ${run.id}; verse metadata is not a soundtrack boundary.`, generated: 0, reused: 0, passthrough: 0, skippedNoVoice: 0 };
    }
    if (run.members.some(m => segments.some(s => s.id === m.id)) && !opts.force) {
      const mapped = run.members.filter(m => !!db.prepare("SELECT composite_segment_id FROM composite_audio_source_map WHERE original_segment_id=?").get(m.id));
      if (mapped.length > 0 && mapped.length < run.members.length) return { ok: false, reasoning: `Confirmed speech ${run.id} has a partial retained cast map. Restore/reconcile that map before new voicing; accepted audio was preserved and no request was sent.`, generated: 0, reused: 0, passthrough: 0, skippedNoVoice: 0 };
    }
  }
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
    castStartMs?: number;
  }> = [];

  const completed = new Set<string>();
  for (const [i, seg] of segments.entries()) {
    if (completed.has(seg.id)) continue;
    const absSourcePath = join(dataDir, "assets", seg.source_path);
    const sourceHash = createHash("sha256").update(readFileSync(absSourcePath)).digest("hex");
    const slug = `${seg.id}-${slugify(seg.verse_ref, i)}-${randomUUID()}`;
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

    const mapped = db.prepare(`SELECT a.source_path AS path, a.start_ms AS startMs, a.end_ms AS endMs, m.source_hash AS sourceHash,
      m.voice_version_id AS voiceVersionId FROM composite_audio_source_map m
      JOIN audio_segments a ON a.id=m.composite_segment_id WHERE m.original_segment_id=? AND a.project_id=?`)
      .all(seg.id, project.id) as Array<{path:string;startMs:number;endMs:number;sourceHash:string;voiceVersionId:string|null}>;
    const reusable = !opts.force && mapped.length === 1 && mapped[0]!.sourceHash === sourceHash &&
      mapped[0]!.voiceVersionId === (assignment?.versionId ?? null) ? mapped[0] : undefined;
    if (reusable) {
      const retainedPath = join(dataDir, "assets", reusable.path);
      if (!existsSync(retainedPath)) throw new Error(`Missing retained cast master for ${seg.id}: ${reusable.path}. Restore the asset before voicing; no automatic paid regeneration.`);
      if (existsSync(`${retainedPath}.json`)) {
        const binding = JSON.parse(readFileSync(`${retainedPath}.json`, "utf8")) as { format?: string; sourceStartMs?: number; sourceEndMs?: number; members?: Array<{ start_ms: number; end_ms: number }> };
        if (binding.format === "heartword-cast-master" && !(binding.members?.some(m => m.start_ms === seg.start_ms && m.end_ms === seg.end_ms) ?? (binding.sourceStartMs === seg.start_ms && binding.sourceEndMs === seg.end_ms))) throw new Error(`Retained cast master for ${seg.id} belongs to different source bounds. Reconcile the saved source mapping before replacing it.`);
      }
      const measured = getAudioDurationMs(retainedPath);
      if (measured < reusable.endMs - 100 || Math.abs(reusable.endMs - reusable.startMs - (seg.end_ms - seg.start_ms)) > 100) throw new Error(`Retained cast master for ${seg.id} no longer preserves its source duration.`);
      newRows.push({ id: randomUUID(), sourcePathRel: reusable.path, castStartMs: reusable.startMs, durationMs: reusable.endMs - reusable.startMs, speakerCharacterId: seg.speaker_character_id, verseRef: seg.verse_ref, originalSegmentId: seg.id, sourceHash, voiceVersionId: assignment?.versionId ?? null });
      reused++; continue;
    }
    const run = speechRuns.find(r => r.members[0]?.id === seg.id && r.members.length > 1);
    // Never replace accepted per-interval audio just to consolidate a run.
    // New complete runs use one provider/extraction call and shared offsets;
    // existing assets keep their exact mappings and remain reviewable.
    const canBuildRun = run && run.members.every(m => !reviewedByOriginal.has(m.id) && (opts.force || !db.prepare("SELECT composite_segment_id FROM composite_audio_source_map WHERE original_segment_id=?").get(m.id)));
    if (canBuildRun) {
      const outFileName = `${run.id}-${randomUUID()}-${assignment?.voiceProvider ?? "passthrough"}.mp3`;
      const outPath = join(outDir, outFileName);
      let requestSettings: unknown = null;
      if (assignment) {
        const tmp = join(outDir, `${randomUUID()}-source.tmp.mp3`);
        extractClip(absSourcePath, run.startMs, run.endMs, tmp);
        const result = await reVoiceAudio(assignment.voiceId, tmp);
        requestSettings = result.requestSettings ?? null;
        writeFileSync(outPath, result.audioBuffer, { flag: "wx" });
        rmSync(tmp, { force: true }); generated++;
      } else { extractClip(absSourcePath, run.startMs, run.endMs, outPath); passthrough++; }
      const durationMs = getAudioDurationMs(outPath);
      writeFileSync(`${outPath}.json`, JSON.stringify({ format: "heartword-cast-master", version: 1,
        speechRunId: run.id, members: run.members, sourcePath: seg.source_path, sourceHash,
        sourceStartMs: run.startMs, sourceEndMs: run.endMs, verseRef: run.verseRef,
        internalVerseTiming: run.internalVerseTiming, voiceVersionId: assignment?.versionId ?? null,
        provider: assignment?.voiceProvider ?? "local", requestSettings, durationMs,
        usage: assignment ? "not_reported" : "local_extraction", directCostUsd: assignment ? null : 0 }, null, 2), { flag: "wx" });
      if (Math.abs(durationMs - (run.endMs - run.startMs)) > 100) throw new Error(`Continuous cast take ${run.id} does not match the unchanged source speed/duration; retain it for review before retrying.`);
      for (const member of run.members) {
        completed.add(member.id);
        newRows.push({ id: randomUUID(), sourcePathRel: join(outDirRel, outFileName), castStartMs: member.start_ms - run.startMs,
          durationMs: member.end_ms - member.start_ms, speakerCharacterId: run.characterId, verseRef: member.verse_ref,
          originalSegmentId: member.id, sourceHash, voiceVersionId: assignment?.versionId ?? null });
      }
      if (!assignment && run.characterId) { skippedNoVoice += run.members.length; notes.push(`Continuous speech ${run.verseRef} has no approved voice; retained source performance pending casting.`); }
      continue;
    }
    const outFileName = assignment ? `${slug}-${assignment.voiceProvider}.mp3` : `${slug}-passthrough.mp3`;
    const outPath = join(outDir, outFileName);
    let requestSettings: unknown = null;

    if (assignment) {
      const tmpClipPath = join(outDir, `${slug}-source-clip.tmp.mp3`);
      extractClip(absSourcePath, seg.start_ms, seg.end_ms, tmpClipPath);
      const result = await reVoiceAudio(assignment.voiceId, tmpClipPath);
      requestSettings = result.requestSettings ?? null;
      writeFileSync(outPath, result.audioBuffer, { flag: "wx" });
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
    writeFileSync(`${outPath}.json`, JSON.stringify({
      format: "heartword-cast-master", version: 1, originalSegmentId: seg.id,
      sourcePath: seg.source_path, sourceHash, sourceStartMs: seg.start_ms, sourceEndMs: seg.end_ms,
      voiceVersionId: assignment?.versionId ?? null, voiceId: assignment?.voiceId ?? null,
      provider: assignment?.voiceProvider ?? "local", requestSettings, durationMs,
      usage: assignment ? "not_reported" : "local_extraction", directCostUsd: assignment ? null : 0
    }, null, 2), { flag: "wx" });
    newRows.push({
      id: randomUUID(),
      sourcePathRel: join(outDirRel, outFileName),
      durationMs,
      speakerCharacterId: seg.speaker_character_id,
      verseRef: seg.verse_ref
      ,originalSegmentId:seg.id, sourceHash, voiceVersionId:assignment?.versionId ?? null
    });
  }

  const now = Date.now();
  db.exec("BEGIN TRANSACTION");
  try {
    // Current projections are replaced below; preserve every previous row and
    // exact mapping before that change, along with the still-retained files.
    const previousSegments = db.prepare("SELECT * FROM audio_segments WHERE project_id=? AND layer='composite_cast_master'").all(project.id);
    const previousMappings = db.prepare("SELECT m.* FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id WHERE a.project_id=?").all(project.id);
    const previousReviewNotes = db.prepare("SELECT * FROM review_notes WHERE project_id=? AND subject_type='project' AND source='qc' AND note LIKE 'Composite cast master:%'").all(project.id);
    if (previousSegments.length) {
      const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(project.id)!.n);
      db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'supersede_cast_master',?,?,?)")
        .run(randomUUID(), project.id, sequence, JSON.stringify({ sourceSegmentIds: scopedIds, previousSegments, previousMappings, previousReviewNotes, originalSegments: segments, nextSegments: newRows }), `cast-master:${randomUUID()}`, now);
    }
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
       VALUES (?, ?, 'composite_cast_master', ?, ?, ?, ?, ?, NULL, ?)`
    );
    for (const row of newRows) {
      insert.run(row.id, project.id, row.sourcePathRel, row.castStartMs ?? 0, (row.castStartMs ?? 0) + row.durationMs, row.speakerCharacterId, row.verseRef, now);
      db.prepare(`INSERT INTO composite_audio_source_map (composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at) VALUES (?,?,?,?,?)`).run(row.id,row.originalSegmentId,row.sourceHash,row.voiceVersionId,now);
    }

    if (!scopedIds) db.prepare(
      `UPDATE review_notes SET resolved=1 WHERE project_id = ? AND subject_type = 'project' AND source = 'qc' AND note LIKE 'Composite cast master:%'`
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
import { observeWork } from "../observed-work.js";
