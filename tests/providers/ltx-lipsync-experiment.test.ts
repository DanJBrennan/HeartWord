import { expect, it } from "vitest";
import { assertLocal, buildRequest, prompt, shortReviewFrames, validateContinuityFrame } from "../../scripts/experiments/ltx-lipsync.js";

it("requires positively verified local inference and rejects forced or preferred cloud", () => {
  const health = { status: "ok", models_loaded: true, active_model: "fast" };
  expect(() => assertLocal(health, { force_api_generations: false }, { user_prefers_ltx_api_video_generations: false })).not.toThrow();
  expect(() => assertLocal(health, { force_api_generations: false }, { userPrefersLtxApiVideoGenerations: false })).not.toThrow();
  expect(() => assertLocal({status:"ok",models_loaded:false,active_model:null,models_status:[{id:"fast",downloaded:true}]}, {force_api_generations:false}, {userPrefersLtxApiVideoGenerations:false})).not.toThrow();
  expect(() => assertLocal({status:"ok",models_status:[{id:"fast",downloaded:false}]}, {force_api_generations:false}, {userPrefersLtxApiVideoGenerations:false})).toThrow("Load local");
  for (const [policy, settings] of [
    [{ force_api_generations: true }, { user_prefers_ltx_api_video_generations: false }],
    [{ force_api_generations: false }, { user_prefers_ltx_api_video_generations: true }],
    [{ force_api_generations: false }, { userPrefersLtxApiVideoGenerations: true }],
    [{ force_api_generations: false }, { userPrefersLtxApiVideoGenerations: false, user_prefers_ltx_api_video_generations: true }],
    [{}, {}],
  ]) expect(() => assertLocal(health, policy!, settings!)).toThrow("Local-only");
  expect(() => assertLocal({ ...health, models_loaded: false }, {}, {})).toThrow("Load local");
});

it("holds visual settings and seed constant for the audio timing control", () => {
  const baseline = buildRequest("baseline", "/image.png", "/speech.wav");
  const delayed = buildRequest("delayed", "/image.png", "/delayed.wav");
  expect({ ...delayed, audioPath: baseline.audioPath }).toEqual(baseline);
  expect(baseline.audioPath).toBe("/speech.wav");
  expect(baseline.negativePrompt).not.toContain("visible talking");
  expect(prompt).toContain("approved canon headshot");
  expect(prompt).not.toMatch(/boat|lakeside|Luma|Kling/i);
  expect(baseline).toMatchObject({ duration: 6, fps: 24, aspectRatio: "16:9", audio: true, seed: 42 });
  expect(buildRequest("repeat", "/image.png", "/speech.wav").seed).not.toBe(baseline.seed);
});

it("targets caption-free footage with complete speech supplied at onset for the clean take", () => {
  const clean = buildRequest("clean", "/canon.png", "/speech-at-zero.wav");
  expect(clean.prompt).toContain("Speech begins immediately");
  expect(clean.prompt).toContain("Absolutely no written characters");
  expect(clean.negativePrompt).toContain("burned-in text");
  expect(clean.audioPath).toBe("/speech-at-zero.wav");
  expect(clean.keyframes).toEqual([]); // Installed A2V rejects timed anchors.
});

it("keeps complete longer performances in their own ten-second picture/audio request", () => {
  const r = buildRequest("performance", "/peter.png", "/performance.wav", {durationSeconds:10,prompt:"Preserve this approved Peter portrait and exact performance."});
  expect(r).toMatchObject({imagePath:"/peter.png",audioPath:"/performance.wav",duration:10,seed:42});
  expect(r.prompt).not.toContain("indigo");
  expect(()=>buildRequest("performance", "/p.png", "/a.wav", {durationSeconds:12,prompt:"direction"})).toThrow("duration/prompt");
});

it("does not mislabel a three/four-second review as a supported native short generation", () => {
  for (const durationSeconds of [3,4]) expect(()=>buildRequest("performance", "/p.png", "/a.wav", {durationSeconds,prompt:"Exact original performance"})).toThrow("duration/prompt");
  expect(buildRequest("performance", "/p.png", "/a.wav", {durationSeconds:5,prompt:"Exact original performance"}).duration).toBe(5);
});

it("covers fractional speaking windows without dropping their final video frame", () => {
  expect(shortReviewFrames(94 / 24)).toBe(94);
  expect(shortReviewFrames(346112 / 44100 - 94 / 24)).toBe(95);
  expect(shortReviewFrames(3)).toBe(72);
  expect(shortReviewFrames(4)).toBe(96);
  expect(shortReviewFrames(5)).toBe(120);
  for (const duration of [NaN, Infinity, 0, 2.9, 4.1, 6]) expect(() => shortReviewFrames(duration)).toThrow("Short excerpts");
});

it("carries the last retained speaking frame rather than the native padded tail", () => {
  const frame = {sourceVideoPath:"/previous/raw.mp4",sourceVideoSha256:"a".repeat(64),retainedFrames:76,frameIndex:75};
  expect(() => validateContinuityFrame(frame,121)).not.toThrow();
  for (const wrong of [{...frame,frameIndex:120},{...frame,frameIndex:76},{...frame,retainedFrames:122,frameIndex:121},{...frame,retainedFrames:75.5,frameIndex:74.5},{...frame,sourceVideoSha256:"unpinned"}]) expect(() => validateContinuityFrame(wrong,121)).toThrow("last retained frame");
});
