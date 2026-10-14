import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupStatus, inventoryDisasterData, publishDisasterBackup, restoreDisasterBackup, stageDisasterBackup, verifyDisasterBackup } from "../../src/pipeline/assembly/disaster-backup.js";
import { inspectChapterPackage } from "../../src/pipeline/assembly/chapter-package.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
let root: string, data: string, app: string, db: InstanceType<typeof DatabaseSync>;
function put(rel: string, value: string) { const path = join(data, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); return path; }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "heartword-disaster-")); data = join(root, "data"); app = join(root, "app");
  mkdirSync(join(data, "db"), { recursive: true }); mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "src", "saved.ts"), "// uncommitted runtime source");
  writeFileSync(join(app, "package-lock.json"), "{}"); writeFileSync(join(app, ".env.example"), "KEY=\n"); writeFileSync(join(app, ".env"), "SECRET=never-copy");
  db = new DatabaseSync(join(data, "db", "heartword.sqlite")); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
  const text = put("assets/text.docx", "exact verified source"), reference = put("assets/reference.docx", "verified reference");
  put("assets/original.wav", "unchanged source performance"); put("assets/accepted.mp4", "accepted pixels"); put("assets/rejected.mp4", "rejected pixels"); put("scratch/custom-editor.py", "retained edit recipe");
  db.exec(`INSERT INTO projects(id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO scenes(id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('s','p',1,'Mark 3:1','Mark 3:1',1);
    INSERT INTO shots(id,scene_id,sequence,action,created_at) VALUES ('shot','s',1,'Listen',1);
    INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES ('take','shot','included','unreported','generate','Saved prompt','accepted','accepted.mp4',0,1),('rejected','shot','paid','model','generate','Rejected prompt','retry_modified','rejected.mp4',1,1);
    INSERT INTO clips VALUES ('clip','shot','take',0,1000,1);
    INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('audio','p','original_reading','original.wav',0,1000,'Mark 3:1',1);
    INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES ('edit','p',1,'producer_decision','{"reason":"Keep this take"}','edit',1);`);
  db.prepare("INSERT INTO project_source_bindings VALUES ('p',?,'original.wav',?,'non_drama',?,?,?,'legacy',1)").run(text, reference, hash("exact verified source"), hash("unchanged source performance"), hash("verified reference"));
  const historical = new DatabaseSync(join(data, "db", "historical.sqlite")); historical.exec("CREATE TABLE history(value TEXT); INSERT INTO history VALUES ('retain');"); historical.close();
});
afterEach(() => { vi.unstubAllEnvs(); db.close(); if (root.startsWith(join(tmpdir(), "heartword-disaster-"))) rmSync(root, { recursive: true, force: true }); });
describe("whole production disaster recovery", () => {
  it("snapshots committed WAL state, all databases and originals; restores history into a new isolated root without original access", async () => {
    expect(existsSync(join(data, "db/heartword.sqlite-wal"))).toBe(true);
    const staged = join(root, "stage"), restored = join(root, "restored");
    const absoluteLibraryPath = put("assets/library/keyframe.png", "same retained frame");
    const originalSidecar = JSON.stringify({ sourcePath: join(data, "assets/original.wav") }, null, 2);
    put("assets/accepted.mp4.json", originalSidecar);
    const provenance = '{\n  "decision": "retain all aliases"\n}';
    for (const [id, path] of [["slash", "library/keyframe.png"], ["backslash", "library\\keyframe.png"], ["absolute", absoluteLibraryPath]]) {
      db.prepare("INSERT INTO media_library_items(id,project_id,shot_id,kind,asset_path,provenance_json,created_at) VALUES (?,'p','shot','image',?,?,1)").run(id!, path!, provenance);
    }
    const before = db.prepare("SELECT * FROM edit_commands").all(), costs = db.prepare("SELECT * FROM generation_attempts").all();
    const manifest = await stageDisasterBackup(data, staged, app);
    expect(manifest.files.filter(f => f.database)).toHaveLength(2);
    expect(manifest.files.some(f => f.path.endsWith("-wal"))).toBe(false);
    expect(manifest.files.some(f => f.path.endsWith("rejected.mp4"))).toBe(true);
    expect(manifest.files.some(f => f.path.endsWith("custom-editor.py"))).toBe(true);
    expect(manifest.files.some(f => f.path.endsWith(".env"))).toBe(false);
    expect(manifest.chapters[0]?.problems).toEqual([]);
    expect(manifest.protection).toBe("local-only");
    db.close(); renameSync(data, join(root, "unavailable-original"));
    const result = await restoreDisasterBackup(staged, restored);
    expect(result.noGeneration).toBe(true);
    const reopened = new DatabaseSync(join(restored, "db/heartword.sqlite"));
    expect(reopened.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    expect(reopened.prepare("SELECT * FROM edit_commands").all()).toEqual(before);
    expect(reopened.prepare("SELECT * FROM generation_attempts").all()).toEqual(costs);
    const aliases = reopened.prepare("SELECT id,asset_path,provenance_json FROM media_library_items ORDER BY id").all();
    expect(aliases).toEqual([
      { id: "absolute", asset_path: join(restored, "assets/library/keyframe.png"), provenance_json: provenance },
      { id: "backslash", asset_path: "library\\keyframe.png", provenance_json: provenance },
      { id: "slash", asset_path: "library/keyframe.png", provenance_json: provenance }
    ]);
    const binding = reopened.prepare("SELECT docx_path FROM project_source_bindings").get()!;
    expect(readFileSync(join(restored, "assets", String(binding.docx_path)), "utf8")).toBe("exact verified source");
    expect(readFileSync(join(result.applicationDir, "src/saved.ts"), "utf8")).toContain("uncommitted");
    expect(readFileSync(join(restored, "assets/accepted.mp4.json"), "utf8")).toBe(originalSidecar);
    expect(inspectChapterPackage(reopened, restored, "p", { includeApplication: false }).manifest.problems).toEqual([]);
    reopened.close();
    // A recovered working state can itself be backed up and recovered again.
    const nextBackup = join(root, "next-stage"), nextRestore = join(root, "next-restore");
    await stageDisasterBackup(restored, nextBackup, app);
    renameSync(restored, join(root, "unavailable-first-restore"));
    await restoreDisasterBackup(nextBackup, nextRestore);
    const twice = new DatabaseSync(join(nextRestore, "db/heartword.sqlite"), { readOnly: true });
    expect(inspectChapterPackage(twice, nextRestore, "p", { includeApplication: false }).manifest.problems).toEqual([]);
    expect(readFileSync(join(nextRestore, "assets/accepted.mp4.json"), "utf8")).toBe(originalSidecar);
    twice.close();
    // Reopen a harmless fixture connection for common cleanup.
    db = new DatabaseSync(":memory:");
  }, 30000);
  it("makes failures visible and never commits a completion marker when production is active", async () => {
    db.exec("INSERT INTO video_generation_jobs VALUES ('job','p','shot','ltx','active',NULL,NULL,1)");
    await expect(stageDisasterBackup(data, join(root, "failed"), app)).rejects.toThrow("Production is active");
    expect(backupStatus(data).latest?.state).toBe("failed");
    expect(existsSync(join(root, "failed/backup.json"))).toBe(false);
    expect(existsSync(join(data, ".disaster-backup.lock"))).toBe(false);
    expect(backupStatus(data, Date.now() + 25 * 3600000).stale).toBe(true);
  }, 30000);
  it("reserves database writers until media completion and detects assets created while copying", async () => {
    const staged = join(root, "changed");
    const pending = stageDisasterBackup(data, staged, app);
    // stage reaches its first asynchronous SQLite snapshot with writer gates held.
    expect(() => db.exec("INSERT INTO review_notes VALUES ('new','p','project','p','human','wait',0,2)")).toThrow(/locked/);
    put("assets/in-progress.png", "new generation");
    await expect(pending).rejects.toThrow(/created, deleted or changed/);
    expect(existsSync(join(staged, "backup.json"))).toBe(false);
    expect(backupStatus(data).latest?.state).toBe("failed");
    db.exec("INSERT INTO review_notes VALUES ('new','p','project','p','human','now unlocked',0,2)");
  }, 30000);
  it("refuses corrupt copies, unsafe paths and existing restore destinations", async () => {
    const staged = join(root, "stage"); await stageDisasterBackup(data, staged, app);
    await expect(restoreDisasterBackup(staged, data)).rejects.toThrow(/new isolated/);
    writeFileSync(join(staged, "data/assets/accepted.mp4"), "corruption");
    await expect(verifyDisasterBackup(staged)).rejects.toThrow("integrity failed");
    writeFileSync(join(staged, "data/assets/accepted.mp4"), "accepted pixels");
    const manifest = JSON.parse(readFileSync(join(staged, "backup.json"), "utf8")); manifest.files[0].path = "data/../../escape";
    writeFileSync(join(staged, "backup.json"), JSON.stringify(manifest));
    await expect(verifyDisasterBackup(staged)).rejects.toThrow("Unsafe backup path");
  }, 30000);
  it.each(["overwrite", "delete"])("fails visibly if an existing asset is changed by %s during capture", async action => {
    const staged = join(root, "changed"), pending = stageDisasterBackup(data, staged, app);
    if (action === "overwrite") put("assets/accepted.mp4", "different pixel"); // same byte length
    else rmSync(join(data, "assets/accepted.mp4"));
    await expect(pending).rejects.toThrow(/changed|ENOENT/);
    expect(existsSync(join(staged, "backup.json"))).toBe(false);
    expect(backupStatus(data).latest?.state).toBe("failed");
  }, 30000);
  it("reports preflight failure while preserving earlier completed copies and tolerates a damaged status record", async () => {
    const staged = join(root, "stage"); await stageDisasterBackup(data, staged, app);
    await expect(stageDisasterBackup(data, staged, app)).rejects.toThrow("already exists");
    expect(backupStatus(data).latest?.state).toBe("failed");
    await verifyDisasterBackup(staged);
    writeFileSync(join(data, "logs/disaster-backup-status.json"), '{"state":');
    expect(backupStatus(data).latest?.state).toBe("failed");
    expect(backupStatus(data).stale).toBe(true);
  }, 30000);
  it("publishes only a completed verified copy and never calls a local sync copy protected", async () => {
    const staged = join(root, "stage"), sync = join(root, "OneDrive", "snapshot");
    await stageDisasterBackup(data, staged, app);
    await expect(publishDisasterBackup(staged, sync, data)).rejects.toThrow("configured OneDrive root");
    vi.stubEnv("OneDrive", join(root, "OneDrive"));
    const result = await publishDisasterBackup(staged, sync, data);
    expect(result.remoteVerified).toBe(false); expect(backupStatus(data).protected).toBe(false);
    expect(backupStatus(data).latest?.state).toBe("cloud_pending");
    await expect(stageDisasterBackup(data, join(root, "OneDrive", "live-backup"), app)).rejects.toThrow("outside synced storage");
    await expect(publishDisasterBackup(staged, sync, data)).rejects.toThrow("already exists");
  }, 30000);
  it("records pre-existing missing dependencies without suppressing backup of recoverable work", async () => {
    rmSync(join(data, "assets/rejected.mp4"));
    const manifest = await stageDisasterBackup(data, join(root, "gaps"), app);
    expect(manifest.chapters[0]?.problems.some(p => p.includes("Missing asset: rejected.mp4"))).toBe(true);
    expect(manifest.files.some(f => f.path.endsWith("accepted.mp4"))).toBe(true);
    expect(inventoryDisasterData(data).databases).toHaveLength(2);
  }, 30000);
});
