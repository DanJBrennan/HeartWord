import { spawnSync } from "node:child_process";

/**
 * Decodes an audio file to mono 16-bit PCM at a fixed sample rate via
 * ffmpeg (same technique BVET's own scripts/review-mark1-source.mjs used
 * for its acoustic pass) and returns it as an Int16Array. Loaded once for
 * the whole file; callers slice by sample index for a given time window.
 */
export function decodeToPcm16Mono(audioPath: string, sampleRate = 16000): Int16Array {
  const result = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", audioPath, "-f", "s16le", "-ac", "1", "-ar", String(sampleRate), "pipe:1"],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffmpeg PCM decode failed for ${audioPath}: ${result.stderr?.toString() ?? ""}`);
  }
  const buffer = result.stdout;
  return new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2));
}

export interface PitchEstimate {
  /** Mean fundamental frequency across voiced frames in this window, or
   *  null if too few frames were voiced to say anything (e.g. the window
   *  is mostly silence). */
  meanHz: number | null;
  voicedFrameCount: number;
  totalFrameCount: number;
}

/**
 * Coarse fundamental-frequency (pitch) estimate for one time window, via
 * frame-by-frame autocorrelation — a standard, well-understood pitch
 * detection technique that needs nothing beyond plain arrays (no numpy/
 * librosa equivalent is available in this Node environment, and this
 * avoids adding one). This is NOT real speaker diarization: it's a single
 * coarse average-pitch number for a whole window, meant only as a rough
 * corroborating signal for "does this stretch of audio sound like a
 * markedly different voice than the surrounding narration" — see
 * "Acoustic voice-change signal" in the quote-alignment exercise's output
 * for how (weakly) this actually gets used.
 *
 * Searches lags corresponding to 80-400 Hz (typical adult speech F0
 * range) using 40ms Hamming-windowed frames with 50% overlap; a frame
 * counts as "voiced" only if its normalized autocorrelation peak clears
 * `voicingThreshold`, which filters out silence and unvoiced noise.
 */
export function estimateMeanPitchHz(
  pcm: Int16Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  voicingThreshold = 0.3
): PitchEstimate {
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(pcm.length, Math.floor(endSec * sampleRate));

  const frameSize = Math.round(sampleRate * 0.04); // 40ms
  const hopSize = Math.round(frameSize / 2);
  const minLag = Math.floor(sampleRate / 400); // 400 Hz upper bound
  const maxLag = Math.ceil(sampleRate / 80); // 80 Hz lower bound

  const window = hammingWindow(frameSize);
  const pitches: number[] = [];
  let totalFrames = 0;

  for (let frameStart = startSample; frameStart + frameSize <= endSample; frameStart += hopSize) {
    totalFrames++;
    const frame = new Float64Array(frameSize);
    for (let i = 0; i < frameSize; i++) frame[i] = pcm[frameStart + i]! * window[i]!;

    const r0 = autocorrelate(frame, 0);
    if (r0 <= 0) continue;

    let bestLag = -1;
    let bestValue = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const value = autocorrelate(frame, lag) / r0;
      if (value > bestValue) {
        bestValue = value;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestValue >= voicingThreshold) pitches.push(sampleRate / bestLag);
  }

  if (pitches.length === 0) return { meanHz: null, voicedFrameCount: 0, totalFrameCount: totalFrames };
  const meanHz = pitches.reduce((sum, hz) => sum + hz, 0) / pitches.length;
  return { meanHz: Math.round(meanHz * 10) / 10, voicedFrameCount: pitches.length, totalFrameCount: totalFrames };
}

function autocorrelate(frame: Float64Array, lag: number): number {
  let sum = 0;
  for (let i = 0; i + lag < frame.length; i++) sum += frame[i]! * frame[i + lag]!;
  return sum;
}

function hammingWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
  return window;
}
