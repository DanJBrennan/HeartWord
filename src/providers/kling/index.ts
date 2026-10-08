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
import type { AssetRef, AudioSegmentRef, CharacterRef, GenerationResult, LipSyncProvider, ShotRequest, VideoProvider } from "../types.js";

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
  const requestedMs = endMs - startMs;
  const durationSec = (requestedMs / 1000).toFixed(3);
  // Kling face-sync rejects shorter audio even when the source interval is
  // valid.  Pad only *after* the extracted approved utterance: this does not
  // alter, re-time, or invent speech, and the caller still records the exact
  // source interval used for the speaking portion.
  const minDurationSec = Math.max(requestedMs, 2000) / 1000;
  const padArgs = requestedMs < 2000 ? ["-af", "apad", "-t", minDurationSec.toFixed(3)] : [];
  execFileSync(
    "ffmpeg",
    ["-y", "-i", sourcePath, "-ss", startSec, "-t", durationSec, ...padArgs, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", outPath],
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
    writeFileSync(join(dataDir, "assets", relPath), videoBuffer, { flag: "wx" });

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: KLING_AVATAR_COST_USD },
      provenance: { provider: "kling", model: "avatar-image2video", prompt: "" }
    };
  }
}

// Plain scene image-to-video (NOT the Avatar/lip-sync endpoint above) --
// confirmed real 2026-09-09, added as a higher-quality alternative to
// Omni's 360p draft fallback (see generate-final-with-fallback.ts) after
// Dan asked for a path that avoids 360p whenever possible. Real endpoint:
// `POST /v1/videos/image2video`, fields `model_name`, `image`, `prompt`,
// `duration` (string), `aspect_ratio`, `mode`; polled via
// `GET /v1/videos/image2video/{task_id}`. Confirmed to succeed at a real
// 1280x720 on the EXACT keyframe Veo's RAI filter rejected (the paralytic
// composition) -- Kling and Veo evidently don't share a content-filter
// threshold, which is exactly why this is worth having as a distinct
// fallback tier rather than just retrying Veo harder.
//
// Model/mode upgraded from kling-v1 to kling-v1-6 + mode:"pro" 2026-09-09
// after Dan caught real face-quality softness in a kling-v1 wide shot
// (Jesus's and a background woman's faces were noticeably "melted"
// compared to the crisp stone-wall background in the same frame). A
// direct side-by-side on the identical keyframe/prompt confirmed
// kling-v1 was the actual cause, not an inherent wide-shot limitation:
// kling-v1-6/pro came back at a genuine 1920x1080 (not just 720p) with
// face detail comparable to or better than Veo's own successful
// attempts, succeeding cleanly with no content-filter issue on the same
// composition Veo still fails roughly half the time.
const SCENE_SUBMIT_PATH = "/v1/videos/image2video";
// Kling retired v1.6. Its current legacy image-to-video endpoint supports
// v2.6 with the same task/poll contract used below.
const KLING_SCENE_MODEL = "kling-v2-6";
const KLING_SCENE_MODE = "pro";

// Rough public-pricing-based estimate, NOT reconciled against a real
// invoice -- same honesty caveat as every other cost constant in this
// codebase. "pro" mode is expected to cost more than kling-v1's standard
// tier did, but Kling's own response reports "final_unit_deduction" (a
// unit count, e.g. "1"), not a dollar figure, so there's no real pricing
// signal yet to size the increase from -- this estimate is bumped up as
// a placeholder pending an actual invoice.
const KLING_SCENE_COST_USD = 0.6;

// Kling's duration field takes a small fixed set of values, not an
// arbitrary number -- "5" is its shortest -- so every beat requests the
// same 5s and clip-assembly (assemble-covered-shot.ts) trims down to the
// beat's own exact duration from the start, the same pattern already
// used for Veo's 4s floor overrunning a shorter beat.
const SCENE_DURATION = "5";

// Real, separate Kling product confirmed 2026-09-09 while fixing Scene 1
// Shot 8's QC feedback: a video-based Lip-Sync API (`/v1/videos/lip-sync`,
// `/v1/videos/identify-face`), distinct from BOTH the Avatar endpoint above
// (which syncs EVERY detected face to the same audio -- the actual root
// cause of "both Jesus and the scribe are mouthing Jesus's words" on Shot
// 7) and the plain scene endpoint below. This one takes an ALREADY
// GENERATED video plus a `face_id` naming exactly which detected face to
// sync, so a wide multi-person shot (a covered_sequence master or a
// cutaway where the speaker is still visible) can get real audio-driven
// lip-sync on just the speaker, with everyone else in frame left alone --
// no manual crop-to-isolate needed at all.
//
// Confirmed real via live minimal requests against the real account
// (Kling's own docs proved unreliable to fetch/interpret secondhand, same
// as every other endpoint in this file):
// - `POST /v1/videos/lip-sync`, body `{ input: { mode: "audio2video",
//   video_url, face_id, sound_insert_time, audio_type: "file",
//   audio_file } }` (video_id -- a bare task_id -- was tried first and
//   rejected; a real hosted video_url from a completed Kling generation
//   task works). Polled via `GET /v1/videos/lip-sync/{task_id}`.
// - `POST /v1/videos/identify-face`, body `{ video_url }` (NOT nested
//   under `input` -- confirmed by trial, the two endpoints don't share a
//   body shape). Returns `data.face_data`: an array of `{face_id,
//   face_image, start_time, end_time}`, one entry per detected face, each
//   with a real thumbnail URL.
//
// CRITICAL: face_id is NOT stable or guessable (confirmed by an actual
// mistake made while building this -- id "0" in one real test was a
// background bystander, not Jesus, who was actually id "1"). Every real
// use MUST fetch identify-face's thumbnails and visually confirm which
// face_id is the intended speaker before calling lip-sync -- there is no
// shortcut. sound_insert_time is measured from the START OF THE SOURCE
// VIDEO CLIP itself (0 = the very start of that beat's own generated
// clip), not any shot- or project-level timeline offset.
export interface KlingFaceCandidate {
  faceId: string;
  thumbnailUrl: string;
  startTime: number;
  endTime: number;
}

const LIPSYNC_SUBMIT_PATH = "/v1/videos/lip-sync";
const IDENTIFY_FACE_PATH = "/v1/videos/identify-face";

// Same rough-estimate caveat as every other cost constant in this file --
// Kling's response reports a unit deduction, not a dollar figure.
const KLING_FACE_LIPSYNC_COST_USD = 0.5;

export class KlingFaceLipSyncProvider {
  /** Generates a base scene video via the plain image2video (scene) endpoint -- the real, hosted video_url this flow needs as its input. */
  async generateSceneVideo(image: AssetRef, prompt: string, durationSec: number, onSubmitted?: (taskId: string) => void | Promise<void>): Promise<{ taskId: string; videoUrl: string }> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();
    const imageAbsPath = join(dataDir, "assets", image.path);
    const imageBase64 = readFileSync(imageAbsPath).toString("base64");

    const submitRes = await fetch(HOST + SCENE_SUBMIT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model_name: KLING_SCENE_MODEL,
        image: imageBase64,
        prompt,
        // The real scene endpoint accepts only 5- or 10-second bases.  Round
        // upward so a source-bound speaking interval is never silently cut
        // short; assembly still trims to the exact approved source duration.
        duration: durationSec > 5 ? "10" : "5",
        aspect_ratio: "16:9",
        mode: KLING_SCENE_MODE,
        // HeartWord supplies the real source audio separately.
        sound: "off"
      })
    });
    const submitData = (await submitRes.json()) as KlingTaskResponse;
    if (!submitRes.ok || submitData.code !== 0 || !submitData.data?.task_id) {
      throw new Error(`Kling scene submit (for face lip-sync) failed: ${submitRes.status} -- ${JSON.stringify(submitData).slice(0, 500)}`);
    }
    const taskId = submitData.data.task_id;
    // Persist the opaque provider handle before polling. A local runner can
    // then recover the exact paid task after a timeout instead of guessing
    // whether it is safe to submit another one.
    await onSubmitted?.(taskId);

    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const pollRes = await fetch(`${HOST}${SCENE_SUBMIT_PATH}/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const pollData = (await pollRes.json()) as KlingTaskResponse;
      const status = pollData.data?.task_status;
      if (status === "succeed") {
        const url = pollData.data?.task_result?.videos?.[0]?.url;
        if (!url) throw new Error(`Kling scene task ${taskId} succeeded with no video URL.`);
        return { taskId, videoUrl: url };
      }
      if (status === "failed") throw new Error(`Kling scene task ${taskId} failed: ${pollData.data?.task_status_msg ?? "no message"}`);
    }
    throw new Error(`Kling scene task ${taskId} did not finish within 15 minutes.`);
  }

  /** Lists every detected face with a real thumbnail -- inspect these and pick the right face_id BEFORE calling syncFace. Never guess. */
  async identifyFaces(videoUrl: string): Promise<KlingFaceCandidate[]> {
    const apiKey = requireApiKey();
    const res = await fetch(HOST + IDENTIFY_FACE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ video_url: videoUrl }) // top-level, NOT nested under `input` -- confirmed by trial
    });
    const data = (await res.json()) as { code: number; message: string; data?: { face_data?: Array<{ face_id: string; face_image: string; start_time: number; end_time: number }> } };
    if (!res.ok || data.code !== 0 || !data.data?.face_data) {
      throw new Error(`Kling identify-face failed: ${res.status} -- ${JSON.stringify(data).slice(0, 500)}`);
    }
    return data.data.face_data.map((f) => ({ faceId: f.face_id, thumbnailUrl: f.face_image, startTime: f.start_time, endTime: f.end_time }));
  }

  /** Real audio-driven lip-sync of ONE named face in an existing video. Call identifyFaces first and pass its confirmed faceId -- see class header. */
  async syncFace(videoUrl: string, faceId: string, audio: AudioSegmentRef, soundInsertTimeMs = 0, onSubmitted?: (taskId: string) => void | Promise<void>): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();

    const audioAbsPath = join(dataDir, "assets", audio.path);
    const tmpAudioPath = join(tmpdir(), `kling-facesync-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    extractAudioClip(audioAbsPath, audio.startMs, audio.endMs, tmpAudioPath);
    let audioBase64: string;
    try {
      audioBase64 = readFileSync(tmpAudioPath).toString("base64");
    } finally {
      rmSync(tmpAudioPath, { force: true });
    }

    const submitRes = await fetch(HOST + LIPSYNC_SUBMIT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        input: {
          mode: "audio2video",
          video_url: videoUrl,
          face_id: faceId,
          sound_insert_time: soundInsertTimeMs,
          audio_type: "file",
          audio_file: `data:audio/mp3;base64,${audioBase64}`
        }
      })
    });
    const submitData = (await submitRes.json()) as KlingTaskResponse;
    if (!submitRes.ok || submitData.code !== 0 || !submitData.data?.task_id) {
      throw new Error(`Kling lip-sync submit failed: ${submitRes.status} -- ${JSON.stringify(submitData).slice(0, 500)}`);
    }
    const taskId = submitData.data.task_id;
    await onSubmitted?.(taskId);

    const deadline = Date.now() + 15 * 60 * 1000;
    let finalData: KlingTaskResponse["data"] | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const pollRes = await fetch(`${HOST}${LIPSYNC_SUBMIT_PATH}/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const pollData = (await pollRes.json()) as KlingTaskResponse;
      const status = pollData.data?.task_status;
      if (status === "succeed" || status === "failed") {
        finalData = pollData.data;
        break;
      }
    }
    if (!finalData) throw new Error(`Kling lip-sync task ${taskId} did not finish within 15 minutes.`);
    if (finalData.task_status === "failed") throw new Error(`Kling lip-sync task ${taskId} failed: ${finalData.task_status_msg ?? "no message"}`);

    const videoUrlResult = finalData.task_result?.videos?.[0]?.url;
    if (!videoUrlResult) throw new Error(`Kling lip-sync task ${taskId} succeeded with no video URL.`);
    const downloadRes = await fetch(videoUrlResult);
    if (!downloadRes.ok) throw new Error(`Failed downloading Kling lip-sync output for task ${taskId}: ${downloadRes.status} ${downloadRes.statusText}`);
    const videoBuffer = Buffer.from(await downloadRes.arrayBuffer());

    const relPath = join("generated", "lipsync-face", `${taskId}.mp4`);
    mkdirSync(join(dataDir, "assets", "generated", "lipsync-face"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), videoBuffer, { flag: "wx" });

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: KLING_FACE_LIPSYNC_COST_USD },
      provenance: { provider: "kling", model: "lip-sync-audio2video", prompt: "" }
    };
  }
}

export class KlingVideoProvider implements VideoProvider {
  async generateFinal(request: ShotRequest, opts?: { resolution?: "720p" | "1080p"; startFrame?: AssetRef }): Promise<GenerationResult> {
    const apiKey = requireApiKey();
    const dataDir = getDataDir();
    if (!opts?.startFrame) {
      throw new Error(`KlingVideoProvider.generateFinal for shot ${request.shotId}: startFrame is required (no shot-level keyframe lookup like GeminiVideoProvider's default).`);
    }
    const imageAbsPath = join(dataDir, "assets", opts.startFrame.path);
    const imageBase64 = readFileSync(imageAbsPath).toString("base64");

    const submitRes = await fetch(HOST + SCENE_SUBMIT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model_name: KLING_SCENE_MODEL,
        image: imageBase64,
        prompt: request.prompt,
        duration: SCENE_DURATION,
        aspect_ratio: "16:9",
        mode: KLING_SCENE_MODE,
        // Non-lip-sync footage needs native ambience; source narration is layered separately.
        sound: "on"
      })
    });
    const submitData = (await submitRes.json()) as KlingTaskResponse;
    if (!submitRes.ok || submitData.code !== 0 || !submitData.data?.task_id) {
      throw new Error(`Kling image2video submit failed for shot ${request.shotId}: ${submitRes.status} -- ${JSON.stringify(submitData).slice(0, 500)}`);
    }
    const taskId = submitData.data.task_id;

    const deadline = Date.now() + 15 * 60 * 1000;
    let finalData: KlingTaskResponse["data"] | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const pollRes = await fetch(`${HOST}${SCENE_SUBMIT_PATH}/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const pollData = (await pollRes.json()) as KlingTaskResponse;
      if (!pollRes.ok || pollData.code !== 0) {
        throw new Error(`Kling image2video poll failed for task ${taskId}: ${pollRes.status} -- ${JSON.stringify(pollData).slice(0, 500)}`);
      }
      const status = pollData.data?.task_status;
      if (status === "succeed" || status === "failed") {
        finalData = pollData.data;
        break;
      }
    }
    if (!finalData) {
      throw new Error(`Kling image2video task ${taskId} did not finish within 15 minutes.`);
    }
    if (finalData.task_status === "failed") {
      throw new Error(`Kling image2video task ${taskId} failed: ${finalData.task_status_msg ?? "no message"}`);
    }

    const videoUrl = finalData.task_result?.videos?.[0]?.url;
    if (!videoUrl) {
      throw new Error(`Kling image2video task ${taskId} succeeded with no video URL: ${JSON.stringify(finalData).slice(0, 500)}`);
    }
    const downloadRes = await fetch(videoUrl);
    if (!downloadRes.ok) {
      throw new Error(`Failed downloading Kling image2video output for task ${taskId}: ${downloadRes.status} ${downloadRes.statusText}`);
    }
    const videoBuffer = Buffer.from(await downloadRes.arrayBuffer());

    const relPath = join("generated", "video", `kling-${taskId}.mp4`);
    mkdirSync(join(dataDir, "assets", "generated", "video"), { recursive: true });
    writeFileSync(join(dataDir, "assets", relPath), videoBuffer, { flag: "wx" });

    return {
      status: "accepted",
      media: { path: relPath },
      cost: { usd: KLING_SCENE_COST_USD },
      provenance: { provider: "kling", model: KLING_SCENE_MODEL, prompt: request.prompt }
    };
  }
}
