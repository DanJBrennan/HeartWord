/**
 * Acoustic integrity check for adjacent source-alignment intervals.
 * An exact text match does not prove that its audio edge falls between words.
 * This flags activity crossing a proposed edge; it never edits a boundary or
 * decides what was said or who said it.
 */
export interface SourceInterval {
  startMs: number;
  endMs: number;
}

export interface BoundaryIntegrityFinding {
  leftIndex: number;
  rightIndex: number;
  boundaryMs: number;
  noiseFloorDb: number;
  activityThresholdDb: number;
  leftActivityDb: number;
  rightActivityDb: number;
  quietGap: { startMs: number; endMs: number; midpointMs: number } | null;
  atMaxSegmentLength: boolean;
}

/** A timing-only correction is safe only when a substantial, measured pause
 * separates the activity from the proposed edge. This says nothing about the
 * words or speaker; callers must keep the original evidence and never apply
 * it to a producer-reviewed source version. */
export function safeQuietGapSnap(finding: BoundaryIntegrityFinding, left: SourceInterval, right: SourceInterval): number | null {
  const gap = finding.quietGap;
  if (!gap || gap.endMs - gap.startMs < 500 || gap.endMs > finding.boundaryMs - 80) return null;
  if (left.endMs !== finding.boundaryMs || right.startMs !== finding.boundaryMs) return null;
  if (gap.midpointMs <= left.startMs + 200 || gap.midpointMs >= right.endMs - 200) return null;
  return gap.midpointMs;
}

const FRAME_MS = 20;
const EDGE_MS = 180;
const CONTEXT_BEFORE_MS = 1200;
const CONTEXT_AFTER_MS = 300;

/**
 * Analyze 20 ms RMS frames around each contiguous interval boundary. The
 * threshold is relative to the local low-energy floor, with conservative
 * limits for unusually quiet/noisy recordings. Both sides must have sustained
 * activity: an isolated click or a clean pause does not create a finding.
 * "Activity" is deliberately not called speech or a speaker identity.
 */
export function auditBoundaryIntegrity(
  pcm: Int16Array,
  sampleRate: number,
  intervals: SourceInterval[],
  maxSegmentMs = 14_000
): BoundaryIntegrityFinding[] {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("A positive PCM sample rate is required.");
  const findings: BoundaryIntegrityFinding[] = [];
  for (let i = 0; i + 1 < intervals.length; i++) {
    const left = intervals[i]!, right = intervals[i + 1]!;
    if (left.endMs !== right.startMs || left.endMs <= left.startMs || right.endMs <= right.startMs) continue;
    const at = left.endMs;
    if (at < EDGE_MS || at + EDGE_MS > pcm.length * 1000 / sampleRate) continue;
    const frames = rmsFrames(pcm, sampleRate, Math.max(0, at - CONTEXT_BEFORE_MS),
      Math.min(pcm.length * 1000 / sampleRate, at + CONTEXT_AFTER_MS));
    if (frames.length < 10) continue;
    const floor = percentile(frames.map(frame => frame.db), 0.15);
    const threshold = Math.max(-45, Math.min(-24, floor + 10));
    const before = frames.filter(frame => frame.midMs >= at - EDGE_MS && frame.midMs < at - 20);
    const after = frames.filter(frame => frame.midMs >= at + 20 && frame.midMs < at + EDGE_MS);
    if (!sustainedActivity(before, threshold) || !sustainedActivity(after, threshold)) continue;
    const quietGap = latestQuietGap(frames, at, threshold);
    findings.push({
      leftIndex: i,
      rightIndex: i + 1,
      boundaryMs: at,
      noiseFloorDb: round(floor),
      activityThresholdDb: round(threshold),
      leftActivityDb: round(median(before.map(frame => frame.db))),
      rightActivityDb: round(median(after.map(frame => frame.db))),
      quietGap,
      atMaxSegmentLength: Math.abs(left.endMs - left.startMs - maxSegmentMs) <= FRAME_MS
    });
  }
  return findings;
}

interface Frame { midMs: number; db: number }

function rmsFrames(pcm: Int16Array, sampleRate: number, startMs: number, endMs: number): Frame[] {
  const frameSamples = Math.max(1, Math.round(sampleRate * FRAME_MS / 1000));
  const first = Math.max(0, Math.floor(startMs * sampleRate / 1000));
  const last = Math.min(pcm.length, Math.ceil(endMs * sampleRate / 1000));
  const frames: Frame[] = [];
  for (let start = first; start + frameSamples <= last; start += frameSamples) {
    let energy = 0;
    for (let j = start; j < start + frameSamples; j++) energy += pcm[j]! * pcm[j]!;
    const rms = Math.sqrt(energy / frameSamples) / 32768;
    frames.push({ midMs: (start + frameSamples / 2) * 1000 / sampleRate, db: rms ? 20 * Math.log10(rms) : -100 });
  }
  return frames;
}

function sustainedActivity(frames: Frame[], threshold: number): boolean {
  return frames.length >= 5 && frames.filter(frame => frame.db >= threshold).length >= Math.ceil(frames.length * 0.6)
    && median(frames.map(frame => frame.db)) >= threshold + 3;
}

function latestQuietGap(frames: Frame[], at: number, threshold: number): BoundaryIntegrityFinding["quietGap"] {
  let runStart: number | null = null;
  let latest: BoundaryIntegrityFinding["quietGap"] = null;
  for (const frame of frames) {
    if (frame.midMs >= at - 100) break;
    if (frame.db < threshold - 3) {
      runStart ??= frame.midMs - FRAME_MS / 2;
    } else if (runStart !== null) {
      const end = frame.midMs - FRAME_MS / 2;
      if (end - runStart >= 250 && end >= at - 650) {
        latest = { startMs: Math.round(runStart), endMs: Math.round(end), midpointMs: Math.round((runStart + end) / 2) };
      }
      runStart = null;
    }
  }
  return latest;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
}
function median(values: number[]): number { return percentile(values, 0.5); }
function round(value: number): number { return Math.round(value * 10) / 10; }
