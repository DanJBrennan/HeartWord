/** Read-only audio alignment diagnostic: provider take versus assembled cast mix. */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";

const root = join(getDataDir(), "assets"), base = join(root, "generated/video/review/mark3-full-chapter-source-review-r7-editorial-v5.mp4");
const samples = [
  { label: "Jesus before 5:41", media: "generated/lipsync/931954936396128323.mp4", sourceMs: 307942, duration: 5.5 },
  { label: "Jesus after 5:41", media: "generated/lipsync/932202333327462403.mp4", sourceMs: 322023, duration: 7.8 }
];

function envelope(path: string, seek: number, duration: number): number[] {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", seek.toFixed(3), "-i", path, "-t", duration.toFixed(3),
    "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 });
  const values: number[] = [];
  for (let i = 0; i + 320 <= raw.length / 4; i += 320) {
    let energy = 0;
    for (let j = 0; j < 320; j++) { const x = raw.readFloatLE((i + j) * 4); energy += x * x; }
    values.push(Math.log1p(1000 * Math.sqrt(energy / 320)));
  }
  return values;
}

function correlation(a: number[], b: number[], lag: number): number {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < a.length; i++) if (i + lag >= 0 && i + lag < b.length) pairs.push([a[i]!, b[i + lag]!]);
  if (pairs.length < 20) return -1;
  const ma = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const mb = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let dot = 0, aa = 0, bb = 0;
  for (const [x, y] of pairs) { dot += (x - ma) * (y - mb); aa += (x - ma) ** 2; bb += (y - mb) ** 2; }
  return dot / Math.sqrt(aa * bb);
}

for (const sample of samples) {
  const take = envelope(join(root, sample.media), 0, sample.duration);
  const cut = envelope(base, (sample.sourceMs + 26500) / 1000, sample.duration + 0.5);
  const results = Array.from({ length: 25 }, (_, i) => ({ lagMs: (i - 12) * 40, score: correlation(take, cut, i - 12) }));
  results.sort((a, b) => b.score - a.score);
  console.log(JSON.stringify({ label: sample.label, best: results[0], zero: results.find(r => r.lagMs === 0) }));
}
