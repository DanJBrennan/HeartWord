/**
 * Input-plan gates for new on-camera performances. These run before a
 * provider request: a render cannot repair a performance planned in the wrong
 * scene or cut through a source word.
 */
export type SourcePause = { startMs: number; endMs: number };

export type PerformanceWindow = {
  sceneId: string;
  setReferenceAttemptId: string | null;
  expectedSetReferenceAttemptId: string;
  sourceStartMs: number;
  sourceEndMs: number;
};

const SNAP_TOLERANCE_MS = 20;
const MIN_PAUSE_MS = 250;
const near = (a: number, b: number) => Math.abs(a - b) <= SNAP_TOLERANCE_MS;

/** Rejects a scene performance that does not cite its one approved set. */
export function assertSetReferenceLock(window: PerformanceWindow): void {
  if (!window.expectedSetReferenceAttemptId.trim()) throw new Error(`Scene ${window.sceneId} has no approved set reference.`);
  if (window.setReferenceAttemptId !== window.expectedSetReferenceAttemptId) {
    throw new Error(`Scene ${window.sceneId} performance must use set reference ${window.expectedSetReferenceAttemptId}.`);
  }
}

/** A performance begins at a source onset and ends at an attested pause.
 * Callers must re-plan failed windows, never trim a phrase to satisfy QC. */
export function assertPauseAlignedPerformanceWindow(window: PerformanceWindow, pauses: SourcePause[]): void {
  if (!Number.isInteger(window.sourceStartMs) || !Number.isInteger(window.sourceEndMs) || window.sourceEndMs <= window.sourceStartMs) {
    throw new Error("Performance window must have a positive integer source interval.");
  }
  const qualifying = pauses.filter(p => Number.isInteger(p.startMs) && Number.isInteger(p.endMs) && p.endMs - p.startMs >= MIN_PAUSE_MS);
  const beginsAtOnset = qualifying.some(pause => near(window.sourceStartMs, pause.endMs));
  const endsAtPause = qualifying.some(pause => near(window.sourceEndMs, pause.startMs));
  if (!beginsAtOnset || !endsAtPause) {
    throw new Error(`Performance ${window.sourceStartMs}-${window.sourceEndMs} ms must start at the end of, and end at the start of, an attested >=${MIN_PAUSE_MS} ms source pause.`);
  }
}

export function assertPerformancePlanReady(window: PerformanceWindow, pauses: SourcePause[]): void {
  assertSetReferenceLock(window);
  assertPauseAlignedPerformanceWindow(window, pauses);
}
