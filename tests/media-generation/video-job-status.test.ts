import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { beginVideoJob } from "../../src/pipeline/media-generation/video-job-status.js";

it("keeps an already submitted LTX job alive when a second process briefly locks status writes", () => {
  const root = mkdtempSync(join(tmpdir(), "heartword-video-status-"));
  const priorDataDir = process.env.HEARTWORD_DATA_DIR;
  process.env.HEARTWORD_DATA_DIR = root;
  const path = join(root, "status.sqlite");
  const writer = new DatabaseSync(path);
  const producer = new DatabaseSync(path);
  try {
    writer.exec(`CREATE TABLE video_generation_jobs (
      id TEXT PRIMARY KEY, project_id TEXT, shot_id TEXT, backend TEXT,
      status TEXT, progress_json TEXT, metadata_json TEXT, updated_at INTEGER
    )`);
    const job = beginVideoJob(producer, "project", "shot", "ltx");
    writer.exec("BEGIN IMMEDIATE");
    expect(() => job.progress({ phase: "inference", percentage: 15, currentStep: 0, totalSteps: 8 })).not.toThrow();
    writer.exec("COMMIT");
    job.progress({ phase: "decoding", percentage: 90, currentStep: 8, totalSteps: 8 });
    job.finish("completed", { attemptId: "attempt" });
    const saved = writer.prepare("SELECT status,progress_json,metadata_json FROM video_generation_jobs WHERE id=?").get(job.id) as
      { status: string; progress_json: string; metadata_json: string };
    expect(saved.status).toBe("completed");
    expect(JSON.parse(saved.progress_json).phase).toBe("decoding");
    expect(JSON.parse(saved.metadata_json).attemptId).toBe("attempt");
    const log = readFileSync(join(root, "logs", "media-generation-project.log"), "utf8");
    expect(log).toContain('"persisted":false');
    expect(log).toContain('"event":"video_finished"');
  } finally {
    try { writer.exec("ROLLBACK"); } catch { /* no open transaction */ }
    writer.close();
    producer.close();
    if (priorDataDir === undefined) delete process.env.HEARTWORD_DATA_DIR;
    else process.env.HEARTWORD_DATA_DIR = priorDataDir;
    const absolute = realpathSync(root), temp = realpathSync(tmpdir());
    if (!absolute.startsWith(`${temp}${sep}`) || !absolute.split(sep).at(-1)?.startsWith("heartword-video-status-"))
      throw new Error("Refusing to remove an unexpected test directory");
    rmSync(resolve(absolute), { recursive: true, force: true });
  }
});
