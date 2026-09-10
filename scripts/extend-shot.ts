/**
 * Implements a Production Director extend_existing decision: regenerates
 * one shot's video at a longer duration (Veo's real ceiling is 8s per
 * clip -- see GeminiVideoProvider.generateFinal's comment on the
 * discrete 4/8 constraint, so "extend" here means up to 8s, not
 * however many extra seconds the idea nominally asked for), then
 * re-runs that shot's own per-shot assembly so the chapter-level
 * assembly picks up the new clip.
 *
 * Usage: npx tsx scripts/extend-shot.ts <shotId> <prompt text...>
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDb, getDataDir } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

async function run() {
  const [shotId, ...promptParts] = process.argv.slice(2);
  const prompt = promptParts.join(" ");
  if (!shotId || !prompt) {
    console.error("Usage: npx tsx scripts/extend-shot.ts <shotId> <prompt text...>");
    process.exit(1);
  }
  const db = getDb();
  const keyframePath = `generated/keyframes/${shotId}.png`;

  const videoProvider = new GeminiVideoProvider();
  const klingSceneProvider = new KlingVideoProvider();
  const draftProvider = new GeminiDraftVideoProvider();
  const result = await generateFinalVideoWithFallback(
    videoProvider,
    klingSceneProvider,
    draftProvider,
    { shotId, prompt, characters: [] },
    { resolution: "720p", startFrame: { path: keyframePath }, durationSeconds: 8 }
  );
  console.log(`Video generated: tier=${result.tier}, path=${result.media?.path}`);
  if (!result.media?.path) throw new Error("No media path returned from video generation.");

  const absPath = join(getDataDir(), "assets", result.media.path);
  const durationOut = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", absPath],
    { encoding: "utf-8" }
  );
  const realDurationMs = Math.round(parseFloat(durationOut.trim()) * 1000);
  console.log(`Real generated duration: ${realDurationMs}ms`);

  const attemptId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generation_attempts
       (id, shot_id, provider, model, operation, resolution, prompt, status, result_asset_path, cost_usd, created_at)
     VALUES (?, ?, 'gemini', ?, 'generate_final', '720p', ?, 'accepted', ?, ?, ?)`
  ).run(attemptId, shotId, result.provenance?.model ?? "veo", prompt, result.media.path, result.cost?.usd ?? 0, now);
  db.prepare(
    `INSERT INTO clips (id, shot_id, generation_attempt_id, timeline_start_ms, timeline_end_ms, created_at) VALUES (?, ?, ?, 0, ?, ?)`
  ).run(randomUUID(), shotId, attemptId, realDurationMs, now);

  const assembled = assembleSingleShot(db, shotId);
  console.log(JSON.stringify(assembled, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
