import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../../db/client.js";
import { beginObservedWork } from "../observed-work.js";
import type { GenerationProgress } from "../../providers/types.js";

/** Status projection for the existing generation stage, not another queue. */
export function beginVideoJob(db: DatabaseSync, projectId: string, shotId: string, backend: string) {
  const id = randomUUID();
  const logDir = join(getDataDir(), "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `media-generation-${projectId}.log`);
  db.prepare("INSERT INTO video_generation_jobs (id,project_id,shot_id,backend,status,updated_at) VALUES (?,?,?,?,'active',?)").run(id, projectId, shotId, backend, Date.now());
  const stopObserving = beginObservedWork(projectId, "media_generation", id);
  const progress = (value: GenerationProgress) => {
    db.prepare("UPDATE video_generation_jobs SET progress_json=?,updated_at=? WHERE id=?").run(JSON.stringify(value), Date.now(), id);
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), event: "video_progress", projectId, shotId, jobId: id, backend, ...value })}\n`);
  };
  const finish = (status: "completed" | "held" | "error", metadata: Record<string, unknown>) => {
    stopObserving();
    db.prepare("UPDATE video_generation_jobs SET status=?,metadata_json=?,updated_at=? WHERE id=?").run(status, JSON.stringify(metadata), Date.now(), id);
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), event: "video_finished", projectId, shotId, jobId: id, backend, status, ...metadata })}\n`);
  };
  return { id, progress, finish };
}
