/**
 * Durable supervisor for a chapter's idempotent media-generation stage.
 *
 * It intentionally does not own generation logic: each pass calls the same
 * independently-runnable pipeline stage used by the app. Accepted attempts
 * are therefore reused on restart, while provider/network failures are
 * logged and retried instead of ending the chapter batch.
 *
 * Run detached on Windows, for example:
 *   Start-Process -WindowStyle Hidden -FilePath npx.cmd -ArgumentList
 *     'tsx','scripts/watch-media-generation.ts','<project-id>'
 */
import "dotenv/config";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { runMediaGeneration } from "../src/pipeline/media-generation/index.js";

const projectId = process.argv[2] ?? "";
if (!projectId) throw new Error("Usage: npx tsx scripts/watch-media-generation.ts <project-id>");

const dataDir = getDataDir();
const logDir = join(dataDir, "logs");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `media-watchdog-${projectId}.log`);
const lockPath = join(logDir, `media-watchdog-${projectId}.lock`);
let stopped = false;

function log(event: string, details: Record<string, unknown> = {}) {
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), event, projectId, ...details })}\n`);
}

function acceptedClipCount() {
  const row = getDb().prepare(`SELECT COUNT(DISTINCT c.shot_id) AS n FROM clips c
    JOIN shots sh ON sh.id=c.shot_id JOIN scenes sc ON sc.id=sh.scene_id
    WHERE sc.project_id=?`).get(projectId) as { n: number };
  return Number(row.n);
}

function acquireLock() {
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    closeSync(fd);
    return;
  } catch (error: unknown) {
    if (!(error as NodeJS.ErrnoException).code || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const prior = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: number };
      if (prior.pid) {
        try { process.kill(prior.pid, 0); }
        catch { unlinkSync(lockPath); return acquireLock(); }
      }
    } catch { unlinkSync(lockPath); return acquireLock(); }
    throw new Error(`Media watchdog already running for ${projectId}; lock: ${lockPath}`);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function stop(signal: string) { stopped = true; log("stop_requested", { signal }); }
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

acquireLock();
log("started", { pid: process.pid, acceptedClips: acceptedClipCount() });
let consecutiveFailures = 0;
try {
  while (!stopped) {
    const before = acceptedClipCount();
    try {
      const result = await runMediaGeneration(projectId);
      const after = acceptedClipCount();
      consecutiveFailures = after > before ? 0 : consecutiveFailures + 1;
      log("pass_finished", { ok: result.ok, before, after, reasoning: result.reasoning, consecutiveFailures });
      // A complete stage has nothing more to supervise.  Any later producer
      // change can start a new watchdog pass rather than polling forever.
      if (result.ok) { log("completed", { acceptedClips: after }); break; }
    } catch (error) {
      consecutiveFailures++;
      log("pass_failed", { before, error: error instanceof Error ? error.message : String(error), consecutiveFailures });
    }
    // Prevent a provider outage or a held candidate from hot-looping. The
    // cap preserves unattended recovery without hammering a vendor API.
    const delayMs = Math.min(300_000, 15_000 * 2 ** Math.min(consecutiveFailures, 4));
    log("retry_scheduled", { delayMs });
    await sleep(delayMs);
  }
} finally {
  if (existsSync(lockPath)) unlinkSync(lockPath);
  log("stopped", { acceptedClips: acceptedClipCount() });
}
