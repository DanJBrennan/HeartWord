/** Durable, queue-free chapter orchestrator. One desktop producer owns a
 * project at a time; stage_executions is a recovery ledger, not a second
 * pipeline or distributed queue. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/client.js";
import { getDataDir } from "../db/client.js";
import { runAssembly } from "./assembly/index.js";
import { runCasting } from "./casting/index.js";
import { runIngestion } from "./ingestion/index.js";
import { runMediaGeneration } from "./media-generation/index.js";
import { runQualityControl } from "./qc/index.js";
import { runSceneBreakdown } from "./scene-breakdown/index.js";
import type { Stage, StageResult } from "./types.js";
import { runVoiceLipSync } from "./voice-lipsync/index.js";

const STAGES: Array<{ name: string; run: Stage }> = [
  { name: "ingestion", run: runIngestion }, { name: "scene_breakdown", run: runSceneBreakdown }, { name: "casting", run: runCasting }, { name: "media_generation", run: runMediaGeneration }, { name: "voice_lipsync", run: runVoiceLipSync }, { name: "assembly", run: runAssembly }, { name: "qc", run: runQualityControl }
];
export interface OrchestratorRunResult { projectId: string; results: Array<{ stage: string } & StageResult>; stoppedAt?: string; }
type Execution = { id: string; input_hash: string; dependency_hash: string; attempt: number };
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Sign persisted inputs rather than timestamps, so status updates cannot rerun paid work. */
function inputSignature(projectId: string, stage: string): string {
  if (stage === "ingestion") {
    const project = getDb().prepare(`SELECT language,book,chapter FROM projects WHERE id=?`).get(projectId) as { language: string; book: string; chapter: number } | undefined;
    if (!project) return hash({ projectId, missingProject: true });
    const base = join(getDataDir(), "assets", "source", project.language, `${project.book}-${project.chapter}`);
    const files = [`${project.book}-${project.chapter}-text.docx`, `${project.book}-${project.chapter}-fcbh-audio.mp3`];
    // A content hash makes a changed source recording/text invalidate stage 1
    // and every dependent stage; a missing prerequisite has a distinct hash.
    return hash({ project, files: files.map(file => {
      const path = join(base, file); return existsSync(path) ? hash(readFileSync(path)) : `missing:${file}`;
    }) });
  }
  const sql: Record<string, string> = {
    ingestion: `SELECT language,book,chapter FROM projects WHERE id=?`,
    // Ingestion owns source files; its durable completion is the dependency
    // below.  The project identity is the scene-breakdown's local input.
    scene_breakdown: `SELECT language,book,chapter FROM projects WHERE id=?`,
    casting: `SELECT sequence,verse_start,verse_end,summary FROM scenes WHERE project_id=? ORDER BY sequence`,
    media_generation: `SELECT sh.id,sh.action,sh.framing,sh.camera_movement,sh.needs_lip_sync,sh.continuity_notes,group_concat(sc.character_id) characters FROM shots sh JOIN scenes s ON s.id=sh.scene_id LEFT JOIN shot_characters sc ON sc.shot_id=sh.id WHERE s.project_id=? GROUP BY sh.id ORDER BY s.sequence,sh.sequence`,
    voice_lipsync: `SELECT id,source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms`,
    assembly: `SELECT c.id,c.shot_id,c.generation_attempt_id,c.timeline_start_ms,c.timeline_end_ms FROM clips c JOIN shots sh ON sh.id=c.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? ORDER BY s.sequence,sh.sequence,c.timeline_start_ms`,
    qc: `SELECT id,result_asset_path,total_duration_ms FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC LIMIT 1`
  };
  try { return hash(getDb().prepare(sql[stage]!).all(projectId)); } catch { return hash({ projectId, stage, unavailable: true }); }
}
function validCompletion(projectId: string, stage: string, input: string, dependency: string): Execution | undefined {
  return getDb().prepare(`SELECT id,input_hash,dependency_hash,attempt FROM stage_executions WHERE project_id=? AND stage=? AND status='completed' AND input_hash=? AND dependency_hash=? ORDER BY attempt DESC LIMIT 1`).get(projectId, stage, input, dependency) as Execution | undefined;
}

export async function runPipeline(projectId: string): Promise<OrchestratorRunResult> {
  const db = getDb(); const results: OrchestratorRunResult["results"] = []; let dependency = hash("root");
  // Old projects predate the durable ledger.  Their scenes/shots can have
  // accepted takes and hand edits, so never infer that re-running ingestion
  // is safe merely because no stage_executions rows exist.
  const ledgerCount = (db.prepare(`SELECT COUNT(*) count FROM stage_executions WHERE project_id=?`).get(projectId) as { count: number }).count;
  const legacyShots = (db.prepare(`SELECT COUNT(*) count FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?`).get(projectId) as { count: number }).count;
  if (ledgerCount === 0 && legacyShots > 0) {
    const reasoning = "Recovery hold: this existing chapter predates durable orchestration and has a saved shot plan. Adopt its verified stage history explicitly before a pipeline run; no ingestion, replanning, deletion, or provider call was made.";
    return { projectId, results: [{ stage: "ingestion", ok: false, reasoning }], stoppedAt: "ingestion" };
  }
  for (const stage of STAGES) {
    const input = inputSignature(projectId, stage.name); const done = validCompletion(projectId, stage.name, input, dependency);
    if (done) { results.push({ stage: stage.name, ok: true, reasoning: `Reused valid ${stage.name} execution ${done.id}; inputs and upstream outputs are unchanged.` }); dependency = hash([dependency, done.id, input]); continue; }
    const id = randomUUID(), worker = randomUUID(); let active: { id: string; status: string } | undefined;
    // The check and lease insert must be one SQLite critical section.  A
    // second desktop process therefore observes the lease before it can call
    // a provider, rather than racing through two independent SELECTs.
    db.exec("BEGIN IMMEDIATE");
    try {
      active = db.prepare(`SELECT id,status FROM stage_executions WHERE project_id=? AND stage=? AND status IN ('running','uncertain') ORDER BY started_at DESC LIMIT 1`).get(projectId, stage.name) as { id: string; status: string } | undefined;
      if (!active) {
        const attempt = (db.prepare(`SELECT COALESCE(MAX(attempt),0)+1 next FROM stage_executions WHERE project_id=? AND stage=?`).get(projectId, stage.name) as { next: number }).next;
        db.prepare(`INSERT INTO stage_executions (id,project_id,stage,input_hash,dependency_hash,status,attempt,reason,started_at,worker_token) VALUES (?,?,?,?,?,'running',?,'Started by local producer.',?,?)`).run(id, projectId, stage.name, input, dependency, attempt, Date.now(), worker);
      }
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no transaction to roll back */ } throw error; }
    if (active) { const reasoning = `Recovery hold: ${stage.name} execution ${active.id} is ${active.status}; reconcile its provider/result evidence before retrying, so no duplicate request is sent.`; results.push({ stage: stage.name, ok: false, reasoning }); return { projectId, results, stoppedAt: stage.name }; }
    let result: StageResult;
    try { result = await stage.run(projectId); } catch (error) { result = { ok: false, reasoning: `Stage threw before a final result: ${(error as Error).message}` }; }
    db.prepare(`UPDATE stage_executions SET status=?,reason=?,output_json=?,completed_at=? WHERE id=? AND worker_token=? AND status='running'`).run(result.ok ? "completed" : "held", result.reasoning, JSON.stringify(result), Date.now(), id, worker);
    db.prepare(`UPDATE projects SET stage=?,status=?,updated_at=? WHERE id=?`).run(stage.name, result.ok ? "in_progress" : "held", Date.now(), projectId);
    results.push({ stage: stage.name, ...result }); if (!result.ok) return { projectId, results, stoppedAt: stage.name };
    dependency = hash([dependency, id, input]);
  }
  return { projectId, results };
}
