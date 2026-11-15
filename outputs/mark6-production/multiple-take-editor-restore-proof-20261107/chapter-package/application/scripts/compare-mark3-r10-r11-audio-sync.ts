/** Read-only sample-level comparison of the previously good and current review mixes. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const dir = join(getDataDir(), "assets/generated/video/review");
const oldCut = join(dir, "mark3-full-chapter-r10-nextchapter-bridge-review-v1.mp4");
const newCut = join(dir, "mark3-full-chapter-r11-continuity-emotion-review-v3.mp4");
const entryCut = join(dir, "mark3-full-chapter-r12-single-entry-ambience-review-v1.mp4");
const rate = 2000, seconds = 4;
function samples(path: string, at: number): Float32Array {
  const bytes = execFileSync("ffmpeg", ["-v", "error", "-ss", at.toFixed(6), "-i", path, "-t", String(seconds),
    "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1"], { maxBuffer: 1000000 });
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
}
function correlation(a: Float32Array, b: Float32Array, lag: number): number {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= b.length) continue;
    const x = a[i]!, y = b[j]!;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  return (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n));
}
for (const at of [45, 62, 90, 120, 155, 200, 235, 260, 280]) {
  const shifted = at >= 110.291667 ? 10 : 0;
  const a = samples(oldCut, at), b = samples(newCut, at + shifted);
  let best = { lagMs: 0, score: -Infinity };
  for (let lag = -1000; lag <= 1000; lag += 2) {
    const score = correlation(a, b, lag);
    if (score > best.score) best = { lagMs: lag / 2, score };
  }
  console.log(JSON.stringify({ oldSeconds: at, newSeconds: at + shifted, best, zeroScore: correlation(a, b, 0) }));
  const entryAt = at + shifted - 110 / 24;
  const c = samples(entryCut, entryAt);
  let entryBest = { lagMs: 0, score: -Infinity };
  for (let lag = -1000; lag <= 1000; lag += 2) {
    const score = correlation(a, c, lag);
    if (score > entryBest.score) entryBest = { lagMs: lag / 2, score };
  }
  console.log(JSON.stringify({ oldSeconds: at, entrySeconds: entryAt, best: entryBest }));
}

// Shot 3B is an early visible-mouth Jesus performance. Its provider take
// should be timed against the assembled audio, not merely two cut versions.
const provider = join(getDataDir(), "assets/generated/lipsync/931871945874866179.mp4");
const cut = samples(oldCut, 58.069), take = samples(provider, 0);
let bestProvider = { lagMs: 0, score: -Infinity };
for (let lag = -1000; lag <= 1000; lag += 2) {
  const score = correlation(cut, take, lag);
  if (score > bestProvider.score) bestProvider = { lagMs: lag / 2, score };
}
console.log(JSON.stringify({ label: "early-Jesus-provider-vs-r10", cutSeconds: 58.069, best: bestProvider,
  zeroScore: correlation(cut, take, 0) }));
