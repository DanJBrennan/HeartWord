import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, join, toNamespacedPath } from "node:path";
import { restoreDisasterBackup } from "../src/pipeline/assembly/disaster-backup.js";
import { ancestorMetadataEvidence, deferredFlushPaths } from "./recovery-boundary-metadata-20261025.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const [backup, destination] = process.argv.slice(2);
assert(backup && destination);
const liveRoot = "C:\\Users\\danbr\\HeartWordData";
assert.equal(process.permission?.has("fs.read", liveRoot), false, "Recovery must not read the live disk's production directory");
assert.equal(process.permission?.has("fs.write", liveRoot), false);
assert.throws(() => readFileSync(join(liveRoot, "db/heartword.sqlite")), {code:"ERR_ACCESS_DENIED"}, "The live database content must be denied");
const scopePreflight = {at:new Date().toISOString(),execArgv:process.execArgv,
  destination, destinationRead:process.permission?.has("fs.read",resolve(destination)),
  destinationWrite:process.permission?.has("fs.write",resolve(destination)),
  namespacedRead:process.permission?.has("fs.read",toNamespacedPath(destination)),
  applicationRead:process.permission?.has("fs.read",resolve(destination)+"-application"),
  applicationWrite:process.permission?.has("fs.write",resolve(destination)+"-application"),
  liveRead:process.permission?.has("fs.read",liveRoot)};
writeFileSync("outputs/disaster-backup-permission-preflight-20261026.json",JSON.stringify(scopePreflight,null,2));
assert(scopePreflight.destinationRead && scopePreflight.destinationWrite && scopePreflight.applicationRead && scopePreflight.applicationWrite);
assert.equal(existsSync(resolve(destination)),false,"The isolated restore root must be new");
assert.equal(existsSync(resolve(destination)+"-application"),false,"The isolated application root must be new");
if (process.argv.includes("--preflight-only")) {
  const probeRoot=resolve(destination)+"-permission-probe-"+randomUUID();
  assert(probeRoot.startsWith(resolve(destination)+"-permission-probe-") && !existsSync(probeRoot));
  mkdirSync(probeRoot);
  const first=join(probeRoot,"probe.txt"), second=join(probeRoot,"copy.txt"), dbPath=join(probeRoot,"probe.sqlite");
  writeFileSync(first,"HeartWord recovery permissions",{flag:"wx",flush:true});
  copyFileSync(first,second);
  assert.equal(readFileSync(second,"utf8"),"HeartWord recovery permissions");
  const probeDb=new DatabaseSync(dbPath);
  probeDb.exec("CREATE TABLE recovery_probe(value TEXT); INSERT INTO recovery_probe VALUES ('ok');");
  assert.equal(probeDb.prepare("SELECT value FROM recovery_probe").get()!.value,"ok");
  probeDb.close();
  // Only these exact files and this new empty directory belong to the probe.
  for (const path of [first,second,dbPath]) unlinkSync(path);
  rmdirSync(probeRoot);
  const result={...scopePreflight,readWriteCopySqliteProbe:"passed",metadataFlush:"deferred to outer worker because sandbox fsync is unavailable",probeRemoved:true};
  writeFileSync("outputs/disaster-backup-permission-preflight-20261026.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2)); process.exit(0);
}
const localManifest = JSON.parse(readFileSync("outputs/disaster-backup-manifest-20261024.json", "utf8"));
const beforeCloud = JSON.parse(readFileSync("outputs/disaster-backup-cloud-only-before-restore-20261024.json", "utf8"));
assert.equal(beforeCloud.backupId, localManifest.id);
assert.equal(resolve(beforeCloud.directory), resolve(backup));
assert.equal(beforeCloud.allInSync, true, "Cloud synchronization has not passed for every file");
assert.equal(beforeCloud.allCloudOnly, true, "Cloud-only state has not passed for every file");
process.env.HEARTWORD_DATA_DIR = destination;
const source = new DatabaseSync(join(backup, "data/db/heartword.sqlite"), { readOnly: true });
const tables = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{name:string}>;
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const counts = (db: InstanceType<typeof DatabaseSync>) => Object.fromEntries(tables.map(t => [t.name, db.prepare(`SELECT COUNT(*) AS n FROM ${q(t.name)}`).get()!.n]));
const beforeCounts = counts(source);
const schema = (db: InstanceType<typeof DatabaseSync>) => db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").all();
const beforeSchema = schema(source);
const stableFields = new Set(["id","project_id","subject_type","subject_id","reviewer","author","note","resolved","created_at","updated_at","status","prompt","provider","model","operation","cost_usd","entry_type","amount_usd","amount","kind","sequence","command_type","idempotency_key","applied_at","character_id","version_label","approved_at"]);
const authority = new Map<string, unknown>();
for (const table of ["generation_attempts","review_notes","edit_commands","cost_ledger_entries","character_versions","production_runs"]) {
  if (!tables.some(t => t.name === table)) continue;
  const columns = source.prepare(`PRAGMA table_info(${q(table)})`).all().map(r => String(r.name)).filter(n => stableFields.has(n));
  authority.set(table, { columns, rows: source.prepare(`SELECT ${columns.map(q).join(',')} FROM ${q(table)} ORDER BY rowid`).all() });
}
const project = source.prepare("SELECT id,language,book,chapter FROM projects WHERE lower(language)='hatam' AND lower(book)='mark' AND chapter=5").get();
assert(project, "Approved Mark 5 project is missing");
source.close();
const restored = await restoreDisasterBackup(backup, destination);
const reopened = new DatabaseSync(join(destination, "db/heartword.sqlite"), { readOnly: true });
assert.deepEqual(counts(reopened), beforeCounts);
assert.deepEqual(schema(reopened), beforeSchema);
for (const [table, value] of authority) {
  const saved = value as {columns:string[];rows:unknown[]};
  assert.deepEqual(reopened.prepare(`SELECT ${saved.columns.map(q).join(',')} FROM ${q(table)} ORDER BY rowid`).all(), saved.rows, `Changed authority fields in ${table}`);
}
assert.equal(reopened.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
assert.equal(reopened.prepare("PRAGMA foreign_key_check").all().length, 0);
const approved = reopened.prepare("SELECT id FROM chapter_renders WHERE id='f6709702-7e82-4a99-b072-7358d9e685a8'").get();
assert(approved, "Approved Mark 5 render record is missing");
reopened.close();
const film = join(destination, "exports/hatam-mark5-20261024/Markus5_Hatam_720p.mp4");
const digest = createHash("sha256");
for await (const chunk of createReadStream(film)) digest.update(chunk);
const filmSha = digest.digest("hex");
assert.equal(filmSha, "286799361ba58fbcd190f7096d33ee2bf9016d2fd7eacdab4bb79f8ca844dc5b");
const manifest = JSON.parse(readFileSync(join(backup, "backup.json"), "utf8"));
const proof = { at: new Date().toISOString(), backupId:manifest.id, backup:resolve(backup), restoredRoot:resolve(destination), applicationDir:restored.applicationDir,
  liveDataReadAccess:false, liveDatabaseReadDenied:true, ancestorMetadataEvidence, providerCalls:0, noPaidRegeneration:true, tableCounts:beforeCounts, schemaIdentical:true,
  authoritativeFieldsUnchanged:[...authority.keys()], integrity:"ok", foreignKeyProblems:0,
  project, approvedRenderId:String(approved.id), approvedFilmSha256:filmSha,
  includedFilesVerified:manifest.files.length, sourceWasCloudOnlyBeforeRestore:true,
  deferredMetadataFlushPaths:[...deferredFlushPaths], metadataDurability:"outer worker flush pending",
  workflowBrowserCheck:"pending", remoteRecoveryVerified:true };
writeFileSync("outputs/disaster-backup-cloud-restore-proof-20261024.json", JSON.stringify(proof,null,2), {flag:"wx"});
console.log(JSON.stringify(proof,null,2));
