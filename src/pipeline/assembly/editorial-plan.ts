import type { AudioPlacement, CrewBrief, CrewContribution } from "../creative-direction/crew-types.js";

export function planEditorialCut(brief: CrewBrief, editor: CrewContribution): {
  durationMs: number; audioMap: AudioPlacement[]; timeline: Array<{ shotId: string; startMs: number; endMs: number; sourceStartMs: number }>
} {
  if (!editor.edits?.length) throw new Error("The Picture Editor must supply a cut using available clips.");
  const pauses = editor.pauses ?? [];
  if (new Set(pauses.map(p => p.afterSegmentId)).size !== pauses.length) throw new Error("Duplicate pause boundary.");
  for (const pause of pauses) if (!Number.isFinite(pause.durationMs) || pause.durationMs <= 0 || pause.durationMs > 120000 ||
      (pause.afterSegmentId !== null && !brief.audio.some(a => a.id === pause.afterSegmentId))) throw new Error("Invalid pause boundary or duration.");
  for (const pause of pauses) {
    const boundary = brief.audio.find(a => a.id === pause.afterSegmentId);
    if (boundary?.speechRun && boundary.endMs < boundary.speechRun.endMs && !boundary.safePauseAfter) throw new Error("Internal continuous-speech pause needs independently reviewed phrase-boundary evidence.");
  }
  let cursor = pauses.find(p => p.afterSegmentId === null)?.durationMs ?? 0;
  const audioMap = brief.audio.map(a => {
    const startMs = cursor; cursor += a.endMs - a.startMs;
    const placement = { segmentId: a.id, sourceStartMs: a.startMs, sourceEndMs: a.endMs, startMs, endMs: cursor };
    cursor += pauses.find(p => p.afterSegmentId === a.id)?.durationMs ?? 0;
    return placement;
  });
  const durationMs = cursor;
  cursor = 0;
  const timeline = editor.edits.map(edit => {
    const shot = brief.shots.find(s => s.id === edit.shotId);
    if (!shot?.clip || !Number.isFinite(edit.durationMs) || edit.durationMs <= 0 || !Number.isFinite(edit.sourceStartMs) || edit.sourceStartMs < 0 || edit.sourceStartMs + edit.durationMs > shot.clip.durationMs + 1) throw new Error("Editor selected unavailable footage or extended a clip beyond its content.");
    const startMs = cursor; cursor += edit.durationMs;
    if (shot.needsLipSync) {
      const matching = audioMap.filter(p => {
        const segment = brief.audio.find(a => a.id === p.segmentId)!;
        if (shot.utterance?.speechRunId) return segment.speechRun?.id === shot.utterance.speechRunId && segment.endMs > shot.utterance.startMs && segment.startMs < shot.utterance.endMs;
        return shot.sourceSegmentId
          ? segment.id === shot.sourceSegmentId
          : segment.speakerId === shot.dialogueCharacterId && segment.verseRef === shot.verseRef;
      });
      if (!matching.length || (!shot.utterance?.speechRunId && matching.length !== 1)) throw new Error("Edit would move a lip-synced mouth away from its actual dialogue.");
      const first = matching[0]!, last = matching.at(-1)!;
      const firstSource = brief.audio.find(a => a.id === first.segmentId)!, lastSource = brief.audio.find(a => a.id === last.segmentId)!;
      const expectedStart = first.startMs + (shot.utterance ? shot.utterance.startMs - firstSource.startMs : 0);
      const expectedEnd = last.endMs - (shot.utterance ? lastSource.endMs - shot.utterance.endMs : 0);
      if (matching.some((p, i) => i > 0 && p.startMs !== matching[i - 1]!.endMs) || Math.abs(startMs - edit.sourceStartMs - expectedStart) > 50 || cursor > expectedEnd + 50) throw new Error("Edit would move a lip-synced mouth away from its actual dialogue.");
    }
    return { shotId: edit.shotId, startMs, endMs: cursor, sourceStartMs: edit.sourceStartMs };
  });
  if (Math.abs(cursor - durationMs) > 50) throw new Error(`Cut needs ${durationMs}ms including intentional pauses, but selected footage covers ${cursor}ms. Request the missing coverage.`);
  return { durationMs, audioMap, timeline };
}

export function validateSourcePlacements(brief: CrewBrief): string[] {
  const render = brief.render;
  if (!render?.audioMap?.length) return ["Missing source-to-production audio mapping; completeness cannot be inferred from total duration."];
  if (render.audioMap.length !== brief.audio.length) return ["Source audio segments were omitted or duplicated."];
  const errors: string[] = [];
  let previousEnd = 0;
  render.audioMap.forEach((placement, index) => {
    const source = brief.audio[index]!;
    if (placement.segmentId !== source.id || placement.sourceStartMs !== source.startMs || placement.sourceEndMs !== source.endMs) errors.push("The complete source performance must remain in its original order.");
    if (!Number.isFinite(placement.startMs) || !Number.isFinite(placement.endMs) || placement.startMs < previousEnd || placement.endMs > render.durationMs + 50 ||
        Math.abs((placement.endMs - placement.startMs) - (source.endMs - source.startMs)) > 1) errors.push("Source audio was stretched, overlapped, truncated or placed beyond the cut.");
    previousEnd = placement.endMs;
  });
  return [...new Set(errors)];
}
