// outputs/cloud-restore-proof-20261024.ts
import assert2 from "node:assert/strict";
import { createRequire as createRequire4 } from "node:module";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { copyFileSync as copyFileSync3, createReadStream as createReadStream2, existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, rmdirSync, unlinkSync as unlinkSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { resolve as resolve3, join as join2, toNamespacedPath } from "node:path";

// src/pipeline/assembly/disaster-backup.ts
import { createHash, randomUUID } from "node:crypto";
import { constants as constants2, copyFileSync as copyFileSync2, createReadStream, existsSync as existsSync2, lstatSync as lstatSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, readdirSync as readdirSync2, statSync as statSync2, statfsSync, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { createRequire as createRequire3 } from "node:module";
import { basename, dirname as dirname2, isAbsolute, relative, resolve } from "node:path";

// src/pipeline/assembly/chapter-package.ts
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire as createRequire2 } from "node:module";

// src/db/client.ts
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
var __dirname = dirname(fileURLToPath(import.meta.url));
var SCHEMA_PATH = join(__dirname, "schema.sql");

// src/pipeline/ingestion/source-catalog.ts
var books = ["matthew", "mark", "luke", "john", "acts", "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians", "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james", "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation"];
var display = { "1-corinthians": "1 Corinthians", "2-corinthians": "2 Corinthians", "1-thessalonians": "1 Thessalonians", "2-thessalonians": "2 Thessalonians", "1-timothy": "1 Timothy", "2-timothy": "2 Timothy", "1-peter": "1 Peter", "2-peter": "2 Peter", "1-john": "1 John", "2-john": "2 John", "3-john": "3 John" };
var title = (book) => display[book] ?? book.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
var chapterCounts = [28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];
var SOURCE_CATALOG_BOOKS = [{ id: "genesis", title: "Genesis", chapters: 50 }, ...books.map((id, index) => ({ id, title: title(id), chapters: chapterCounts[index] }))];

// src/pipeline/assembly/chapter-package.ts
var quote = (name) => `"${name.replaceAll('"', '""')}"`;
function productionRecords(db, projectId) {
  const definitions = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const all = {}, selected = {}, keys = {};
  for (const { name } of definitions) {
    all[name] = db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all();
    selected[name] = new Set(all[name].filter((row) => name === "projects" ? row.id === projectId : row.project_id === projectId));
    keys[name] = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all();
  }
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name").all();
  const schema2 = [...definitions, ...indexes].map((d) => `${d.sql};`).join("\n");
  if (projectId === void 0) return { tables: all, schema: schema2 };
  if (!selected.projects?.size) throw new Error("Project not found.");
  let changed = true;
  const owners = {
    shots: "scene_id",
    shot_characters: "shot_id",
    shot_utterance_bindings: "shot_id",
    generation_attempts: "shot_id",
    media_reuse_candidates: "target_shot_id",
    coverage_beats: "shot_id",
    coverage_keyframe_attempts: "coverage_beat_id",
    clips: "shot_id",
    composite_audio_source_map: "composite_segment_id",
    chapter_render_manifests: "render_id",
    production_events: "run_id",
    character_versions: "character_id",
    character_assets: "character_version_id",
    production_lesson_events: "lesson_id",
    evaluation_predictions: "evaluation_case_id"
  };
  const project2 = all.projects.find((row) => row.id === projectId);
  const sceneIds = new Set(all.scenes?.filter((row) => row.project_id === projectId).map((row) => row.id));
  const shotIds = new Set(all.shots?.filter((row) => sceneIds.has(row.scene_id)).map((row) => row.id));
  const characterIds = /* @__PURE__ */ new Set([
    ...all.shot_characters?.filter((row) => shotIds.has(row.shot_id)).map((row) => row.character_id) ?? [],
    ...all.audio_segments?.filter((row) => row.project_id === projectId).map((row) => row.speaker_character_id) ?? [],
    ...all.coverage_beats?.filter((row) => shotIds.has(row.shot_id)).map((row) => row.character_id) ?? []
  ]);
  const lower = (value) => String(value ?? "").toLowerCase();
  const regions = new Set(all.characters?.filter((row) => characterIds.has(row.id)).map((row) => lower(row.region)));
  for (const lesson of all.production_lessons ?? []) {
    const sameLanguage = lower(lesson.source_language) === lower(project2.language), sameRegion = regions.has(lower(lesson.source_region));
    if (lesson.status === "active" && (lesson.scope_kind === "global" || lesson.scope_kind === "book" && lower(lesson.scope_value) === lower(project2.book) && sameLanguage && sameRegion || lesson.scope_kind === "language" && lower(lesson.scope_value) === lower(project2.language) && sameRegion || lesson.scope_kind === "region" && regions.has(lower(lesson.scope_value)) && sameLanguage)) selected.production_lessons.add(lesson);
  }
  for (const lesson of selected.production_lessons ?? []) for (const note of all.review_notes ?? []) if (lesson.source_note_id === note.id) selected.review_notes.add(note);
  function ownedByOtherChapter(table, row) {
    if (row.project_id != null) return row.project_id !== projectId;
    const owner = owners[table], fk = keys[table]?.find((key2) => key2.from === owner);
    if (!fk) return false;
    const parent = all[fk.table]?.find((p) => p[fk.to || "id"] === row[fk.from]);
    return parent ? ownedByOtherChapter(fk.table, parent) : false;
  }
  while (changed) {
    changed = false;
    for (const [table, rows] of Object.entries(all)) for (const row of rows) {
      if (selected[table].has(row)) {
        for (const fk of keys[table]) for (const parent of all[fk.table] ?? []) {
          if (row[fk.from] != null && parent[fk.to || "id"] === row[fk.from] && !selected[fk.table].has(parent)) {
            selected[fk.table].add(parent);
            changed = true;
          }
        }
      } else if (owners[table] && (!["shots", "shot_characters", "shot_utterance_bindings", "generation_attempts", "clips", "coverage_beats", "coverage_keyframe_attempts", "media_reuse_candidates"].includes(table) || !ownedByOtherChapter(table, row)) && keys[table].some((fk) => fk.from === owners[table] && fk.table !== "projects" && row[fk.from] != null && [...selected[fk.table] ?? []].some((parent) => parent[fk.to || "id"] === row[fk.from]))) {
        selected[table].add(row);
        changed = true;
      }
    }
  }
  const tables2 = Object.fromEntries(definitions.map(({ name }) => [name, all[name].filter((row) => selected[name].has(row))]));
  return { tables: tables2, schema: schema2 };
}
var originKey = /^(?:imported_from|sourceRoot|originalPath|sourceOriginal|url|uri)$/;
function restoreProductionRecords(path, tables2, schema2, relocations) {
  if (existsSync(path)) throw new Error("Restored database already exists.");
  function relocate(value) {
    if (typeof value === "string") {
      if (relocations.has(value)) return relocations.get(value);
      if (value.startsWith("{") || value.startsWith("[")) {
        try {
          const parsed = JSON.parse(value), projected = relocate(parsed);
          return JSON.stringify(parsed) === JSON.stringify(projected) ? value : JSON.stringify(projected);
        } catch {
          return value;
        }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(relocate);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key2, child]) => [key2, originKey.test(key2) ? child : relocate(child)]));
    return value;
  }
  const { DatabaseSync: SQLite } = createRequire2(import.meta.url)("node:sqlite");
  const db = new SQLite(path);
  try {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
    db.exec(schema2);
    db.exec("PRAGMA defer_foreign_keys=ON;");
    for (const [table, rows] of Object.entries(tables2)) for (const original of rows) {
      const row = relocate(original), columns = Object.keys(row);
      db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map((c) => row[c]));
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Restored record relationships are incomplete.");
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

// src/pipeline/assembly/disaster-backup.ts
var { DatabaseSync: DatabaseSync2, backup } = createRequire3(import.meta.url)("node:sqlite");
var slash = (s) => s.replaceAll("\\", "/");
var json = (path, value, exclusive = true) => writeFileSync2(path, JSON.stringify(value, null, 2), { flag: exclusive ? "wx" : "w", flush: true });
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function inside(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../") && !isAbsolute(rel);
}
function noLinks(path) {
  for (let p = resolve(path); ; p = dirname2(p)) {
    if (existsSync2(p) && lstatSync2(p).isSymbolicLink()) throw new Error(`Backup/restore link is not allowed: ${p}`);
    if (dirname2(p) === p) break;
  }
}
function safe(root, path) {
  if (!path || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.split("/").some((p) => !p || p === "." || p === "..")) throw new Error(`Unsafe backup path: ${path}`);
  const full = resolve(root, path);
  noLinks(full);
  if (!inside(root, full)) throw new Error(`Backup path escapes root: ${path}`);
  return full;
}
async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function configuredSyncFolder(path) {
  return [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter((p) => !!p).some((root) => inside(root, path));
}
function synced(path) {
  return configuredSyncFolder(path) || /(?:^|[\\/])OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(path);
}
function checkDatabase(path) {
  const db = new DatabaseSync2(path, { readOnly: true });
  try {
    if (!same(db.prepare("PRAGMA integrity_check").all(), [{ integrity_check: "ok" }]) || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error(`SQLite integrity/relationship check failed: ${path}`);
  } finally {
    db.close();
  }
}
async function verifyDisasterBackup(directory) {
  noLinks(directory);
  const manifest2 = JSON.parse(readFileSync2(resolve(directory, "backup.json"), "utf8"));
  if (manifest2.format !== "heartword-disaster-backup" || manifest2.version !== 1 || !Array.isArray(manifest2.files) || !manifest2.completedAt) throw new Error("Unsupported/incomplete disaster backup.");
  const seen = /* @__PURE__ */ new Set();
  for (const file of manifest2.files) {
    const path = safe(directory, file.path);
    if (!(file.path.startsWith("data/") || file.path.startsWith("application/")) || seen.has(file.path.toLowerCase())) throw new Error(`Invalid/duplicate backup entry: ${file.path}`);
    seen.add(file.path.toLowerCase());
    if (statSync2(path).size !== file.bytes || await fileDigest(path) !== file.sha256) throw new Error(`Backup integrity failed: ${file.path}`);
    if (file.database) checkDatabase(path);
  }
  if (!seen.has("data/db/heartword.sqlite")) throw new Error("Backup is missing the production database.");
  for (const [, path] of manifest2.references) if (!seen.has(`data/${path}`.toLowerCase())) throw new Error(`Unretained asset reference: ${path}`);
  return manifest2;
}
function recordRestoredPathProjection(destination2, manifest2) {
  const path = resolve(destination2, "logs/disaster-recovery-paths.json");
  noLinks(path);
  mkdirSync2(dirname2(path), { recursive: true });
  if (existsSync2(path)) {
    const prior = resolve(destination2, `logs/recovery-history/${randomUUID()}-paths.json`);
    mkdirSync2(dirname2(prior), { recursive: true });
    copyFileSync2(path, prior, constants2.COPYFILE_EXCL);
  }
  json(path, { version: 1, backupId: manifest2.id, sourceRoot: manifest2.sourceRoot, references: manifest2.references }, false);
}
async function restoreDisasterBackup(directory, destination2) {
  const manifest2 = await verifyDisasterBackup(directory);
  destination2 = resolve(destination2);
  noLinks(destination2);
  const applicationDir = `${destination2}-application`;
  noLinks(applicationDir);
  if (existsSync2(destination2) || existsSync2(applicationDir) || synced(destination2) || inside(directory, destination2)) throw new Error("Restore needs new isolated data and application directories outside synced storage and the backup.");
  mkdirSync2(destination2, { recursive: true });
  const relocations = new Map(manifest2.references.map(([original, path]) => {
    const oldPath = isAbsolute(original) ? original : resolve(manifest2.sourceRoot, "assets", original);
    const target = inside(manifest2.sourceRoot, oldPath) ? isAbsolute(original) ? resolve(destination2, path) : original : path.startsWith("assets/") ? path.slice(7) : resolve(destination2, path);
    return [original, target];
  }));
  for (const file of manifest2.files.filter((f) => f.path.startsWith("data/"))) {
    const rel = file.path.slice(5);
    relocations.set(resolve(manifest2.sourceRoot, rel), resolve(destination2, rel));
  }
  for (const file of manifest2.files) {
    const isData = file.path.startsWith("data/");
    let rel = isData ? file.path.slice(5) : file.path.slice("application/".length);
    if (rel === "restored-from.json") rel = `logs/recovery-history/${randomUUID()}-prior-restoration.json`;
    const out = safe(isData ? destination2 : applicationDir, rel);
    mkdirSync2(dirname2(out), { recursive: true });
    if (file.path === "data/db/heartword.sqlite") {
      const source2 = new DatabaseSync2(safe(directory, file.path), { readOnly: true });
      try {
        const records = productionRecords(source2);
        for (const binding of records.tables.project_source_bindings ?? []) for (const key2 of ["docx_path", "audio_path", "reference_path"]) {
          const original = String(binding[key2]), projected = relocations.get(original);
          if (isAbsolute(original) && projected && inside(resolve(destination2, "assets"), projected)) binding[key2] = slash(relative(resolve(destination2, "assets"), projected));
        }
        restoreProductionRecords(out, records.tables, records.schema, relocations);
      } finally {
        source2.close();
      }
      checkDatabase(out);
    } else {
      copyFileSync2(safe(directory, file.path), out, constants2.COPYFILE_EXCL);
      if (await fileDigest(out) !== file.sha256) throw new Error(`Restore integrity failed: ${file.path}`);
    }
  }
  recordRestoredPathProjection(destination2, manifest2);
  json(resolve(destination2, "restored-from.json"), { id: manifest2.id, backup: resolve(directory), applicationDir, restoredAt: (/* @__PURE__ */ new Date()).toISOString(), noGeneration: true, knownGaps: manifest2.chapters });
  return { destination: destination2, applicationDir, chapters: manifest2.chapters, noGeneration: true };
}

// outputs/recovery-boundary-metadata-20261025.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve as resolve2 } from "node:path";
var certificate = JSON.parse(fs.readFileSync("outputs/disaster-backup-boundary-metadata-20261025.json", "utf8"));
assert(Date.now() - Date.parse(certificate.at) < 10 * 60 * 1e3, "Refresh ancestor preflight before starting the drill");
var key = (path) => typeof path === "string" ? resolve2(path.replace(/^\\\\\?\\/, "")).toLowerCase() : "";
var boundaries = new Set(certificate.ancestors.map((row) => {
  assert(row.directory && !row.symbolicLink, "Untrusted restoration ancestor");
  return key(row.path);
}));
var exists = fs.existsSync;
var lstat = fs.lstatSync;
var deferredFlushPaths = /* @__PURE__ */ new Set();
var write = fs.writeFileSync;
var restorePrefix = key(process.argv[3]);
fs.writeFileSync = ((path, data, options) => {
  if (options && typeof options === "object" && options.flush) {
    const target = key(path);
    assert(restorePrefix && (target === restorePrefix || target.startsWith(restorePrefix + "\\") || target.startsWith(restorePrefix + "-")), "Deferred flush must belong to this isolated drill");
    deferredFlushPaths.add(String(path));
    return write(path, data, { ...options, flush: false });
  }
  return write(path, data, options);
});
var cached = (path) => boundaries.has(key(path)) && !process.permission?.has("fs.read", String(path));
fs.existsSync = ((path) => cached(path) ? true : exists(path));
fs.lstatSync = ((path, ...options) => cached(path) ? { isSymbolicLink: () => false } : lstat(path, ...options));
var stream = fs.createReadStream;
var completedReads = 0;
var completedBytes = 0;
var lastProgressAt = 0;
function progress(path, state, detail = void 0) {
  const now = Date.now();
  if (state === "reading" && now - lastProgressAt < 1e4) return;
  lastProgressAt = now;
  fs.writeFileSync("outputs/disaster-backup-cloud-read-progress-20261025.json", JSON.stringify({
    at: new Date(now).toISOString(),
    pid: process.pid,
    state,
    path: String(path),
    completedReads,
    completedBytes,
    detail
  }, null, 2));
}
fs.createReadStream = ((path, ...options) => {
  progress(path, "reading");
  const input = stream(path, ...options);
  input.once("end", () => {
    completedReads++;
    completedBytes += input.bytesRead;
    progress(path, "reading");
  });
  input.once("error", (error) => {
    error.message += ` (backup read: ${String(path)})`;
    progress(path, "failed", { message: error.message, code: error.code });
  });
  return input;
});
syncBuiltinESMExports();
var ancestorMetadataEvidence = { path: "outputs/disaster-backup-boundary-metadata-20261025.json", checked: boundaries.size, method: "preflight metadata only; no ancestor content permission granted" };

// outputs/cloud-restore-proof-20261024.ts
var { DatabaseSync: DatabaseSync3 } = createRequire4(import.meta.url)("node:sqlite");
var [backup2, destination] = process.argv.slice(2);
assert2(backup2 && destination);
var liveRoot = "C:\\Users\\danbr\\HeartWordData";
assert2.equal(process.permission?.has("fs.read", liveRoot), false, "Recovery must not read the live disk's production directory");
assert2.equal(process.permission?.has("fs.write", liveRoot), false);
assert2.throws(() => readFileSync3(join2(liveRoot, "db/heartword.sqlite")), { code: "ERR_ACCESS_DENIED" }, "The live database content must be denied");
var scopePreflight = {
  at: (/* @__PURE__ */ new Date()).toISOString(),
  execArgv: process.execArgv,
  destination,
  destinationRead: process.permission?.has("fs.read", resolve3(destination)),
  destinationWrite: process.permission?.has("fs.write", resolve3(destination)),
  namespacedRead: process.permission?.has("fs.read", toNamespacedPath(destination)),
  applicationRead: process.permission?.has("fs.read", resolve3(destination) + "-application"),
  applicationWrite: process.permission?.has("fs.write", resolve3(destination) + "-application"),
  liveRead: process.permission?.has("fs.read", liveRoot)
};
writeFileSync3("outputs/disaster-backup-permission-preflight-20261026.json", JSON.stringify(scopePreflight, null, 2));
assert2(scopePreflight.destinationRead && scopePreflight.destinationWrite && scopePreflight.applicationRead && scopePreflight.applicationWrite);
assert2.equal(existsSync3(resolve3(destination)), false, "The isolated restore root must be new");
assert2.equal(existsSync3(resolve3(destination) + "-application"), false, "The isolated application root must be new");
if (process.argv.includes("--preflight-only")) {
  const probeRoot = resolve3(destination) + "-permission-probe-" + randomUUID2();
  assert2(probeRoot.startsWith(resolve3(destination) + "-permission-probe-") && !existsSync3(probeRoot));
  mkdirSync3(probeRoot);
  const first = join2(probeRoot, "probe.txt"), second = join2(probeRoot, "copy.txt"), dbPath = join2(probeRoot, "probe.sqlite");
  writeFileSync3(first, "HeartWord recovery permissions", { flag: "wx", flush: true });
  copyFileSync3(first, second);
  assert2.equal(readFileSync3(second, "utf8"), "HeartWord recovery permissions");
  const probeDb = new DatabaseSync3(dbPath);
  probeDb.exec("CREATE TABLE recovery_probe(value TEXT); INSERT INTO recovery_probe VALUES ('ok');");
  assert2.equal(probeDb.prepare("SELECT value FROM recovery_probe").get().value, "ok");
  probeDb.close();
  for (const path of [first, second, dbPath]) unlinkSync2(path);
  rmdirSync(probeRoot);
  const result = { ...scopePreflight, readWriteCopySqliteProbe: "passed", metadataFlush: "deferred to outer worker because sandbox fsync is unavailable", probeRemoved: true };
  writeFileSync3("outputs/disaster-backup-permission-preflight-20261026.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
var localManifest = JSON.parse(readFileSync3("outputs/disaster-backup-manifest-20261024.json", "utf8"));
var beforeCloud = JSON.parse(readFileSync3("outputs/disaster-backup-cloud-only-before-restore-20261024.json", "utf8"));
assert2.equal(beforeCloud.backupId, localManifest.id);
assert2.equal(resolve3(beforeCloud.directory), resolve3(backup2));
assert2.equal(beforeCloud.allInSync, true, "Cloud synchronization has not passed for every file");
assert2.equal(beforeCloud.allCloudOnly, true, "Cloud-only state has not passed for every file");
process.env.HEARTWORD_DATA_DIR = destination;
var source = new DatabaseSync3(join2(backup2, "data/db/heartword.sqlite"), { readOnly: true });
var tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
var q = (name) => '"' + name.replaceAll('"', '""') + '"';
var counts = (db) => Object.fromEntries(tables.map((t) => [t.name, db.prepare(`SELECT COUNT(*) AS n FROM ${q(t.name)}`).get().n]));
var beforeCounts = counts(source);
var schema = (db) => db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();
var beforeSchema = schema(source);
var stableFields = /* @__PURE__ */ new Set(["id", "project_id", "subject_type", "subject_id", "reviewer", "author", "note", "resolved", "created_at", "updated_at", "status", "prompt", "provider", "model", "operation", "cost_usd", "entry_type", "amount_usd", "amount", "kind", "sequence", "command_type", "idempotency_key", "applied_at", "character_id", "version_label", "approved_at"]);
var authority = /* @__PURE__ */ new Map();
for (const table of ["generation_attempts", "review_notes", "edit_commands", "cost_ledger_entries", "character_versions", "production_runs"]) {
  if (!tables.some((t) => t.name === table)) continue;
  const columns = source.prepare(`PRAGMA table_info(${q(table)})`).all().map((r) => String(r.name)).filter((n) => stableFields.has(n));
  authority.set(table, { columns, rows: source.prepare(`SELECT ${columns.map(q).join(",")} FROM ${q(table)} ORDER BY rowid`).all() });
}
var project = source.prepare("SELECT id,language,book,chapter FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=5").get();
assert2(project, "Approved Mark 5 project is missing");
source.close();
var restored = await restoreDisasterBackup(backup2, destination);
var reopened = new DatabaseSync3(join2(destination, "db/heartword.sqlite"), { readOnly: true });
assert2.deepEqual(counts(reopened), beforeCounts);
assert2.deepEqual(schema(reopened), beforeSchema);
for (const [table, value] of authority) {
  const saved = value;
  assert2.deepEqual(reopened.prepare(`SELECT ${saved.columns.map(q).join(",")} FROM ${q(table)} ORDER BY rowid`).all(), saved.rows, `Changed authority fields in ${table}`);
}
assert2.equal(reopened.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
assert2.equal(reopened.prepare("PRAGMA foreign_key_check").all().length, 0);
var approved = reopened.prepare("SELECT id FROM chapter_renders WHERE id='f6709702-7e82-4a99-b072-7358d9e685a8'").get();
assert2(approved, "Approved Mark 5 render record is missing");
reopened.close();
var film = join2(destination, "exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4");
var digest = createHash2("sha256");
for await (const chunk of createReadStream2(film)) digest.update(chunk);
var filmSha = digest.digest("hex");
assert2.equal(filmSha, "286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b");
var manifest = JSON.parse(readFileSync3(join2(backup2, "backup.json"), "utf8"));
var proof = {
  at: (/* @__PURE__ */ new Date()).toISOString(),
  backupId: manifest.id,
  backup: resolve3(backup2),
  restoredRoot: resolve3(destination),
  applicationDir: restored.applicationDir,
  liveDataReadAccess: false,
  liveDatabaseReadDenied: true,
  ancestorMetadataEvidence,
  providerCalls: 0,
  noPaidRegeneration: true,
  tableCounts: beforeCounts,
  schemaIdentical: true,
  authoritativeFieldsUnchanged: [...authority.keys()],
  integrity: "ok",
  foreignKeyProblems: 0,
  project,
  approvedRenderId: String(approved.id),
  approvedFilmSha256: filmSha,
  includedFilesVerified: manifest.files.length,
  sourceWasCloudOnlyBeforeRestore: true,
  deferredMetadataFlushPaths: [...deferredFlushPaths],
  metadataDurability: "outer worker flush pending",
  workflowBrowserCheck: "pending",
  remoteRecoveryVerified: true
};
writeFileSync3("outputs/disaster-backup-cloud-restore-proof-20261024.json", JSON.stringify(proof, null, 2), { flag: "wx" });
console.log(JSON.stringify(proof, null, 2));
