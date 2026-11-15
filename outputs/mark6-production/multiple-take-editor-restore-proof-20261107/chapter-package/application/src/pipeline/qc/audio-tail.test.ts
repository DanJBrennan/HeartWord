import { expect, it } from "vitest";
import { detectTruncatedRenewal } from "./audio-tail.js";

const RATE = 8000;
function audio(durationMs: number, active: Array<[number, number]>): Int16Array {
  const pcm = new Int16Array(durationMs * RATE / 1000);
  for (let i = 0; i < pcm.length; i++) {
    const ms = i * 1000 / RATE;
    pcm[i] = active.some(([start, end]) => ms >= start && ms < end)
      ? Math.round(9000 * Math.sin(2 * Math.PI * 200 * i / RATE)) : 0;
  }
  return pcm;
}

it("detects a strong new onset after silence at the end of an audio turn", () => {
  const result = detectTruncatedRenewal(audio(14000, [[0, 13000], [13840, 14000]]), RATE);
  expect(result).not.toBeNull();
  expect(result!.activeTailMs).toBeGreaterThanOrEqual(140);
  expect(result!.quietStartMs).toBeGreaterThanOrEqual(12980);
});

it("does not flag a turn ending in silence or uninterrupted speech", () => {
  expect(detectTruncatedRenewal(audio(14000, [[0, 13000]]), RATE)).toBeNull();
  expect(detectTruncatedRenewal(audio(14000, [[0, 14000]]), RATE)).toBeNull();
});

it("does not mistake an isolated click for a renewed utterance", () => {
  expect(detectTruncatedRenewal(audio(14000, [[0, 13000], [13980, 14000]]), RATE)).toBeNull();
});
