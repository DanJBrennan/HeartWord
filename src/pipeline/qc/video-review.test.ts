import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { MAX_REVIEW_PROXY_BYTES, VIDEO_REVIEW_MIN_CONFIDENCE, reviewGeneratedVideo, videoReviewPassed } from "./video-review.js";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

it("passes only an explicit pass with a real reason and an in-range confidence", () => {
  expect(videoReviewPassed({ pass: true, confidence: 90, reason: "Motion matches the direction." })).toBe(true);
  expect(videoReviewPassed({ pass: true, confidence: VIDEO_REVIEW_MIN_CONFIDENCE, reason: "Just clears it." })).toBe(true);
});

it("fails a low, impossible or missing confidence rather than trusting the number", () => {
  const reason = "Looks fine.";
  expect(videoReviewPassed({ pass: true, confidence: 79, reason })).toBe(false);
  // A model inventing certainty above the scale is not more certain.
  expect(videoReviewPassed({ pass: true, confidence: 140, reason })).toBe(false);
  expect(videoReviewPassed({ pass: true, confidence: Number.NaN, reason })).toBe(false);
});

it("fails a pass with no stated reason, so an approval is always explainable", () => {
  expect(videoReviewPassed({ pass: true, confidence: 95, reason: "   " })).toBe(false);
});

it("fails an explicit non-pass however confident it claims to be", () => {
  expect(videoReviewPassed({ pass: false, confidence: 99, reason: "The hand never moves." })).toBe(false);
});

it("refuses an oversized clip instead of failing the provider call halfway through", async () => {
  directory = mkdtempSync(join(tmpdir(), "hw-video-review-"));
  const videoPath = join(directory, "big.mp4");
  writeFileSync(videoPath, Buffer.alloc(MAX_REVIEW_PROXY_BYTES + 1));
  await expect(reviewGeneratedVideo({ videoPath, keyframePath: join(directory, "key.png"), instruction: "x" }))
    .rejects.toThrow("smaller review proxy");
});
