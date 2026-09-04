/**
 * The shared contract every pipeline stage implements — see "Stage
 * isolation" in docs/ARCHITECTURE.md: each stage reads its inputs from the
 * database and the asset area, writes its outputs back there, and can be
 * re-run alone against another stage's already-saved output.
 */
export interface StageResult {
  ok: boolean;
  /** Human-readable reasoning log for this run, per AGENTS.md's working
   *  conventions ("log reasoning so a human can review and correct it"). */
  reasoning: string;
}

export type Stage = (projectId: string) => Promise<StageResult>;
