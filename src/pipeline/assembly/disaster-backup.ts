import { createHash, randomUUID } from "node:crypto";
import { constants, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { inspectChapterPackage, productionRecords, restoreProductionRecords } from "./chapter-package.js";
const { DatabaseSync, backup } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type FileEntry = { path: string; bytes: number; sha256: string; database: boolean };
type Stamp = { size: number; mtimeMs: number; ctimeMs: number; ino: number };
export interface BackupManifest {
  format: "heartword-disaster-backup"; version: 1; id: string; startedAt: string; completedAt: string;
  sourceRoot: string; files: FileEntry[]; references: Array<[string, string]>;
  chapters: Array<{ projectId: string; problems: string[]; editability: string[] }>;
  exclusions: string[]; limitations: string[]; node: string;
  // A locally completed snapshot is never evidence of remote delivery.
  protection: "local-only";
}
const slash = (s: string) => s.replaceAll("\\", "/");
const excluded = new Set([".disaster-backup.lock", "logs/disaster-backup-status.json", "logs/disaster-backup-events.jsonl"]);
const secret = (name: string) => /^\.env(?:\..*)?$/.test(name) && name !== ".env.example";
const json = (path: string, value: unknown, exclusive = true) => writeFileSync(path, JSON.stringify(value, null, 2), { flag: exclusive ? "wx" : "w", flush: true });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function inside(root: string, path: string) {
  const rel = relative(resolve(root), resolve(path));
  return rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../") && !isAbsolute(rel);
}
function noLinks(path: string) {
  for (let p = resolve(path); ; p = dirname(p)) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`Backup/restore link is not allowed: ${p}`);
    if (dirname(p) === p) break;
  }
}
function safe(root: string, path: string) {
  if (!path || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error(`Unsafe backup path: ${path}`);
  const full = resolve(root, path); noLinks(full);
  if (!inside(root, full)) throw new Error(`Backup path escapes root: ${path}`);
  return full;
}
function stamp(path: string): Stamp {
  const s = statSync(path); return { size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, ino: s.ino };
}
export async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function configuredSyncFolder(path: string) {
  return [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter((p): p is string => !!p).some(root => inside(root, path));
}
function synced(path: string) {
  return configuredSyncFolder(path) || /(?:^|[\\/])OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(path);
}
function filesIn(root: string, application = false) {
  const files = new Map<string, Stamp>(), exclusions: string[] = [];
  function walk(path: string) {
    const rel = slash(relative(root, path)), name = basename(path); noLinks(path);
    if (secret(name) || excluded.has(rel) || (application && ["node_modules", ".git", ".venv", "__pycache__", "dist"].includes(name))) { exclusions.push(rel); return; }
    const s = lstatSync(path);
    if (s.isDirectory()) for (const child of readdirSync(path).sort()) walk(resolve(path, child));
    else if (s.isFile()) files.set(rel, stamp(path));
    else throw new Error(`Unsupported backup file: ${path}`);
  }
  if (application) {
    for (const name of ["src", "scripts", "tests", "docs", "AGENTS.md", "README.md", ".env.example", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.base.json", "vite.config.ts", "vitest.config.ts"]) if (existsSync(resolve(root, name))) walk(resolve(root, name));
  } else walk(root);
  return { files, exclusions };
}
function databaseNames(files: Map<string, Stamp>) {
  return [...files.keys()].filter(p => /\.(?:sqlite3?|db)$/i.test(p));
}
function withoutJournals(files: Map<string, Stamp>, databases: string[]) {
  return new Map([...files].filter(([p]) => !databases.some(db => ["-wal", "-shm", "-journal"].some(s => p === db + s))));
}
function spaceAt(path: string, needed: number) {
  const s = statfsSync(path);
  if (s.bavail * s.bsize < needed * 1.1) throw new Error(`Insufficient local space: need ${Math.ceil(needed * 1.1)} bytes including 10% headroom.`);
}
export function backupStatus(dataDir: string, now = Date.now()) {
  const path = resolve(dataDir, "logs/disaster-backup-status.json");
  let latest: { state: string; at: string; summary: string } | null = null;
  try {
    if (existsSync(path)) {
      latest = JSON.parse(readFileSync(path, "utf8"));
      if (!latest || typeof latest.state !== "string" || typeof latest.summary !== "string" || !Number.isFinite(Date.parse(latest.at))) throw new Error("Invalid status record");
    }
  } catch {
    // A truncated/interrupted status write must not break the producer panel.
    latest = { state: "failed", at: new Date(0).toISOString(), summary: "Backup status is unreadable. Check the operation log and completed snapshots." };
  }
  return { latest, stale: !latest || now - Date.parse(latest.at) > 24 * 60 * 60 * 1000,
    protected: false, summary: latest?.summary ?? "No disaster backup recorded. Cloud protection has not been verified." };
}
function status(dataDir: string, state: string, summary: string, detail: Record<string, unknown> = {}) {
  mkdirSync(resolve(dataDir, "logs"), { recursive: true });
  const event = { state, at: new Date().toISOString(), summary, ...detail, remoteVerified: false };
  json(resolve(dataDir, "logs/disaster-backup-status.json"), event, false);
  writeFileSync(resolve(dataDir, "logs/disaster-backup-events.jsonl"), JSON.stringify(event) + "\n", { flag: "a" });
}
export function inventoryDisasterData(dataDir: string) {
  noLinks(dataDir);
  const tree = filesIn(resolve(dataDir)), groups: Record<string, { files: number; bytes: number }> = {};
  for (const [path, s] of tree.files) { const key = path.split("/")[0]!; const g = groups[key] ??= { files: 0, bytes: 0 }; g.files++; g.bytes += s.size; }
  return { files: tree.files.size, bytes: [...tree.files.values()].reduce((n, s) => n + s.size, 0), groups, databases: databaseNames(tree.files), exclusions: tree.exclusions };
}

/** End-of-day maintenance: stop production/import/render writers first. SQLite
 * writer reservations coordinate every DB snapshot; changing/new/deleted media
 * holds completion. No provider, dispatch, migration or pruning is reachable. */
export async function stageDisasterBackup(dataDir: string, destination: string, applicationDir = resolve(".")): Promise<BackupManifest> {
  dataDir = resolve(dataDir); destination = resolve(destination); applicationDir = resolve(applicationDir);
  let ownsLock = false, lockCollision = false, canReport = false;
  const gates: InstanceType<typeof DatabaseSync>[] = [];
  try {
    noLinks(dataDir); canReport = existsSync(dataDir);
    noLinks(destination); noLinks(applicationDir);
    if (synced(dataDir) || synced(destination)) throw new Error("Keep live data and in-progress staging outside synced storage; publish only a completed backup.");
    if (inside(dataDir, destination) || inside(destination, dataDir) || inside(applicationDir, destination)) throw new Error("Backup staging must be outside the data and application trees.");
    if (existsSync(destination)) throw new Error("Backup destination already exists; use a new directory.");
    try { writeFileSync(resolve(dataDir, ".disaster-backup.lock"), String(process.pid), { flag: "wx" }); ownsLock = true; }
    catch (error) { lockCollision = (error as NodeJS.ErrnoException).code === "EEXIST"; throw error; }
    status(dataDir, "running", "Backup in progress; previous completed copies remain intact.", { destination });
    const startedAt = new Date().toISOString();
    const tree = filesIn(dataDir), databases = databaseNames(tree.files);
    if (!databases.includes("db/heartword.sqlite")) throw new Error("Missing production database db/heartword.sqlite.");
    // Separate connections: backing up a connection with a write transaction
    // would block. BEGIN IMMEDIATE on the gates reserves writers even in WAL.
    for (const name of databases.sort()) {
      const gate = new DatabaseSync(resolve(dataDir, name)); gates.push(gate);
      gate.exec("PRAGMA busy_timeout=1000; BEGIN IMMEDIATE;");
    }
    const main = gates[databases.indexOf("db/heartword.sqlite")]!;
    for (const [table, active] of [["production_runs", "running"], ["stage_executions", "running"], ["video_generation_jobs", "active"], ["directed_video_jobs", "running"]]) {
      if (main.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table!) && main.prepare(`SELECT 1 FROM ${table} WHERE status=? LIMIT 1`).get(active!)) throw new Error(`Production is active in ${table}; finish/reconcile it before backup.`);
    }
    const baseline = withoutJournals(filesIn(dataDir).files, databases), appTree = filesIn(applicationDir, true);
    mkdirSync(dirname(destination), { recursive: true });
    spaceAt(dirname(destination), [...baseline.values(), ...appTree.files.values()].reduce((n, s) => n + s.size, 0));
    mkdirSync(destination);
    const entries: FileEntry[] = [], references = new Map<string, string>();
    for (const name of databases) {
      const out = safe(destination, `data/${name}`); mkdirSync(dirname(out), { recursive: true });
      const reader = new DatabaseSync(resolve(dataDir, name), { readOnly: true });
      try { await backup(reader, out); } finally { reader.close(); }
      checkDatabase(out);
      entries.push({ path: `data/${name}`, bytes: statSync(out).size, sha256: await fileDigest(out), database: true });
    }
    const snapshot = new DatabaseSync(resolve(destination, "data/db/heartword.sqlite"), { readOnly: true });
    const chapters: BackupManifest["chapters"] = [], external = new Map<string, string>();
    try {
      for (const project of snapshot.prepare("SELECT id FROM projects ORDER BY id").all()) {
        const audit = inspectChapterPackage(snapshot, dataDir, String(project.id), { includeApplication: false });
        chapters.push({ projectId: String(project.id), problems: audit.manifest.problems, editability: audit.manifest.editability });
        for (const [source, file] of audit.sources) {
          if (file.path.startsWith("application/")) continue;
          const path = inside(dataDir, source) ? slash(relative(dataDir, source)) : `assets/recovered-external/${file.sha256}/${basename(source)}`;
          for (const original of file.originals) references.set(original, path);
          if (!inside(dataDir, source)) external.set(source, path);
        }
      }
    } finally { snapshot.close(); }
    const sources = new Map<string, { path: string; before: Stamp; digest?: string }>();
    for (const [rel, before] of baseline) if (!databases.includes(rel)) sources.set(resolve(dataDir, rel), { path: `data/${rel}`, before });
    for (const [rel, before] of appTree.files) sources.set(resolve(applicationDir, rel), { path: `application/${rel}`, before });
    for (const [source, rel] of external) sources.set(source, { path: `data/${rel}`, before: stamp(source) });
    for (const [source, item] of sources) {
      if (!same(stamp(source), item.before)) throw new Error(`File changed before backup copy: ${source}`);
      item.digest = await fileDigest(source);
      const out = safe(destination, item.path); mkdirSync(dirname(out), { recursive: true });
      copyFileSync(source, out, constants.COPYFILE_EXCL);
      if (!same(stamp(source), item.before) || await fileDigest(out) !== item.digest) throw new Error(`File changed during backup: ${source}`);
      entries.push({ path: item.path, bytes: item.before.size, sha256: item.digest, database: false });
      if (entries.length % 1000 === 0) status(dataDir, "running", `Copying backup: ${entries.length}/${sources.size + databases.length} files verified.`, { destination });
    }
    // Detect overwrites after a file was copied, even when its size is equal.
    let checked = 0;
    for (const [source, item] of sources) {
      if (!same(stamp(source), item.before) || await fileDigest(source) !== item.digest) throw new Error(`File changed before backup completion: ${source}`);
      if (++checked % 1000 === 0) status(dataDir, "running", `Checking source stability: ${checked}/${sources.size} files.`, { destination });
    }
    if (!same([...withoutJournals(filesIn(dataDir).files, databases)], [...baseline]) || !same([...filesIn(applicationDir, true).files], [...appTree.files])) throw new Error("Files were created, deleted or changed during backup; no completed backup was recorded.");
    const manifest: BackupManifest = { format: "heartword-disaster-backup", version: 1, id: randomUUID(), startedAt, completedAt: new Date().toISOString(), sourceRoot: dataDir,
      files: entries, references: [...references], chapters, exclusions: [...tree.exclusions, ...databases.flatMap(d => [d + "-wal", d + "-shm", d + "-journal"])], node: process.version, protection: "local-only",
      limitations: ["Cloud upload and remote recovery are not verified by local completion.", "Credentials, SSH private keys and installed software require separate recovery.", "Unregistered editor/Blender projects are retained as bytes; external dependencies not represented in their saved locks need separate inspection."] };
    json(resolve(destination, "backup.json"), manifest); // sole completion marker, last
    status(dataDir, "locally_verified", "Local backup verified. Cloud upload and remote recovery remain unverified.", { destination, id: manifest.id, gaps: chapters.reduce((n, c) => n + c.problems.length, 0) });
    return manifest;
  } catch (error) {
    // Do not overwrite another running backup's status on a lock collision.
    if (canReport && !lockCollision && (ownsLock || !existsSync(resolve(dataDir, ".disaster-backup.lock")))) status(dataDir, "failed", `Backup failed: ${(error as Error).message}`, { destination });
    throw error;
  } finally {
    for (const db of gates.reverse()) { try { if (db.isTransaction) db.exec("ROLLBACK"); } finally { db.close(); } }
    if (ownsLock) unlinkSync(resolve(dataDir, ".disaster-backup.lock"));
  }
}
function checkDatabase(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (!same(db.prepare("PRAGMA integrity_check").all(), [{ integrity_check: "ok" }]) || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error(`SQLite integrity/relationship check failed: ${path}`);
  } finally { db.close(); }
}
export async function verifyDisasterBackup(directory: string): Promise<BackupManifest> {
  noLinks(directory);
  const manifest = JSON.parse(readFileSync(resolve(directory, "backup.json"), "utf8")) as BackupManifest;
  if (manifest.format !== "heartword-disaster-backup" || manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.completedAt) throw new Error("Unsupported/incomplete disaster backup.");
  const seen = new Set<string>();
  for (const file of manifest.files) {
    const path = safe(directory, file.path);
    if (!(file.path.startsWith("data/") || file.path.startsWith("application/")) || seen.has(file.path.toLowerCase())) throw new Error(`Invalid/duplicate backup entry: ${file.path}`);
    seen.add(file.path.toLowerCase());
    if (statSync(path).size !== file.bytes || await fileDigest(path) !== file.sha256) throw new Error(`Backup integrity failed: ${file.path}`);
    if (file.database) checkDatabase(path);
  }
  if (!seen.has("data/db/heartword.sqlite")) throw new Error("Backup is missing the production database.");
  for (const [, path] of manifest.references) if (!seen.has(`data/${path}`.toLowerCase())) throw new Error(`Unretained asset reference: ${path}`);
  return manifest;
}
/** Publish a completed snapshot; local sync-folder verification does NOT prove
 * that OneDrive has uploaded it. Never labels this copy protected. */
export async function publishDisasterBackup(directory: string, destination: string, dataDir: string) {
  try {
    const manifest = await verifyDisasterBackup(directory); noLinks(destination);
    if (!configuredSyncFolder(destination)) throw new Error("Publish requires a configured OneDrive root for the selected account; a folder named OneDrive alone is not enough.");
    if (existsSync(destination)) throw new Error("Publish destination already exists.");
    mkdirSync(dirname(destination), { recursive: true }); spaceAt(dirname(destination), manifest.files.reduce((n, f) => n + f.bytes, 0));
    mkdirSync(destination);
    for (const file of manifest.files) { const out = safe(destination, file.path); mkdirSync(dirname(out), { recursive: true }); copyFileSync(safe(directory, file.path), out, constants.COPYFILE_EXCL); if (await fileDigest(out) !== file.sha256) throw new Error(`Published copy integrity failed: ${file.path}`); }
    json(resolve(destination, "backup.json"), manifest);
    status(dataDir, "cloud_pending", "Completed backup copied for upload. OneDrive cloud copy has not been verified.", { destination, id: manifest.id });
    return { destination, id: manifest.id, remoteVerified: false };
  } catch (error) { status(dataDir, "failed", `Backup upload preparation failed: ${(error as Error).message}`, { destination }); throw error; }
}
/** Working recovery metadata; prior projections remain as immutable evidence.
 * Original sidecar bytes and producer history are never rewritten. */
export function recordRestoredPathProjection(destination: string, manifest: BackupManifest) {
  const path = resolve(destination, "logs/disaster-recovery-paths.json"); noLinks(path);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const prior = resolve(destination, `logs/recovery-history/${randomUUID()}-paths.json`);
    mkdirSync(dirname(prior), { recursive: true }); copyFileSync(path, prior, constants.COPYFILE_EXCL);
  }
  json(path, { version: 1, backupId: manifest.id, sourceRoot: manifest.sourceRoot, references: manifest.references }, false);
}
export async function restoreDisasterBackup(directory: string, destination: string) {
  const manifest = await verifyDisasterBackup(directory); destination = resolve(destination); noLinks(destination);
  const applicationDir = `${destination}-application`; noLinks(applicationDir);
  if (existsSync(destination) || existsSync(applicationDir) || synced(destination) || inside(directory, destination)) throw new Error("Restore needs new isolated data and application directories outside synced storage and the backup.");
  mkdirSync(destination, { recursive: true });
  const relocations = new Map(manifest.references.map(([original, path]) => {
    const oldPath = isAbsolute(original) ? original : resolve(manifest.sourceRoot, "assets", original);
    // Relative paths within the whole retained tree still work verbatim.
    // Normalizing slash/absolute aliases can collide with UNIQUE library rows.
    const target = inside(manifest.sourceRoot, oldPath)
      ? isAbsolute(original) ? resolve(destination, path) : original
      : path.startsWith("assets/") ? path.slice(7) : resolve(destination, path);
    return [original, target];
  }));
  // Include every exact absolute data path, even ones inside retained JSON.
  for (const file of manifest.files.filter(f => f.path.startsWith("data/"))) {
    const rel = file.path.slice(5); relocations.set(resolve(manifest.sourceRoot, rel), resolve(destination, rel));
  }
  for (const file of manifest.files) {
    const isData = file.path.startsWith("data/");
    let rel = isData ? file.path.slice(5) : file.path.slice("application/".length);
    // An earlier restoration marker is history, not this run's completion.
    if (rel === "restored-from.json") rel = `logs/recovery-history/${randomUUID()}-prior-restoration.json`;
    const out = safe(isData ? destination : applicationDir, rel); mkdirSync(dirname(out), { recursive: true });
    if (file.path === "data/db/heartword.sqlite") {
      const source = new DatabaseSync(safe(directory, file.path), { readOnly: true });
      try {
        const records = productionRecords(source);
        // Source-catalog bindings specifically use paths relative to assets.
        for (const binding of records.tables.project_source_bindings ?? []) for (const key of ["docx_path", "audio_path", "reference_path"]) {
          const original = String(binding[key]), projected = relocations.get(original);
          if (isAbsolute(original) && projected && inside(resolve(destination, "assets"), projected)) binding[key] = slash(relative(resolve(destination, "assets"), projected));
        }
        restoreProductionRecords(out, records.tables, records.schema, relocations);
      } finally { source.close(); }
      checkDatabase(out);
    } else { copyFileSync(safe(directory, file.path), out, constants.COPYFILE_EXCL); if (await fileDigest(out) !== file.sha256) throw new Error(`Restore integrity failed: ${file.path}`); }
  }
  recordRestoredPathProjection(destination, manifest);
  json(resolve(destination, "restored-from.json"), { id: manifest.id, backup: resolve(directory), applicationDir, restoredAt: new Date().toISOString(), noGeneration: true, knownGaps: manifest.chapters });
  return { destination, applicationDir, chapters: manifest.chapters, noGeneration: true };
}
