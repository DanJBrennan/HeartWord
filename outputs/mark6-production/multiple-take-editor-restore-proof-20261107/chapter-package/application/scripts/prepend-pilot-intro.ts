/**
 * One-off editorial addition per Dan's request: prepend the real first
 * two clips of the earlier Mark 2:1-12 pilot production to the front of
 * the current 28-shot HeartWord chapter render.
 *
 * These are Dan's own native-resolution source files -- not the BVET
 * animatic's captioned placeholder stills (confirmed static images with
 * a permanent "CANDIDATE FRAME - NOT APPROVED" overlay baked in), and
 * not a re-encoded YouTube download of the published cut either (an
 * earlier attempt pulled a 640x360 copy from
 * https://www.youtube.com/watch?v=lBiO_og_XNU before Dan pointed
 * directly at these true source files):
 *   - Shot_000 - Ancient fishing (dawn wide over Capernaum and the lake)
 *   - Shot_000B - People in [the village courtyard/compound]
 * Both are native 1280x720 -- matching the chapter's own target
 * resolution exactly, so no upscaling is needed (unlike the discarded
 * YouTube-download attempt). Both carry their own real ambience audio
 * (48kHz stereo) with no dialogue, per the original pilot's own
 * shot manifest -- kept as-is, since there is no dialogue layer for
 * these two pre-chapter shots to begin with.
 *
 * Source copies live under
 * generated/pilot-source/shot-000-ancient-fishing.mp4 and
 * generated/pilot-source/shot-000b-people-in.mp4 (copied from Dan's
 * OneDrive "Flow Initial Downloads" folder for reproducibility).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 24;

const dataDir = getDataDir();
const db = getDb();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";

const shot000Path = join(dataDir, "assets", "generated", "pilot-source", "shot-000-ancient-fishing.mp4");
const shot000bPath = join(dataDir, "assets", "generated", "pilot-source", "shot-000b-people-in.mp4");
const currentChapterRelPath = join("generated", "chapter", `${projectId}.mp4`);

function normalizeForConcat(sourcePath: string, outPath: string): void {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},fps=${TARGET_FPS}`,
      "-ar",
      "44100",
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
}

function concatClips(clipPaths: string[], outPath: string, tmpDir: string): void {
  const listPath = join(tmpDir, "concat-list.txt");
  const listContent = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  writeFileSync(listPath, listContent);
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath], {
    stdio: ["ignore", "ignore", "pipe"]
  });
}

function run() {
  const tmpDir = mkdtempSync(join(tmpdir(), "heartword-pilot-prepend-"));
  try {
    console.log("Normalizing Shot_000 (Ancient fishing)...");
    const clip1Path = join(tmpDir, "pilot-clip-1.mp4");
    normalizeForConcat(shot000Path, clip1Path);

    console.log("Normalizing Shot_000B (People in)...");
    const clip2Path = join(tmpDir, "pilot-clip-2.mp4");
    normalizeForConcat(shot000bPath, clip2Path);

    const currentChapterAbsPath = join(dataDir, "assets", currentChapterRelPath);
    console.log("Concatenating pilot clips in front of the existing chapter render...");
    const relPath = join("generated", "chapter", `${projectId}-with-pilot-intro.mp4`);
    const outPath = join(dataDir, "assets", relPath);
    mkdirSync(join(dataDir, "assets", "generated", "chapter"), { recursive: true });
    concatClips([clip1Path, clip2Path, currentChapterAbsPath], outPath, tmpDir);

    const durationOut = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", outPath],
      { encoding: "utf-8" }
    ).trim();
    const totalDurationMs = Math.round(Number(durationOut) * 1000);

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      `INSERT INTO chapter_renders (id, project_id, result_asset_path, total_duration_ms, shot_count, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, relPath, totalDurationMs, 30, now);

    console.log(JSON.stringify({ relPath, totalDurationMs }, null, 2));
    console.log("\nFull path:", outPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

run();
