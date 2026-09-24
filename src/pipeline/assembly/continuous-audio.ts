/** Picture edits do not partition the soundtrack. Adjacent placements from
 * the same recording and speaker are extracted as one PCM span, avoiding an
 * encode/decode join at a merely visual or alignment boundary. */
export interface ResolvedAudioPlacement {
  segmentId: string;
  path: string;
  speakerId: string | null;
  sourceStartMs: number;
  sourceEndMs: number;
  startMs: number;
  endMs: number;
}

export interface ContinuousAudioGroup extends Omit<ResolvedAudioPlacement, "segmentId"> {
  segmentIds: string[];
}

export function continuousAudioGroups(placements: ResolvedAudioPlacement[]): ContinuousAudioGroup[] {
  const groups: ContinuousAudioGroup[] = [];
  for (const placement of placements) {
    const previous = groups.at(-1);
    if (previous && previous.path === placement.path && previous.speakerId === placement.speakerId &&
        previous.sourceEndMs === placement.sourceStartMs && previous.endMs === placement.startMs) {
      previous.sourceEndMs = placement.sourceEndMs;
      previous.endMs = placement.endMs;
      previous.segmentIds.push(placement.segmentId);
    } else groups.push({
      path: placement.path, speakerId: placement.speakerId,
      sourceStartMs: placement.sourceStartMs, sourceEndMs: placement.sourceEndMs,
      startMs: placement.startMs, endMs: placement.endMs, segmentIds: [placement.segmentId]
    });
  }
  return groups;
}
