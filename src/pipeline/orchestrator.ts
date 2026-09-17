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
import { hasCurrentSourceReview } from "./ingestion/source-review.js";

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
    casting: `SELECT sc.sequence,sc.verse_start,sc.verse_end,sc.summary,c.id character_id,c.updated_at,cv.id version_id,cv.status,cv.voice_id FROM scenes sc LEFT JOIN characters c ON c.canon_status='approved' LEFT JOIN character_versions cv ON cv.character_id=c.id WHERE sc.project_id=? ORDER BY sc.sequence,c.id,cv.id`,
    media_generation: `SELECT sh.id,sh.action,sh.framing,sh.camera_movement,sh.needs_lip_sync,sh.continuity_notes,sc.character_id,cv.id version_id,cv.status,ca.path,ca.content_hash FROM shots sh JOIN scenes s ON s.id=sh.scene_id LEFT JOIN shot_characters sc ON sc.shot_id=sh.id LEFT JOIN character_versions cv ON cv.character_id=sc.character_id AND cv.status='approved' LEFT JOIN character_assets ca ON ca.character_version_id=cv.id WHERE s.project_id=? ORDER BY s.sequence,sh.sequence,sc.character_id,ca.id`,
    voice_lipsync: `SELECT a.id,a.source_path,a.start_ms,a.end_ms,a.speaker_character_id,a.verse_ref,ub.source_audio_segment_id,ub.source_start_ms,ub.source_end_ms,ub.source_hash,ub.character_version_id,cv.status,cv.voice_id FROM audio_segments a LEFT JOIN shot_utterance_bindings ub ON ub.source_audio_segment_id=a.id LEFT JOIN character_versions cv ON cv.id=ub.character_version_id WHERE a.project_id=? AND a.layer='original_reading' ORDER BY a.start_ms,ub.id`,
    assembly: `SELECT c.id,c.shot_id,c.generation_attempt_id,c.timeline_start_ms,c.timeline_end_ms FROM clips c JOIN shots sh ON sh.id=c.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? ORDER BY s.sequence,sh.sequence,c.timeline_start_ms`,
    qc: `SELECT id,result_asset_path,total_duration_ms FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC LIMIT 1`
  };
  // Do not turn a failed signature query into a stable cache key: that would
  // make an unavailable dependency look safely reusable. Surface the error
  // to the caller, which leaves the run without a completed lease.
  return hash(getDb().prepare(sql[stage]!).all(projectId));
}
function outputIsStillUsable(projectId: string, stage: string): boolean {
  const db = getDb();
  const file = (path: string | null) => !!path && existsSync(join(getDataDir(), "assets", path));
  switch (stage) {
    case "ingestion": {
      const segments = (db.prepare("SELECT COUNT(*) count FROM audio_segments WHERE project_id=? AND layer='original_reading'").get(projectId) as { count: number }).count;
      const unresolved = (db.prepare("SELECT COUNT(*) count FROM review_notes WHERE project_id=? AND source='qc' AND resolved=0 AND (subject_type='audio_segment' OR (subject_type='project' AND note LIKE 'Ingestion%'))").get(projectId) as { count: number }).count;
      const lowConfidence=(db.prepare("SELECT COUNT(*) count FROM audio_segments WHERE project_id=? AND layer='original_reading' AND confidence < 80").get(projectId) as {count:number}).count;
      const reviewed=lowConfidence > 0 && hasCurrentSourceReview(db,projectId);
      return segments > 0 && (unresolved === 0 || reviewed) && (lowConfidence === 0 || reviewed);
    }
    case "scene_breakdown": return (db.prepare("SELECT COUNT(*) count FROM scenes WHERE project_id=?").get(projectId) as { count: number }).count > 0;
    case "casting": return (db.prepare("SELECT COUNT(*) count FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=?").get(projectId) as { count: number }).count > 0;
    case "media_generation": {
      const missing = db.prepare(`SELECT COUNT(*) count FROM shots sh JOIN scenes s ON s.id=sh.scene_id
        WHERE s.project_id=? AND (NOT EXISTS (SELECT 1 FROM generation_attempts ga WHERE ga.shot_id=sh.id AND ga.operation='generate' AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL)
        OR (sh.needs_lip_sync=0 AND NOT EXISTS (SELECT 1 FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.shot_id=sh.id AND ga.operation='generate_final_video' AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL)))`).get(projectId) as { count: number };
      if (missing.count) return false;
      return (db.prepare(`SELECT result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL`).all(projectId) as Array<{ result_asset_path: string }>).every(row => file(row.result_asset_path));
    }
    case "voice_lipsync": {
      const missing = db.prepare(`SELECT COUNT(*) count FROM shots sh JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? AND sh.needs_lip_sync=1 AND NOT EXISTS (SELECT 1 FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.shot_id=sh.id AND ga.operation='lip_sync' AND ga.status='accepted' AND ga.result_asset_path IS NOT NULL)`).get(projectId) as { count: number };
      if (missing.count) return false;
      const media = db.prepare(`SELECT ga.result_asset_path FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes s ON s.id=sh.scene_id WHERE s.project_id=? AND ga.operation='lip_sync' AND ga.status='accepted'`).all(projectId) as Array<{result_asset_path:string}>;
      const master = db.prepare("SELECT source_path FROM audio_segments WHERE project_id=? AND layer='composite_cast_master'").all(projectId) as Array<{source_path:string}>;
      return media.every(row => file(row.result_asset_path)) && master.length > 0 && master.every(row => file(row.source_path));
    }
    case "assembly": return (db.prepare("SELECT result_asset_path FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC LIMIT 1").all(projectId) as Array<{ result_asset_path: string }>).some(row => file(row.result_asset_path));
    // This predicate is also evaluated while the current QC lease is still
    // `running`, immediately after runQualityControl returns. Requiring this
    // very ledger row to be `completed` made a successful review impossible
    // to commit: the orchestrator would turn it back into a hold before it
    // could write completion. The retained approved finishing review is the
    // actual QC output; the ledger records that validated result afterwards.
    case "qc": return outputIsStillUsable(projectId, "assembly") && !!db.prepare(`SELECT id FROM production_runs WHERE project_id=? AND phase='finishing' AND status='approved' ORDER BY completed_at DESC LIMIT 1`).get(projectId)
      || outputIsStillUsable(projectId, "assembly") && !!db.prepare(`SELECT id FROM stage_executions WHERE project_id=? AND stage='qc' AND status='completed' LIMIT 1`).get(projectId);
    default: return false;
  }
}

/**
 * Explicit producer recovery action for chapters created before the ledger,
 * or after a deliberate human reconciliation. It records only stages whose
 * currently persisted outputs satisfy the same checks used for normal reuse;
 * it never manufactures media, changes source rows, or approves candidates.
 */
export function adoptRecoveredPipeline(projectId: string, adoptedBy: string): OrchestratorRunResult {
  if (!adoptedBy.trim()) throw new Error("A named producer must adopt recovered work.");
  const db = getDb(); const results: OrchestratorRunResult["results"] = []; let dependency = hash("root");
  for (const stage of STAGES) {
    const input = inputSignature(projectId, stage.name);
    // Adoption is evidence reconciliation, not a way to seize an active
    // worker's lease.  That worker may still be crossing a provider boundary.
    const active = db.prepare(`SELECT id,status FROM stage_executions WHERE project_id=? AND stage=? AND status IN ('running','uncertain') ORDER BY started_at DESC LIMIT 1`).get(projectId, stage.name) as {id:string;status:string}|undefined;
    if (active) {
      const reasoning = `Recovery hold: ${stage.name} execution ${active.id} is ${active.status}; it must be explicitly reconciled before adoption can continue.`;
      results.push({ stage: stage.name, ok: false, reasoning }); return { projectId, results, stoppedAt: stage.name };
    }
    const current = validCompletion(projectId, stage.name, input, dependency);
    if (current) { results.push({ stage: stage.name, ok: true, reasoning: `Existing execution ${current.id} is still valid.` }); dependency = hash([dependency, current.id, input]); continue; }
    if (!outputIsStillUsable(projectId, stage.name)) {
      const reasoning = `Recovery hold: ${stage.name} has no complete current output (or still has unresolved source/QC evidence). It was not adopted and no work was changed.`;
      results.push({ stage: stage.name, ok: false, reasoning }); return { projectId, results, stoppedAt: stage.name };
    }
    const id = randomUUID();
    const attempt = (db.prepare(`SELECT COALESCE(MAX(attempt),0)+1 next FROM stage_executions WHERE project_id=? AND stage=?`).get(projectId, stage.name) as { next:number }).next;
    db.prepare(`INSERT INTO stage_executions (id,project_id,stage,input_hash,dependency_hash,status,attempt,reason,output_json,started_at,completed_at,worker_token) VALUES (?,?,?,?,?,'completed',?,?,?,?,?,?)`).run(id, projectId, stage.name, input, dependency, attempt, `Producer ${adoptedBy.trim()} adopted existing outputs after local validation.`, JSON.stringify({ adopted: true }), Date.now(), Date.now(), `adopted:${adoptedBy.trim()}`);
    results.push({ stage: stage.name, ok: true, reasoning: `Adopted current ${stage.name} output as execution ${id}; no provider call was made.` });
    dependency = hash([dependency, id, input]);
  }
  db.prepare("UPDATE projects SET stage=?,status='in_progress',updated_at=? WHERE id=?").run(STAGES.at(-1)!.name, Date.now(), projectId);
  return { projectId, results };
}

/**
 * Explicit, local reconciliation of an uncertain request.  It never retries a
 * provider call: a named producer may only close the lease after the current
 * retained outputs pass the same file checks as ordinary reuse.  The returned
 * completion remains bound to the original signed inputs and dependency chain.
 */
export function reconcileUncertainExecution(projectId: string, executionId: string, reconciledBy: string): void {
  if (!reconciledBy.trim()) throw new Error("A named producer must reconcile uncertain work.");
  const db = getDb();
  const execution = db.prepare("SELECT id,stage,input_hash,dependency_hash,status FROM stage_executions WHERE id=? AND project_id=?").get(executionId, projectId) as {id:string;stage:string;input_hash:string;dependency_hash:string;status:string}|undefined;
  if (!execution || execution.status !== "uncertain") throw new Error("Only an uncertain execution can be reconciled.");
  if (!STAGES.some(s => s.name === execution.stage)) throw new Error("Unknown pipeline stage cannot be reconciled.");
  let dependency = hash("root");
  for (const stage of STAGES) {
    if (stage.name === execution.stage) break;
    const input = inputSignature(projectId, stage.name), prior = validCompletion(projectId, stage.name, input, dependency);
    if (!prior) throw new Error("An upstream output is missing or stale; reconciliation cannot approve downstream work.");
    dependency = hash([dependency, prior.id, input]);
  }
  if (execution.dependency_hash !== dependency || execution.input_hash !== inputSignature(projectId, execution.stage) || !outputIsStillUsable(projectId, execution.stage)) throw new Error("Retained outputs are missing or stale; reconciliation cannot approve them.");
  const updated = db.prepare("UPDATE stage_executions SET status='completed',reason=?,output_json=?,completed_at=? WHERE id=? AND status='uncertain'").run(
    `Producer ${reconciledBy.trim()} reconciled verified retained outputs; no provider retry was made.`, JSON.stringify({ reconciled:true }), Date.now(), execution.id);
  if (updated.changes !== 1) throw new Error("The uncertain execution changed before reconciliation completed.");
  db.prepare("UPDATE projects SET stage=?,status='in_progress',updated_at=? WHERE id=?").run(execution.stage, Date.now(), projectId);
}
function validCompletion(projectId: string, stage: string, input: string, dependency: string): Execution | undefined {
  const row = getDb().prepare(`SELECT id,input_hash,dependency_hash,attempt FROM stage_executions WHERE project_id=? AND stage=? AND status='completed' AND input_hash=? AND dependency_hash=? ORDER BY attempt DESC LIMIT 1`).get(projectId, stage, input, dependency) as Execution | undefined;
  return row && outputIsStillUsable(projectId, stage) ? row : undefined;
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
    const reviewReleased = db.prepare("SELECT id,attempt FROM stage_executions WHERE project_id=? AND stage=? AND status='held' AND input_hash=? AND dependency_hash=? ORDER BY attempt DESC LIMIT 1").get(projectId,stage.name,input,dependency) as Execution|undefined;
    if (reviewReleased && outputIsStillUsable(projectId,stage.name)) {
      db.prepare("UPDATE stage_executions SET status='completed',reason=?,completed_at=? WHERE id=? AND status='held'").run("Required retained review is now current; reused without rerunning the stage.",Date.now(),reviewReleased.id);
      results.push({stage:stage.name,ok:true,reasoning:`Reused review-released ${stage.name} execution ${reviewReleased.id}; no stage/provider call was made.`}); dependency=hash([dependency,reviewReleased.id,input]); continue;
    }
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
    let result: StageResult; let uncertain = false;
    try { result = await stage.run(projectId); } catch (error) {
      // A thrown stage can have crossed a provider boundary.  It is not a
      // normal safe hold: retain it as uncertain until a producer reconciles
      // the evidence, preventing a blind paid retry.
      uncertain = true; result = { ok: false, reasoning: `Stage outcome is uncertain after an exception: ${(error as Error).message}. Reconcile retained provider evidence before retrying.` };
    }
    // A stage may have written valid candidate rows while an independent
    // source/QC gate remains unresolved.  Do not advance downstream merely
    // because its implementation returned successfully.
    if (result.ok && !outputIsStillUsable(projectId, stage.name)) {
      result = { ok: false, reasoning: `${result.reasoning} Durable hold: ${stage.name} output remains incomplete or awaits its required review.` };
    }
    const update = db.prepare(`UPDATE stage_executions SET status=?,reason=?,output_json=?,completed_at=? WHERE id=? AND worker_token=? AND status='running'`).run(uncertain ? "uncertain" : result.ok ? "completed" : "held", result.reasoning, JSON.stringify(result), Date.now(), id, worker);
    // A stale worker may never advance project state after it lost its lease.
    if (update.changes === 1) db.prepare(`UPDATE projects SET stage=?,status=?,updated_at=? WHERE id=?`).run(stage.name, result.ok ? "in_progress" : "held", Date.now(), projectId);
    results.push({ stage: stage.name, ...result }); if (!result.ok) return { projectId, results, stoppedAt: stage.name };
    dependency = hash([dependency, id, input]);
  }
  return { projectId, results };
}
