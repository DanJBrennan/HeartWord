/** Acoustic checks only at speaker turns and the scene end, not picture cuts. */
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { decodeToPcm16Mono } from "../src/pipeline/ingestion/pitch.js";
import { detectTruncatedRenewal } from "../src/pipeline/qc/audio-tail.js";

const path = join(getDataDir(), "assets", "generated", "video", "review", "mark3-scene2-full-source-review-r1.mp4");
const rate = 8000, pcm = decodeToPcm16Mono(path, rate);
const checks = [
  { label: "narrator-to-man", endMs: 69264 },
  { label: "man-to-narrator", endMs: 71197 },
  { label: "scene-end", endMs: 79459 }
];
for (const item of checks) {
  const end = Math.min(pcm.length, Math.round(item.endMs * rate / 1000));
  const tail = detectTruncatedRenewal(pcm.subarray(Math.max(0, end - 12000), end), rate);
  console.log(JSON.stringify({ ...item, truncatedRenewal: tail }));
  if (tail) process.exitCode = 1;
}
const start = Math.round(77310 * rate / 1000), end = Math.min(pcm.length, Math.round(79459 * rate / 1000));
let energy = 0;
for (let i = start; i < end; i++) energy += pcm[i]! * pcm[i]!;
const rms = Math.sqrt(energy / Math.max(1, end - start)) / 32768;
console.log(JSON.stringify({ label: "final-natural-pause", startMs: 77310, endMs: 79459, rmsDbfs: rms ? Math.round(200 * Math.log10(rms)) / 10 : -100 }));
