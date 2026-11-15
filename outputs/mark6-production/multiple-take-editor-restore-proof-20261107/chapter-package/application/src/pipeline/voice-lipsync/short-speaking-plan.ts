export interface QuietSampleInterval { startSample: number; endSample: number }
export interface SpeakingSection {
  index: number; sourceStartSample: number; sourceEndSample: number;
  pictureStartFrame: number; retainedFrames: number; lastRetainedFrameIndex: number;
  reference: { kind: "approved_start" } | { kind: "previous_last_retained_frame"; sectionIndex: number };
  generationContainerSeconds: 5; tailPaddingSamples: number; boundaryReason: string;
}

/** Partition a source-bound complete performance, never synthesized speech.
 * Pictures join on the frame clock, audio slices partition the original sample
 * clock exactly, and assembly uses ONE original full-line audio track. */
export function planShortSpeaking(input: { sampleRate: number; sampleCount: number; fps?: number; quiet?: QuietSampleInterval[] }) {
  const { sampleRate, sampleCount } = input, fps = input.fps ?? 24;
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !Number.isSafeInteger(sampleCount) || sampleCount < 1 || fps !== 24) throw new Error("LTX speaking planning requires valid original samples and 24 fps.");
  const quiet = input.quiet ?? [];
  if (quiet.some(q => !Number.isSafeInteger(q.startSample) || !Number.isSafeInteger(q.endSample) || q.startSample < 0 || q.endSample <= q.startSample || q.endSample > sampleCount)) throw new Error("Quiet intervals must be measured inside the original performance.");
  const seconds = sampleCount / sampleRate, totalFrames = Math.ceil(seconds * fps), maxFrames = 4 * fps;
  const sectionCount = Math.min(totalFrames, Math.max(Math.ceil(seconds / 4), Math.round(seconds / 3), 1));
  const sections: SpeakingSection[] = [];
  let frame = 0, sample = 0;
  for (let index = 0; index < sectionCount; index++) {
    const remaining = sectionCount - index - 1;
    const minimum = Math.max(frame + 1, totalFrames - remaining * maxFrames);
    const maximum = Math.min(frame + maxFrames, totalFrames - remaining);
    const target = Math.max(minimum, Math.min(maximum, Math.round((index + 1) * totalFrames / sectionCount)));
    let boundary = remaining === 0 ? totalFrames : target;
    let boundaryReason = remaining === 0 ? "Complete original line endpoint; final picture frame may outlast audio by less than one frame." : "Balanced frame boundary; no measured quiet boundary selected. Review the audible/visible join.";
    if (remaining > 0) {
      const candidates = quiet.flatMap(q => {
        const first = Math.max(minimum, Math.ceil(q.startSample * fps / sampleRate));
        const last = Math.min(maximum, Math.floor(q.endSample * fps / sampleRate));
        return first <= last ? [Math.max(first, Math.min(last, target))] : [];
      }).sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
      if (candidates.length) { boundary = candidates[0]!; boundaryReason = "Frame-aligned cut inside measured source quiet, nearest balanced short-section target."; }
    }
    const endSample = remaining === 0 ? sampleCount : Math.round(boundary * sampleRate / fps);
    const retainedFrames = boundary - frame;
    if (endSample <= sample || endSample - sample > sampleRate * 4 || retainedFrames < 1 || retainedFrames > maxFrames) throw new Error("Speaking section cannot preserve source/frame bounds within four seconds.");
    sections.push({ index, sourceStartSample: sample, sourceEndSample: endSample, pictureStartFrame: frame,
      retainedFrames, lastRetainedFrameIndex: retainedFrames - 1,
      reference: index === 0 ? { kind: "approved_start" } : { kind: "previous_last_retained_frame", sectionIndex: index - 1 },
      generationContainerSeconds: 5, tailPaddingSamples: 5 * sampleRate - (endSample - sample), boundaryReason });
    frame = boundary; sample = endSample;
  }
  // A fixed number of balanced sections can miss an available quiet-only route.
  // Prefer a complete route through measured quiet even when it needs another
  // container. If speech has a >4s quiet-free run, retain the explicit review
  // finding above rather than inventing a safe boundary or dropping samples.
  if (quiet.length && sections.slice(0, -1).some(s => !s.boundaryReason.startsWith("Frame-aligned cut inside measured source quiet"))) {
    const nodes = new Set<number>([0, totalFrames]);
    for (const q of quiet) {
      const first = Math.max(1, Math.ceil(q.startSample * fps / sampleRate));
      const last = Math.min(totalFrames - 1, Math.floor(q.endSample * fps / sampleRate));
      for (let f = first; f <= last; f++) {
        const at = Math.round(f * sampleRate / fps);
        if (at >= q.startSample && at <= q.endSample) nodes.add(f);
      }
    }
    const ordered = [...nodes].sort((a, b) => a - b);
    const costs = new Map<number, number>([[0, 0]]), previous = new Map<number, number>();
    for (let i = 1; i < ordered.length; i++) {
      const endFrame = ordered[i]!, end = endFrame === totalFrames ? sampleCount : Math.round(endFrame * sampleRate / fps);
      for (let j = i - 1; j >= 0; j--) {
        const startFrame = ordered[j]!, length = endFrame - startFrame;
        if (length > maxFrames) break;
        const start = Math.round(startFrame * sampleRate / fps), prefix = costs.get(startFrame);
        if (prefix === undefined || end <= start || end - start > sampleRate * 4) continue;
        const cost = prefix + 1 + ((length / fps - 3) / 3) ** 2;
        if (cost < (costs.get(endFrame) ?? Infinity)) { costs.set(endFrame, cost); previous.set(endFrame, startFrame); }
      }
    }
    if (previous.has(totalFrames)) {
      const boundaries: number[] = [];
      for (let at = totalFrames; at > 0; at = previous.get(at)!) boundaries.push(at);
      boundaries.reverse(); sections.length = 0; frame = 0; sample = 0;
      for (const [index, boundary] of boundaries.entries()) {
        const endSample = boundary === totalFrames ? sampleCount : Math.round(boundary * sampleRate / fps);
        const retainedFrames = boundary - frame;
        sections.push({ index, sourceStartSample: sample, sourceEndSample: endSample, pictureStartFrame: frame,
          retainedFrames, lastRetainedFrameIndex: retainedFrames - 1,
          reference: index === 0 ? { kind: "approved_start" } : { kind: "previous_last_retained_frame", sectionIndex: index - 1 },
          generationContainerSeconds: 5, tailPaddingSamples: 5 * sampleRate - (endSample - sample),
          boundaryReason: boundary === totalFrames
            ? "Complete original line endpoint; final picture frame may outlast audio by less than one frame."
            : "Frame-aligned cut inside measured source quiet; complete quiet-only route replaces a balanced join during speech." });
        frame = boundary; sample = endSample;
      }
    }
  }
  return { sampleRate, sampleCount, fps, totalFrames, sections,
    assemblyAudio: "one_continuous_original_full_line" as const, sourceSpeed: 1,
    acceptance: "Complete assembled-line audiovisual review required; valid partitioning does not establish lip-sync, identity, caption removal or join quality." };
}
