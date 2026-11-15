import type { ProductionView } from "../server/production-view.js";
import type { PreviewInterval } from "../server/producer-preview.js";

export interface PictureSpan { id: string; shotId: string | null; label: string; path: string | null; startMs: number; endMs: number; sourceStartMs: number }
export function pictureTimeline(snapshot: ProductionView, mode: "chapter" | "reel", sceneId = ""): { durationMs: number; spans: PictureSpan[] } {
  if (mode === "reel") {
    let cursor = 0;
    return { spans: snapshot.reel.filter(item => !sceneId || item.sceneId === sceneId).map(item => {
      const startMs = cursor; cursor += item.durationMs;
      return { ...item, startMs, endMs: cursor, sourceStartMs: 0 };
    }), get durationMs() { return cursor; } };
  }
  const spans: PictureSpan[] = []; let cursor = 0;
  for (const [index, placement] of snapshot.programme.timeline.entries()) {
    if (placement.startMs > cursor) spans.push({ id: `gap:${index}`, shotId: null, label: "Unfilled picture interval", path: null, startMs: cursor, endMs: placement.startMs, sourceStartMs: 0 });
    if (placement.shotId === null && placement.editorialBeatId && placement.path) {
      spans.push({ id: `editorial:${placement.editorialBeatId}`, shotId: null, label: placement.label ?? "Approved editorial opening", path: placement.path,
        startMs: placement.startMs, endMs: placement.endMs, sourceStartMs: placement.sourceStartMs });
      cursor = placement.endMs; continue;
    }
    // Saved chapter placement addresses the selected shot's local clock. Never
    // shorten the chapter or freeze a face to cover missing accepted material.
    let local = 0, filled = placement.startMs;
    const shotClips = snapshot.reel.filter(item => item.shotId === placement.shotId);
    // Multiple components need an authoritative assembled shot before they can
    // share an immutable render's shot-local clock. The subset reel can still
    // audition them; dropping a missing component must never shift later takes.
    for (const clip of shotClips.length === 1 ? shotClips : []) {
      const from = Math.max(local, placement.sourceStartMs), to = Math.min(local+clip.durationMs, placement.sourceStartMs+placement.endMs-placement.startMs);
      if (to > from) {
        const startMs = placement.startMs+from-placement.sourceStartMs;
        spans.push({ id: `${index}:${clip.id}`, shotId: placement.shotId, label: clip.label, path: clip.path, startMs, endMs: startMs+to-from, sourceStartMs: from-local });
        filled = startMs+to-from;
      }
      local += clip.durationMs;
    }
    if (filled < placement.endMs) spans.push({ id: `missing:${index}`, shotId: placement.shotId, label: "Awaiting accepted coverage", path: null, startMs: filled, endMs: placement.endMs, sourceStartMs: 0 });
    cursor = placement.endMs;
  }
  if (cursor < snapshot.programme.durationMs) spans.push({ id: "gap:end", shotId: null, label: "Unfilled picture interval", path: null, startMs: cursor, endMs: snapshot.programme.durationMs, sourceStartMs: 0 });
  return { durationMs: snapshot.programme.durationMs, spans };
}
export const intervalAt = <T extends { startMs: number; endMs: number }>(items: T[], ms: number) => items.find(item => item.startMs <= ms && item.endMs > ms);
export const appendedReel = (before: string[], after: string[]) => before.length <= after.length && before.every((item,index) => item === after[index]);
export function previewAudio(snapshot: ProductionView, speech: "source" | "performance" | "off", music: boolean, ambience: boolean): Array<PreviewInterval & { lane: string }> {
  return [...(speech === "off" ? [] : snapshot.programme[speech].map(item => ({ ...item, lane: "speech" }))),
    ...snapshot.programme.cues.filter(item => item.kind === "music" ? music : ambience).map(item => ({ ...item, lane: item.kind }))];
}
export function formatTime(ms: number) {
  const value = Math.max(0, Math.floor(ms/1000));
  return `${Math.floor(value/60).toString().padStart(2,"0")}:${(value%60).toString().padStart(2,"0")}.${Math.floor(ms%1000/100).toString()}`;
}
export const clampPanel = (value: number, min: number, max: number) => Math.min(max, Math.max(min,value));
export function performanceClock(position: number, elapsed: number, duration: number, speech?: { currentTime: number; startMs: number; endMs: number; sourceStartMs: number }) {
  return Math.min(duration,speech ? Math.min(speech.endMs,speech.startMs+speech.currentTime*1000-speech.sourceStartMs) : position+elapsed);
}
export function maintainPreviewPlayback(players: Iterable<HTMLMediaElement>, failed: (message: string) => void): boolean {
  const media = [...players];
  if (media.some(element => element.readyState < 2 || element.seeking)) {
    media.forEach(element => element.pause());
    return false;
  }
  for (const element of media) if (element.paused && !element.ended) void element.play().catch(error => { if (error.name !== "AbortError") failed(`Playback paused: ${error.message}`); });
  return true;
}

/** Independent auditions stop the entire coordinated preview, while its
 * intentional stems share one protected speech choice and one clock. */
export function playbackGroup(target: HTMLMediaElement, players: Iterable<HTMLMediaElement>) {
  const group = target.dataset.previewGroup;
  for (const player of players) if (player !== target && (!group || player.dataset.previewGroup !== group)) player.pause();
}
