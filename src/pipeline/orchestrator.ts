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
 * Runs stages in order and stops at a review hold or unfinished stage.
 * Existing shot plans resume after ingestion and scene breakdown.
 */
export async function runPipeline(projectId: string): Promise<OrchestratorRunResult> {
  const db = getDb();
  const results: OrchestratorRunResult["results"] = [];

  // Resuming must preserve the storyboard, takes and manual edits beneath it.
  const hasShots = db.prepare(`SELECT s.id FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE sc.project_id = ? LIMIT 1`).get(projectId);
  for (const stage of hasShots ? STAGES.slice(2) : STAGES) {
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
