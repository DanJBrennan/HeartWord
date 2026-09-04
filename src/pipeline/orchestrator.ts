/**
 * Queue-free, in-process stage orchestrator — see "Stage orchestration" in
 * docs/ARCHITECTURE.md. One producer, one machine: stages run in sequence
 * for a given project, each stage's completion (and reasoning) is recorded
 * before the next stage starts, and any stage can also be invoked directly
 * for a re-run per Stage isolation.
 */
import { getDb } from "../db/client.js";
import { runAssembly } from "./assembly/index.js";
import { runCasting } from "./casting/index.js";
import { runIngestion } from "./ingestion/index.js";
import { runMediaGeneration } from "./media-generation/index.js";
import { runQualityControl } from "./qc/index.js";
import { runSceneBreakdown } from "./scene-breakdown/index.js";
import type { Stage, StageResult } from "./types.js";
import { runVoiceLipSync } from "./voice-lipsync/index.js";

const STAGES: Array<{ name: string; run: Stage }> = [
  { name: "ingestion", run: runIngestion },
  { name: "scene_breakdown", run: runSceneBreakdown },
  { name: "casting", run: runCasting },
  { name: "media_generation", run: runMediaGeneration },
  { name: "voice_lipsync", run: runVoiceLipSync },
  { name: "assembly", run: runAssembly },
  { name: "qc", run: runQualityControl }
];

export interface OrchestratorRunResult {
  projectId: string;
  results: Array<{ stage: string } & StageResult>;
  stoppedAt?: string;
}

/**
 * Runs every stage in order for a project, starting from its current
 * `stage` column, stopping at the first stage that doesn't succeed (none
 * do yet — every stage is currently a stub, see src/pipeline/*\/index.ts).
 */
export async function runPipeline(projectId: string): Promise<OrchestratorRunResult> {
  const db = getDb();
  const results: OrchestratorRunResult["results"] = [];

  for (const stage of STAGES) {
    const result = await stage.run(projectId);
    results.push({ stage: stage.name, ...result });

    db.prepare(`UPDATE projects SET stage = ?, updated_at = ? WHERE id = ?`).run(
      stage.name,
      Date.now(),
      projectId
    );

    if (!result.ok) {
      return { projectId, results, stoppedAt: stage.name };
    }
  }

  return { projectId, results };
}
