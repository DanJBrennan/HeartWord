/** Detects the audible failure Dan found: a substantial pause followed by a
 * short, strong onset that is cut off at the end of a speaking turn. This is
 * an acoustic warning, not word or speaker recognition. Callers must not use
 * it at a visual cut where the same audio turn continues. */
export interface TruncatedRenewal {
  quietStartMs: number;
  quietEndMs: number;
  activeTailMs: number;
  tailLevelDb: number;
}

export function detectTruncatedRenewal(pcm: Int16Array, sampleRate: number): TruncatedRenewal | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("A positive PCM sample rate is required.");
  const frameSamples = Math.max(1, Math.round(sampleRate * 0.02));
  const firstSample = Math.max(0, pcm.length - Math.round(sampleRate * 1.5));
  const frames: Array<{ startMs: number; db: number }> = [];
  for (let start = firstSample; start + frameSamples <= pcm.length; start += frameSamples) {
    let energy = 0;
    for (let i = start; i < start + frameSamples; i++) energy += pcm[i]! * pcm[i]!;
    const rms = Math.sqrt(energy / frameSamples) / 32768;
    frames.push({ startMs: start * 1000 / sampleRate, db: rms ? 20 * Math.log10(rms) : -100 });
  }
  if (frames.length < 20) return null;
  const sorted = frames.map(f => f.db).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.15)]!;
  const threshold = Math.max(-45, Math.min(-24, floor + 10));
  const endMs = pcm.length * 1000 / sampleRate;
  let quietStart: number | null = null;
  let latestGap: { start: number; end: number } | null = null;
  for (const frame of frames) {
    if (frame.db < threshold - 3) quietStart ??= frame.startMs;
    else if (quietStart !== null) {
      if (frame.startMs - quietStart >= 250) latestGap = { start: quietStart, end: frame.startMs };
      quietStart = null;
    }
  }
  if (!latestGap) return null;
  const activeTailMs = endMs - latestGap.end;
  if (activeTailMs < 60 || activeTailMs > 400) return null;
  const tail = frames.filter(f => f.startMs >= latestGap.end);
  if (tail.length < 3 || tail.filter(f => f.db >= threshold).length < Math.ceil(tail.length * 0.7)) return null;
  const last = frames.slice(-2);
  if (!last.some(f => f.db >= threshold)) return null;
  const level = tail.map(f => f.db).sort((a, b) => a - b)[Math.floor(tail.length / 2)]!;
  if (level < threshold + 6) return null;
  return {
    quietStartMs: Math.round(latestGap.start), quietEndMs: Math.round(latestGap.end),
    activeTailMs: Math.round(activeTailMs), tailLevelDb: Math.round(level * 10) / 10
  };
}
