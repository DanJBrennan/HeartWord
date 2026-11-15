/** Picture edits do not partition the soundtrack. Adjacent placements from
 * the same recording and speaker are extracted as one PCM span, avoiding an
 * encode/decode join at a merely visual or alignment boundary. */
export interface ResolvedAudioPlacement {
  segmentId: string;
  path: string;
  speakerId: string | null;
  /** The cast master replaces the narrator for an attributed source turn.
   * Picture edits may change freely inside that turn, but this choice may not. */
  voice: "original" | "cast";
  sourceStartMs: number;
  sourceEndMs: number;
  startMs: number;
  endMs: number;
}

export interface ContinuousAudioGroup extends Omit<ResolvedAudioPlacement, "segmentId"> {
  segmentIds: string[];
}

/**
 * Makes the source-speaker rule explicit at the assembly boundary.  A camera
 * cut is never an audio handoff: an attributed source interval always gets
 * the approved cast master, while an unattributed interval retains the
 * original narrator recording.  This runs before FFmpeg is allowed to render
 * so a bad soundtrack cannot become a review candidate.
 */
export function assertSpeakerAudioContinuity(
  source: Array<{ id: string; startMs: number; endMs: number; speakerId: string | null }>,
  placements: ResolvedAudioPlacement[]
): void {
  if (source.length !== placements.length) throw new Error("Assembly omitted or duplicated a source audio interval.");
  for (const [index, segment] of source.entries()) {
    const placement = placements[index]!;
    if (placement.segmentId !== segment.id || placement.sourceEndMs - placement.sourceStartMs !== segment.endMs - segment.startMs ||
        placement.endMs - placement.startMs !== segment.endMs - segment.startMs) {
      throw new Error(`Assembly changed the protected source duration for ${segment.id}.`);
    }
    const expectedVoice = segment.speakerId ? "cast" : "original";
    if (placement.voice !== expectedVoice || placement.speakerId !== segment.speakerId) {
      const owner = segment.speakerId ?? "the narrator";
      throw new Error(`Speaker-audio continuity failed for ${segment.id}: ${owner}'s source interval must use ${expectedVoice} audio throughout, independent of picture coverage.`);
    }
  }
}

export function continuousAudioGroups(placements: ResolvedAudioPlacement[]): ContinuousAudioGroup[] {
  const groups: ContinuousAudioGroup[] = [];
  for (const placement of placements) {
    const previous = groups.at(-1);
    if (previous && previous.path === placement.path && previous.speakerId === placement.speakerId && previous.voice === placement.voice &&
        previous.sourceEndMs === placement.sourceStartMs && previous.endMs === placement.startMs) {
      previous.sourceEndMs = placement.sourceEndMs;
      previous.endMs = placement.endMs;
      previous.segmentIds.push(placement.segmentId);
    } else groups.push({
      path: placement.path, speakerId: placement.speakerId, voice: placement.voice,
      sourceStartMs: placement.sourceStartMs, sourceEndMs: placement.sourceEndMs,
      startMs: placement.startMs, endMs: placement.endMs, segmentIds: [placement.segmentId]
    });
  }
  return groups;
}
