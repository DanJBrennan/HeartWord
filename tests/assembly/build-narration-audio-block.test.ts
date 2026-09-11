import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { buildNarrationAudioBlock, type AudioBlockSegment } from "../../scripts/build-narration-audio-block.js";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

/**
 * Regression test for the 2026-09-11 bug: buildNarrationAudioBlock's final
 * mux only seeked the source audio input to its start (`-ss startMs`), with
 * no matching end trim -- so whenever the picture ran longer than the
 * requested narration span (needing `apad` to fill the gap with silence),
 * the untrimmed source stream let the NEXT real audio section bleed
 * through the gap instead of true silence.
 *
 * Builds a real source audio file with two distinct, frequency-
 * distinguishable sections after a nonzero leading offset -- section A
 * (440 Hz, the "selected narration") and section B (880 Hz, "the next
 * verse's real dialogue" that must never be audible in this block) -- and
 * a picture segment deliberately longer than section A alone, which is
 * exactly the condition that needs `apad` padding and previously leaked
 * section B into it.
 */
it.skipIf(!ffmpegAvailable)(
  "trims to the requested source interval, never letting the following audio section bleed into the padded tail",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "heartword-narration-block-test-"));
    const assets = join(dir, "assets");
    mkdirSync(assets);
    const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });

    try {
      // Source: [0.5s silence offset][2.0s @ 440Hz = section A][2.0s @ 880Hz = section B]
      const offsetPath = join(dir, "offset.wav");
      const sectionAPath = join(dir, "section-a.wav");
      const sectionBPath = join(dir, "section-b.wav");
      const sourcePath = join(assets, "source.wav");
      ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.5", offsetPath]);
      ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=44100", sectionAPath]);
      ffmpeg(["-f", "lavfi", "-i", "sine=frequency=880:duration=2:sample_rate=44100", sectionBPath]);
      const concatListPath = join(dir, "concat-list.txt");
      writeFileSync(concatListPath, [offsetPath, sectionAPath, sectionBPath].map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
      ffmpeg(["-f", "concat", "-safe", "0", "-i", concatListPath, "-ar", "44100", "-ac", "1", sourcePath]);

      // Picture: a single silent 5s clip, but we only request 3s of it --
      // deliberately LONGER than section A's 2.0s real narration, so the
      // final mux must pad ~1s of trailing silence via `apad`.
      const videoSourcePath = join(dir, "video-source.mp4");
      ffmpeg(["-f", "lavfi", "-i", "color=blue:s=160x90:r=24:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoSourcePath]);

      const segments: AudioBlockSegment[] = [{ sourceAbsPath: videoSourcePath, durationMs: 3000, label: "picture" }];
      const outAbsPath = join(assets, "block.mp4");

      // Nonzero source offset (500ms) selecting exactly section A (440Hz),
      // NOT section B (880Hz) -- the bug also only manifested with a real
      // startMs offset, since `-ss` alone (no matching `-t`) still read
      // everything after it unbounded.
      const result = buildNarrationAudioBlock(segments, { sourceAbsPath: sourcePath, startMs: 500, endMs: 2500 }, outAbsPath);

      expect(result.realAudioMs).toBe(2000);
      expect(result.totalVideoMs).toBe(3000);

      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", outAbsPath, "-f", "f32le", "-ac", "1", "-ar", "8000", "pipe:1"]);
      const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      const rms = (startSec: number, endSec: number) =>
        Math.sqrt(
          samples.slice(startSec * 8000, endSec * 8000).reduce((sum, n) => sum + n * n, 0) / ((endSec - startSec) * 8000)
        );
      const zeroCrossingsPerSec = (startSec: number, endSec: number) => {
        let count = 0;
        for (let i = startSec * 8000 + 1; i < endSec * 8000; i++) if (samples[i - 1]! <= 0 && samples[i]! > 0) count++;
        return count / (endSec - startSec);
      };

      // 0.0-2.0s: section A's real tone (440Hz), not silence.
      expect(rms(0.1, 1.9)).toBeGreaterThan(0.04);
      expect(zeroCrossingsPerSec(0.1, 1.9)).toBeCloseTo(440, -1);

      // 2.0-3.0s: the padded tail. Before the fix, this contained the start
      // of section B (880Hz) bled through from the untrimmed source input.
      // It must be true silence -- neither loud nor showing 880Hz's
      // zero-crossing rate.
      expect(rms(2.1, 2.9)).toBeLessThan(0.01);
    } finally {
      if (relative(tmpdir(), dir).startsWith("heartword-narration-block-test-")) rmSync(dir, { recursive: true, force: true });
    }
  },
  30000
);
