/**
 * Kling.ai Avatar API adapter (LipSyncProvider) — authenticated with
 * KLING_API_KEY_1 (see .env.example). Whether the "_1" suffix implies a
 * multi-key pool is still an open question — see "Open implementation
 * questions" in docs/ARCHITECTURE.md; this adapter takes a single key for
 * now and can grow key-pool logic later without changing its interface.
 *
 * Implemented for real 2026-09-06 against the actual live API (Kling's own
 * docs proved unreliable to fetch/interpret secondhand -- the real
 * endpoint and field names below were confirmed empirically, submitting
 * real minimal requests against the real account and reading back its own
 * validation error messages, the same way Nano Banana's model names were
 * confirmed against Gemini's live model list). Real endpoint:
 * `POST /v1/videos/avatar/image2video` on api-singapore.klingai.com,
 * fields `image` and `sound_file` (both accept a base64 data URI or a
 * public URL), returning a `task_id` polled via
 * `GET /v1/videos/avatar/image2video/{task_id}`.
 *
 * ONE REAL LIMITATION vs. the interface's original intent:
 * docs/ARCHITECTURE.md's LipSyncProvider sketch mentions passing both a
 * scene `referenceFrame` AND the character's approved `headshot` "for
 * added likeness/lip-sync quality" -- but the real endpoint takes exactly
 * one `image` field, and src/providers/types.ts's actual LipSyncProvider
 * interface (the real compiled contract, unlike that doc prose) already
 * only has three parameters, no headshot. This adapter sends
 * `referenceFrame` as `image` -- it's the actual shot content being
 * lip-synced -- and doesn't attempt to blend in a separate headshot, since
 * there's nowhere in the real API to put one.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir } from "../../db/client.js";
import type { AssetRef, AudioSegmentRef, CharacterRef, GenerationResult, LipSyncProvider } from "../types.js";

function requireApiKey(): string {
  const key = process.env.KLING_API_KEY_1;
  if (!key) {
    throw new Error("KLING_API_KEY_1 is not set (see .env.example).");
  }
  return key;
}

const HOST = "https://api-singapore.klingai.com";
const SUBMIT_PATH = "/v1/videos/avatar/image2video";

// Rough public-pricing-based estimate, NOT reconciled against a real
// invoice -- same honesty caveat as the Gemini adapter's cost constants.
const KLING_AVATAR_COST_USD = 0.50;

interface KlingTaskResponse {
  code: number;
  message: string;
  data?: {
    task_id: string;
    task_status: string;
    task_status_msg?: string;
    task_result?: { videos?: Array<{ id?: string; url?: string; duration?: string }> };
  };
}

/** Cuts [startMs, endMs) out of sourcePath into a standalone mp3, same
 *  re-encode-not-copy reasoning as pipeline/voicing/extract-clip.ts (kept
 *  as a local copy rather than importing pipeline code from a provider --
 *  providers stay below pipeline in this codebase's layering). */
function extractAudioClip(sourcePath: string, startMs: number, endMs: number, outPath: string): void {
  const startSec = (startMs / 1000).toFixed(3);
  const durationSec = ((endMs - startMs) / 1000).toFixed(3);
  execFileSync(
    "ffmpeg",
    ["-y", "-i", sourcePath, "-ss", startSec, "-t", durationSec, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", outPath],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
}

export class KlingLipSyncProvider implements LipSyncProvider {
  async sync(_character: CharacterRef, audio: AudioSegmentRef, referenceFrame: AssetRef): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();

    const imageAbsPath = join(dataDir, "assets", referenceFrame.path);
    const imageBase64 = readFileSync(imageAbsPath).toString("base64");
    const imageMime = referenceFrame.path.toLowerCase().endsWith(".jpg") || referenceFrame.path.toLowerCase().endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";

    // Extract exactly [startMs, endMs) rather than assuming the source
    // file is already trimmed to that range -- correct for both stage 1's
    // multi-segment original_reading files and the composite cast
    // master's already-one-file-per-segment layout.
    const audioAbsPath = join(dataDir, "assets", audio.path);
    const tmpAudioPath = join(tmpdir(), `kling-lipsync-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    extractAudioClip(audioAbsPath, audio.startMs, audio.endMs, tmpAudioPath);
    let audioBase64: string;
    try {
      audioBase64 = readFileSync(tmpAudioPath).toString("base64");
    } finally {
      rmSync(tmpAudioPath, { force: true });
    }

    const submitRes = await fetch(HOST + SUBMIT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        image: `data:${imageMime};base64,${imageBase64}`,
        sound_file: `data:audio/mp3;base64,${audioBase64}`
      })
    });
    const submitData = (await submitRes.json()) as KlingTaskResponse;
    if (!submitRes.ok || submitData.code !== 0 || !submitData.data?.task_id) {
      throw new Error(`Kling avatar/image2video submit failed: ${submitRes.status} -- ${JSON.stringify(submitData).slice(0, 500)}`);
    }
    const taskId = submitData.data.task_id;

    // Long-running task -- poll until succeed/failed. 15 minutes is a
    // generous ceiling; the one real test task submitted while building
    // this adapter was still "submitted" after several minutes, so this
    // can be slow, especially on a trial-tier account.
    const deadline = Date.now() + 15 * 60 * 1000;
    let finalData: KlingTaskResponse["data"] | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const pollRes = await fetch(`${HOST}${SUBMIT_PATH}/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      const pollData = (await pollRes.json()) as KlingTaskResponse;
      if (!pollRes.ok || pollData.code !== 0) {
        throw new Error(`Kling avatar/image2video poll failed for task ${taskId}: ${pollRes.status} -- ${JSON.stringify(pollData).slice(0, 500)}`);
      }
      const status = pollData.data?.task_status;
      if (status === "succeed" || status === "failed") {
        finalData = pollData.data;
        break;
      }
    }
    if (!finalData) {
      throw new Error(`Kling avatar/image2video task ${taskId} did not finish within 15 minutes.`);
    }
    if (finalData.task_status === "failed") {
      throw new Error(`Kling avatar/image2video task ${taskId} failed: ${finalData.task_status_msg ?? "no message"}`);
    }

    const videoUrl = finalData.task_result?.videos?.[0]?.url;
    if (!videoUrl) {
      throw new Error(`Kling avatar/image2video task ${taskId} succeeded with no video URL: ${JSON.stringify(finalData).slice(0, 500)}`);
    }
    const downloadRes = await fetch(videoUrl);
    if (!downloadRes.ok) {
      throw new Error(`Failed downloading Kling avatar output for task ${taskId}: ${downloadRes.status} ${downloadRes.statusText}`);
    }
    const videoBuffer = Buffer.from(await downloadRes.arrayBuffer());

    const relPath = join("generated", "lipsync", `${taskId}.mp4`);
    mkdirSync(join(dataDir, "assets", "generated", "lipsync"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), videoBuffer);

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: KLING_AVATAR_COST_USD },
      provenance: { provider: "kling", model: "avatar-image2video", prompt: "" }
    };
  }
}
