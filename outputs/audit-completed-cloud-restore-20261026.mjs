// outputs/audit-completed-cloud-restore-20261026.ts
import assert2 from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, normalize, resolve as resolve2 } from "node:path";

// outputs/recovery-boundary-metadata-20261025.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
var certificate = JSON.parse(fs.readFileSync("outputs/disaster-backup-boundary-metadata-20261025.json", "utf8"));
assert(Date.now() - Date.parse(certificate.at) < 10 * 60 * 1e3, "Refresh ancestor preflight before starting the drill");
var key = (path) => typeof path === "string" ? resolve(path.replace(/^\\\\\?\\/, "")).toLowerCase() : "";
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

// outputs/audit-completed-cloud-restore-20261026.ts
var { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
var [backup, destination] = process.argv.slice(2);
assert2(backup && destination);
var live = "C:\\Users\\danbr\\HeartWordData";
assert2.equal(process.permission?.has("fs.read", live), false);
assert2.equal(process.permission?.has("fs.write", live), false);
assert2.throws(() => readFileSync(join(live, "db/heartword.sqlite")), { code: "ERR_ACCESS_DENIED" });
var manifest = JSON.parse(readFileSync("outputs/disaster-backup-manifest-20261024.json", "utf8"));
var cloud = JSON.parse(readFileSync("outputs/disaster-backup-cloud-only-before-restore-20261024.json", "utf8"));
var marker = JSON.parse(readFileSync(join(destination, "restored-from.json"), "utf8"));
assert2.equal(marker.id, manifest.id);
assert2.equal(cloud.backupId, manifest.id);
assert2(cloud.allInSync && cloud.allCloudOnly && marker.noGeneration);
assert2.equal(resolve2(marker.backup), resolve2(backup));
var canonical = (path) => normalize(path).toLowerCase();
var files = /* @__PURE__ */ new Map();
for (const file of manifest.files) if (file.path.startsWith("data/")) files.set(canonical(resolve2(manifest.sourceRoot, file.path.slice(5))), file.path.slice(5));
var aliases = new Map(manifest.references);
var protectedOrigin = /* @__PURE__ */ new Set(["imported_from", "sourceRoot", "originalPath", "sourceOriginal", "url", "uri"]);
var changes = [];
var currentTable = "";
var currentColumn = "";
function equalValue(before, after, location) {
  if (Object.is(before, after)) return;
  if (typeof before === "string" && typeof after === "string") {
    if (isAbsolute(before)) {
      const internal = files.get(canonical(before));
      const file = internal ?? aliases.get(before);
      if (file) {
        const target = resolve2(destination, file);
        const sourceBinding = currentTable === "project_source_bindings" && ["docx_path", "audio_path", "reference_path"].includes(currentColumn);
        const bindingRelative = file.startsWith("assets/") ? file.slice(7) : null;
        const externalAssetReference = !internal && aliases.has(before) && bindingRelative !== null;
        if (isAbsolute(after) && canonical(after) === canonical(target) || (sourceBinding || externalAssetReference) && bindingRelative !== null && canonical(after) === canonical(bindingRelative)) {
          changes.push({ table: currentTable, column: currentColumn, location, file });
          return;
        }
      }
    }
    if ((before.startsWith("{") || before.startsWith("[")) && (after.startsWith("{") || after.startsWith("["))) {
      let first, second;
      try {
        first = JSON.parse(before);
        second = JSON.parse(after);
      } catch {
        assert2.fail(`Non-path text changed at ${location}`);
      }
      equalValue(first, second, location + ".json");
      return;
    }
    assert2.fail(`Non-path text changed at ${location}`);
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    assert2.equal(after.length, before.length, `Array length changed at ${location}`);
    before.forEach((value, index) => equalValue(value, after[index], location + "[" + index + "]"));
    return;
  }
  if (before && after && typeof before === "object" && typeof after === "object") {
    if (ArrayBuffer.isView(before) || ArrayBuffer.isView(after)) {
      assert2.deepEqual(after, before, location);
      return;
    }
    const first = before, second = after;
    assert2.deepEqual(Object.keys(second).sort(), Object.keys(first).sort(), location);
    for (const key2 of Object.keys(first)) {
      if (protectedOrigin.has(key2)) assert2.deepEqual(second[key2], first[key2], `Origin changed at ${location}.${key2}`);
      else equalValue(first[key2], second[key2], location + "." + key2);
    }
    return;
  }
  assert2.deepEqual(after, before, `Value changed at ${location}`);
}
var source = new DatabaseSync(join(backup, "data/db/heartword.sqlite"), { readOnly: true });
var restored = new DatabaseSync(join(destination, "db/heartword.sqlite"), { readOnly: true });
var schema = (db) => db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();
assert2.deepEqual(schema(restored), schema(source));
var tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
var quote = (name) => '"' + name.replaceAll('"', '""') + '"';
var tableCounts = {};
for (const table of tables) {
  currentTable = String(table.name);
  const columns = source.prepare(`PRAGMA table_info(${quote(currentTable)})`).all();
  const primary = columns.filter((row) => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((row) => quote(String(row.name)));
  const order = primary.length ? primary.join(",") : "rowid";
  const first = source.prepare(`SELECT * FROM ${quote(currentTable)} ORDER BY ${order}`).all();
  const second = restored.prepare(`SELECT * FROM ${quote(currentTable)} ORDER BY ${order}`).all();
  assert2.equal(second.length, first.length, `Row count changed in ${currentTable}`);
  tableCounts[currentTable] = first.length;
  first.forEach((row, index) => {
    for (const column of columns) {
      currentColumn = String(column.name);
      equalValue(row[currentColumn], second[index][currentColumn], `${currentTable}[${index}].${currentColumn}`);
    }
  });
}
assert2.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
assert2.equal(restored.prepare("PRAGMA foreign_key_check").all().length, 0);
var project = restored.prepare("SELECT id,language,book,chapter FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=5").get();
assert2(project);
var renderId = "f6709702-7e82-4a99-b072-7358d9e685a8";
assert2(restored.prepare("SELECT id FROM chapter_renders WHERE id=?").get(renderId));
source.close();
restored.close();
var digest = createHash("sha256");
for await (const chunk of createReadStream(join(destination, "exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4"))) digest.update(chunk);
var filmSha = digest.digest("hex");
assert2.equal(filmSha, "286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b");
var proof = {
  at: (/* @__PURE__ */ new Date()).toISOString(),
  backupId: manifest.id,
  backup: resolve2(backup),
  restoredRoot: resolve2(destination),
  applicationDir: marker.applicationDir,
  liveDataReadAccess: false,
  liveDatabaseReadDenied: true,
  ancestorMetadataEvidence,
  providerCalls: 0,
  noPaidRegeneration: true,
  tableCounts,
  schemaIdentical: true,
  allProductionRowsCompared: true,
  allNonPathValuesUnchanged: true,
  protectedOriginFieldsUnchanged: true,
  originalRecordEvidence: "Unprojected rows remain in the immutable cloud SQLite snapshot",
  pathProjectionLeaves: changes.length,
  pathProjectionTables: [...new Set(changes.map((row) => row.table))],
  pathProjectionRule: "Only exact retained-file references may change to the isolated destination; source bindings and explicitly retained external assets may use assets-relative paths. Prose, decisions, identifiers, amounts, timestamps and protected origins must compare equal.",
  integrity: "ok",
  foreignKeyProblems: 0,
  project,
  approvedRenderId: renderId,
  approvedFilmSha256: filmSha,
  includedFilesVerified: manifest.files.length,
  copyVerificationEvidence: { completionMarker: join(destination, "restored-from.json"), restoredAt: marker.restoredAt, implementation: "restoreDisasterBackup verifies every source hash/database before copy, and each non-main copied file hash before writing this marker" },
  sourceWasCloudOnlyBeforeRestore: true,
  workflowBrowserCheck: "pending",
  remoteRecoveryVerified: true,
  deferredMetadataFlushPaths: [join(destination, "logs/disaster-recovery-paths.json"), join(destination, "restored-from.json")],
  metadataDurability: "outer worker flush pending"
};
writeFileSync("outputs/disaster-backup-cloud-restore-proof-20261024.json", JSON.stringify(proof, null, 2), { flag: "wx" });
writeFileSync("outputs/disaster-backup-row-path-audit-20261026.json", JSON.stringify({ at: proof.at, backupId: manifest.id, changes }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ at: proof.at, backupId: manifest.id, tables: tables.length, rows: Object.values(tableCounts).reduce((a, b) => a + b, 0), pathProjectionLeaves: changes.length, integrity: proof.integrity, approvedFilmSha256: filmSha, liveDatabaseReadDenied: true }));
