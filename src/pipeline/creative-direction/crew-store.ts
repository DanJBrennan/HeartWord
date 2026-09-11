import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir, getDb } from "../../db/client.js";
import { generateJsonWithImages, GEMINI_TEXT_MODEL } from "../../server/providers/gemini.js";
import { crewBriefHash, loadCrewBrief } from "./crew-context.js";
import { runCrew, type CrewRunnerOptions } from "./crew.js";
import type { CrewBrief, CrewPhase, CrewResult } from "./crew-types.js";

export interface StoredCrewRun { id: string; project_id: string; phase: CrewPhase; brief_hash: string;
  brief_json: string; status: string; result_json: string | null; created_at: number }
export function latestCrewRun(db: DatabaseSync, projectId: string, phase: CrewPhase): StoredCrewRun | undefined {
  return db.prepare("SELECT * FROM production_runs WHERE project_id = ? AND phase = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId, phase) as unknown as StoredCrewRun | undefined;
}
export async function runProductionCrew(projectId: string, phase: CrewPhase, options: {
  db?: DatabaseSync; dataDir?: string; maxCalls?: number; call?: CrewRunnerOptions["call"];
  brief?: CrewBrief; media?: CrewRunnerOptions["media"];
} = {}): Promise<CrewResult & { runId: string }> {
  const db = options.db ?? getDb();
  const brief = options.brief ?? loadCrewBrief(db, options.dataDir ?? getDataDir(), projectId, phase);
  const active = db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running' LIMIT 1").get(projectId);
  if (active) throw new Error("A production crew run is already active. Recover an interrupted run before restarting.");
  const id = randomUUID();
  const hash = crewBriefHash(brief, phase);
  db.prepare(`INSERT INTO production_runs (id, project_id, phase, brief_hash, brief_json, status, created_at, worker_pid)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`).run(id, projectId, phase, hash, JSON.stringify(brief), Date.now(), process.pid);
  let sequence = 0;
  let result: CrewResult;
  try {
    result = await runCrew({ phase, brief, maxCalls: options.maxCalls, media: options.media,
      call: options.call ?? ((prompt, schema, media) => generateJsonWithImages(prompt, media, schema)),
      log: event => db.prepare(`INSERT INTO production_events
        (id, run_id, sequence, role, round, prompt, output_json, error, model, cost_usd, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(randomUUID(), id, ++sequence, event.role,
          event.round, event.prompt, event.output ? JSON.stringify(event.output) : null, event.error, GEMINI_TEXT_MODEL, Date.now()) });
    // Reject a model result produced against inputs changed by another request.
    if (!options.brief && crewBriefHash(loadCrewBrief(db, options.dataDir ?? getDataDir(), projectId, phase), phase) !== hash) {
      result = { ...result, status: "held", summary: "Production inputs changed during review. Run the crew against the current brief." };
    }
  } catch (error) {
    result = { status: "incomplete", summary: (error as Error).message, calls: sequence, contributions: {} };
  }
  db.prepare("UPDATE production_runs SET status = ?, result_json = ?, completed_at = ? WHERE id = ?")
    .run(result.status, JSON.stringify(result), Date.now(), id);
  return { ...result, runId: id };
}

export function recoverInterruptedCrew(db: DatabaseSync, projectId: string, runId: string): void {
  const run = db.prepare("SELECT worker_pid,status FROM production_runs WHERE id=? AND project_id=?").get(runId, projectId);
  if (!run || run.status !== "running") throw new Error("This run is not awaiting recovery.");
  if (run.worker_pid) {
    try { process.kill(Number(run.worker_pid), 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      const calls = Number(db.prepare("SELECT COUNT(*) AS n FROM production_events WHERE run_id=?").get(runId)!.n);
      const result: CrewResult = { status: "incomplete", summary: "The worker stopped before this review completed. Saved exchanges were retained; start a new review when ready.", calls, contributions: {} };
      db.prepare("UPDATE production_runs SET status='incomplete',result_json=?,completed_at=? WHERE id=? AND status='running'").run(JSON.stringify(result), Date.now(), runId);
      return;
    } throw error; }
    throw new Error("The worker is still running; its review cannot be recovered as interrupted.");
  }
  throw new Error("This historical run has no worker identity; inspect it before recovery.");
}

export function requireCurrentPlan(db: DatabaseSync, dataDir: string, projectId: string): StoredCrewRun {
  const run = latestCrewRun(db, projectId, "planning");
  if (!run || run.status !== "approved") throw new Error("Run the production crew and resolve its findings before generating new media.");
  if (crewBriefHash(loadCrewBrief(db, dataDir, projectId, "planning"), "planning") !== run.brief_hash) throw new Error("The production plan is stale; review the changed source, canon or shot plan first.");
  return run;
}
/** Legacy briefs remain usable until a crew plan is introduced for the chapter. */
export function validateHandoffPlan(db: DatabaseSync, dataDir: string, projectId: string, preparedRunId?: string): void {
  const latest = latestCrewRun(db, projectId, "planning");
  if (!latest && !preparedRunId) return;
  if (requireCurrentPlan(db, dataDir, projectId).id !== preparedRunId) throw new Error("Production direction changed after preparation. Prepare a new brief.");
}
export function directionsFromRun(run: StoredCrewRun, shotId: string, beatId?: string): string {
  const brief = JSON.parse(run.brief_json) as CrewBrief;
  const shot = brief.shots.find(s => s.id === shotId);
  if (!shot) throw new Error("Shot is not in the reviewed production plan.");
  const beat = beatId ? shot.beats.find(b => b.id === beatId) : null;
  if (beatId && !beat) throw new Error("Coverage beat is not in the reviewed plan.");
  const result = JSON.parse(run.result_json!) as CrewResult;
  const directions = Object.entries(result.contributions).flatMap(([role, contribution]) =>
    contribution.directions.filter(d => d.shotId === shotId).map(d => `${role.replaceAll("_", " ")}: ${d.instruction}\nPurpose: ${d.scriptureBasis}`));
  return `\n\nAPPROVED FILM DIRECTION (${run.id}):\n${directions.join("\n")}\n` +
    (beat ? `This is coverage beat ${beat.id}, not the whole parent action. Show only: ${beat.notes ?? beat.id}. Chosen subject: ${beat.characterId ?? "no singled-out character"}. Apply parent continuity only where visible in this angle.\n` : "");
}
