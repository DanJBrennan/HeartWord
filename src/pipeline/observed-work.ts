import { randomUUID } from "node:crypto";

/** Evidence of code actually executing in this process, never a dispatcher or
 * saved approval. After a restart a retained running lease is uncertain until
 * reconciled; a PID or old timestamp alone cannot prove that work is alive. */
export interface ObservedWork { id: string; projectId: string; stage: string; subjectId: string | null; startedAt: number; }
const active = new Map<string, ObservedWork>();
export function beginObservedWork(projectId: string, stage: string, subjectId: string | null = null) {
  const id = randomUUID();
  active.set(id, { id, projectId, stage, subjectId, startedAt: Date.now() });
  return () => { active.delete(id); };
}
export function observedWork(projectId: string): ObservedWork[] {
  return [...active.values()].filter(work => work.projectId === projectId);
}
export async function observeWork<T>(projectId: string, stage: string, run: () => Promise<T>, subjectId: string | null = null): Promise<T> {
  const finish = beginObservedWork(projectId, stage, subjectId);
  try { return await run(); } finally { finish(); }
}
