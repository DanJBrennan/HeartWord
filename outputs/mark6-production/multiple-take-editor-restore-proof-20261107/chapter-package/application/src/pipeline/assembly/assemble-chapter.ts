/**
 * Stage 6, v1 scope: concatenates every shot's own already-assembled clip
 * (assemble-covered-shot.ts / assemble-single-shot.ts's output, one file
 * per shot under generated/assembled/<shotId>.mp4) into one continuous
 * chapter video, in scene/shot order.
 *
 * Deliberately HARD CUTS ONLY -- see docs/design/timeline.md and
 * PRODUCT_VISION.md's Three-Layer Audio Architecture. The full vision
 * has a `spaced_production` audio layer where a producer places and
 * approves deliberate editorial gaps between shots (a beat of silence,
 * an ambience bed, room for a scene transition); no rows in that layer
 * exist yet, and choosing where those gaps belong is an editorial
 * decision this stage can't make on its own.
 *
 * KNOWN GAP, not an accepted limitation -- see docs/design/timeline.md's
 * "narrator must never go silent" requirement: this stage assumes every
 * shot's own clip already carries the audio it needs, but
 * assemble-single-shot.ts only muxes real dialogue for needs_lip_sync
 * shots -- a shot with no on-camera speaker comes out of that stage
 * silent, and this stage has no mechanism (yet) to lay the real
 * `original_reading` narration underneath it instead. That means whole
 * narration-only passages of the real recording currently go unheard.
 * Confirmed live on Mark 2: the source recording runs 446s but shots
 * with no dialogue only ever got ~4-8s of silent AI-generated video each,
 * regardless of how long the narrator actually spends on that beat.
 * Fixing this for real means: (1) real per-shot/per-group duration
 * targets sized to the real narration span they cover (see the coverage
 * table this doc's caller should build), and (2) muxing the narration
 * audio continuously under a whole covering group rather than per-shot.
 * A worked example of doing this by hand for one beat lives in
 * docs/production/PARALYTIC_EXIT_SEQUENCE_HANDOFF.md. What this stage
 * DOES do correctly today: every DIALOGUE shot's own clip already
 * carries its own real audio, trimmed to its own real duration -- this
 * stage only concatenates those already-correct pieces back to back,
 * adding nothing and removing nothing between them.
 *
 * A real per-shot obstacle this had to solve: a silent shot's own
 * assembled clip has NO audio stream at all (assemble-single-shot.ts's
 * -an trim for a shot with no dialogue), while a dialogue shot's clip
 * has one real AAC track -- ffmpeg's concat demuxer requires every input
 * segment to carry the same stream layout, so silently mixing
 * video-only and video+audio clips either fails outright or desyncs.
 * Every clip is normalized to carry a real (possibly silent) audio
 * track before concatenation, confirmed via ffprobe before ffmpeg is
 * ever asked to touch it, rather than assumed from each assembly
 * module's own behavior.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { assertNoRenderedFlashes } from "../qc/flash-detection.js";

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;
const AUDIO_SAMPLE_RATE = 44100;

interface ShotClipRow {
  shot_id: string;
  scene_sequence: number;
  shot_sequence: number;
  result_asset_path: string;
  timeline_start_ms: number;
  timeline_end_ms: number;
}

function hasAudioStream(absPath: string): boolean {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", absPath], {
    encoding: "utf-8"
  });
  return out.trim().length > 0;
}

/** Re-encodes one shot's clip to a guaranteed-uniform format (resolution/
 *  fps/audio presence) so the concat demuxer can join it to any other
 *  shot's clip regardless of what that shot's own assembly step produced. */
function normalizeForConcat(sourceAbsPath: string, durationMs: number, outPath: string): void {
  const durationSec = (durationMs / 1000).toFixed(3);
  if (hasAudioStream(sourceAbsPath)) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        sourceAbsPath,
        "-t",
        durationSec,
        "-vf",
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
        "-ar",
        String(AUDIO_SAMPLE_RATE),
        "-ac",
        "2",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        outPath
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
  } else {
    // No real audio -- lay in explicit digital silence rather than
    // leaving the stream absent, so every concatenated segment has the
    // same track layout.
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        sourceAbsPath,
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`,
        "-t",
        durationSec,
        "-vf",
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-shortest",
        outPath
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
  }
}

function concatClips(clipPaths: string[], outPath: string, tmpDir: string): void {
  const listPath = join(tmpDir, "concat-list.txt");
  const listContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, listContent);
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath], {
    stdio: ["ignore", "ignore", "pipe"]
  });
}

export interface AssembleChapterResult {
  projectId: string;
  assembledVideoPath: string;
  totalDurationMs: number;
  shotCount: number;
}

export function assembleChapter(db: DatabaseSync, projectId: string): AssembleChapterResult {
  const dataDir = getDataDir();

  // A shot can carry more than one 'assemble_shot' attempt (e.g. Scene 1
  // Shot 8, re-assembled after its master/cutaway beats were redone) --
  // this project's own established convention is to keep every prior
  // attempt as history rather than overwrite it (see assemble-single-shot.ts
  // and assemble-covered-shot.ts's own header comments), so this must
  // pick only the LATEST accepted attempt per shot, not join in all of
  // them (confirmed necessary live: a naive join returned 30 clip rows
  // for this project's real 28 shots).
  const shotClips = db
    .prepare(
      `SELECT s.id AS shot_id, sc.sequence AS scene_sequence, s.sequence AS shot_sequence,
              ga.result_asset_path, cl.timeline_start_ms, cl.timeline_end_ms
       FROM shots s
       JOIN scenes sc ON sc.id = s.scene_id
       JOIN clips cl ON cl.shot_id = s.id
       JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
       WHERE sc.project_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
         AND ga.created_at = (
           SELECT MAX(ga2.created_at)
           FROM clips cl2
           JOIN generation_attempts ga2 ON ga2.id = cl2.generation_attempt_id
           WHERE cl2.shot_id = s.id AND ga2.operation = 'assemble_shot' AND ga2.status = 'accepted'
         )
       ORDER BY sc.sequence, s.sequence`
    )
    .all(projectId) as unknown as ShotClipRow[];

  if (shotClips.length === 0) {
    throw new Error(`No assembled shot clips found for project ${projectId} -- assemble every shot first.`);
  }

  const shotCountCheck = db.prepare(`SELECT COUNT(*) as n FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE sc.project_id = ?`).get(projectId) as {
    n: number;
  };
  if (shotClips.length !== shotCountCheck.n) {
    throw new Error(
      `Project ${projectId} has ${shotCountCheck.n} shot(s) but only ${shotClips.length} have an assembled clip -- ` +
        `assemble every remaining shot before running the chapter assembly.`
    );
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-chapter-"));
  try {
    const normalizedPaths: string[] = [];
    for (const clip of shotClips) {
      const durationMs = clip.timeline_end_ms - clip.timeline_start_ms;
      const sourcePath = join(dataDir, "assets", clip.result_asset_path);
      const normalizedPath = join(tmpDir, `${clip.shot_id}.mp4`);
      normalizeForConcat(sourcePath, durationMs, normalizedPath);
      normalizedPaths.push(normalizedPath);
    }

    const id = randomUUID();
    const relPath = join("generated", "chapter", `${projectId}-${id}.mp4`);
    const outPath = join(dataDir, "assets", relPath);
    mkdirSync(join(dataDir, "assets", "generated", "chapter"), { recursive: true });
    concatClips(normalizedPaths, outPath, tmpDir);
    assertNoRenderedFlashes(outPath, TARGET_FPS);

    const totalDurationMs = shotClips.reduce((sum, c) => sum + (c.timeline_end_ms - c.timeline_start_ms), 0);

    const now = Date.now();
    db.prepare(
      `INSERT INTO chapter_renders (id, project_id, result_asset_path, total_duration_ms, shot_count, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, relPath, totalDurationMs, shotClips.length, now);

    let cursor = 0;
    const timeline = shotClips.map(clip => {
      const startMs = cursor;
      cursor += clip.timeline_end_ms - clip.timeline_start_ms;
      return { shotId: clip.shot_id, startMs, endMs: cursor };
    });
    db.prepare("INSERT INTO chapter_render_manifests (render_id, timeline_json, source_audio_json) VALUES (?, ?, ?)")
      .run(id, JSON.stringify(timeline), JSON.stringify({ mode: "per_shot_audio", warning: "Narration coverage must be verified by chapter review." }));

    return { projectId, assembledVideoPath: relPath, totalDurationMs, shotCount: shotClips.length };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
