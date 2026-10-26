import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { beginObservedWork } from "../observed-work.js";
import type { GenerationProgress } from "../../providers/types.js";

function databaseBusy(error: unknown): boolean {
  const value = error as { errcode?: unknown; message?: unknown } | null;
  return value?.errcode === 5 || (typeof value?.message === "string" && /database is locked|SQLITE_BUSY/i.test(value.message));
}

/** Status projection for the existing generation stage, not another queue. */
export function beginVideoJob(db: DatabaseSync, projectId: string, shotId: string, backend: string) {
  const id = randomUUID();
  const logDir = join(getDataDir(), "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `media-generation-${projectId}.log`);
  db.prepare("INSERT INTO video_generation_jobs (id,project_id,shot_id,backend,status,updated_at) VALUES (?,?,?,?,'active',?)").run(id, projectId, shotId, backend, Date.now());
  const stopObserving = beginObservedWork(projectId, "media_generation", id);
  const progress = (value: GenerationProgress) => {
    let persisted = true;
    try {
      db.prepare("UPDATE video_generation_jobs SET progress_json=?,updated_at=? WHERE id=?").run(JSON.stringify(value), Date.now(), id);
    } catch (error) {
      if (!databaseBusy(error)) throw error;
      // A busy status projection must never cancel a video inference already
      // submitted to Desktop. The next poll can persist a newer snapshot.
      persisted = false;
    }
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), event: "video_progress", projectId, shotId, jobId: id, backend, persisted, ...value })}\n`);
  };
  const finish = (status: "completed" | "held" | "error", metadata: Record<string, unknown>) => {
    stopObserving();
    let persisted = true;
    try {
      db.prepare("UPDATE video_generation_jobs SET status=?,metadata_json=?,updated_at=? WHERE id=?").run(status, JSON.stringify(metadata), Date.now(), id);
    } catch (error) {
      if (!databaseBusy(error)) throw error;
      // The result/uncertain output is retained by the caller. Keep an exact
      // log receipt if a concurrent DB writer delays the job-status update.
      persisted = false;
    }
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), event: "video_finished", projectId, shotId, jobId: id, backend, status, persisted, ...metadata })}\n`);
  };
  return { id, progress, finish };
}
