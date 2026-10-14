import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";
import { discoverSourcePaths } from "../ingestion/source-catalog.js";

type Row = Record<string, string | number | null>;
type Tables = Record<string, Row[]>;
interface ForeignKey { table: string; from: string; to: string }
export interface PreservedFile {
  path: string; sha256: string; bytes: number; originals: string[]; references: string[];
  role: "original" | "derived";
}
export interface ChapterPackageManifest {
  format: "heartword-chapter"; version: 1; project: Row; createdAt: string;
  application: { version: string; gitCommit: string; node: string; ffmpeg: string; schemaSha256: string };
  retention: { originals: "indefinite"; rejectedAndSuperseded: "indefinite"; automaticDeletion: false };
  sourceRoot: string; schemaFile: string; recordsFile: string; recordsSha256: string;
  files: PreservedFile[]; problems: string[]; editability: string[];
}
export interface PackageOptions { extraFiles?: string[]; includeApplication?: boolean }
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const slash = (value: string) => value.replaceAll("\\", "/");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
function inside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../") && !isAbsolute(rel);
}
function portablePath(root: string, path: string): string {
  if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").some(p => p === ".." || p === "." || !p) || /^[A-Za-z]:/.test(path)) throw new Error(`Invalid package path: ${path}`);
  const full = resolve(root, path);
  if (!inside(root, full)) throw new Error(`Package path escapes root: ${path}`);
  // Reject symlinks/junctions at any existing level, including the root.
  let cursor = full;
  while (inside(root, cursor)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Package link is not portable: ${cursor}`);
    if (cursor === resolve(root)) break;
    cursor = dirname(cursor);
  }
  return full;
}

/** Retain project-owned rows, their children, and the exact shared dependencies.
 * Never pull another chapter in through a shared character or reusable take. */
export function productionRecords(db: DatabaseSync, projectId?: string): { tables: Tables; schema: string } {
  const definitions = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string; sql: string }>;
  const all: Tables = {}, selected: Record<string, Set<Row>> = {}, keys: Record<string, ForeignKey[]> = {};
  for (const { name } of definitions) {
    all[name] = db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all() as Row[];
    selected[name] = new Set(all[name]!.filter(row => name === "projects" ? row.id === projectId : row.project_id === projectId));
    keys[name] = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as unknown as ForeignKey[];
  }
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name").all() as Array<{ sql: string }>;
  const schema = [...definitions, ...indexes].map(d => `${d.sql};`).join("\n");
  if (projectId === undefined) return { tables: all, schema };
  if (!selected.projects?.size) throw new Error("Project not found.");
  let changed = true;
  const owners: Record<string, string> = { shots: "scene_id", shot_characters: "shot_id", generation_attempts: "shot_id",
    media_reuse_candidates: "target_shot_id", coverage_beats: "shot_id", coverage_keyframe_attempts: "coverage_beat_id",
    clips: "shot_id", composite_audio_source_map: "composite_segment_id", chapter_render_manifests: "render_id",
    production_events: "run_id", character_versions: "character_id", character_assets: "character_version_id",
    production_lesson_events: "lesson_id", evaluation_predictions: "evaluation_case_id" };
  const project = all.projects!.find(row => row.id === projectId)!;
  const sceneIds = new Set(all.scenes?.filter(row => row.project_id === projectId).map(row => row.id));
  const shotIds = new Set(all.shots?.filter(row => sceneIds.has(row.scene_id)).map(row => row.id));
  const characterIds = new Set([
    ...(all.shot_characters?.filter(row => shotIds.has(row.shot_id)).map(row => row.character_id) ?? []),
    ...(all.audio_segments?.filter(row => row.project_id === projectId).map(row => row.speaker_character_id) ?? []),
    ...(all.coverage_beats?.filter(row => shotIds.has(row.shot_id)).map(row => row.character_id) ?? [])
  ]);
  const lower = (value: Row[string] | undefined) => String(value ?? "").toLowerCase();
  const regions = new Set(all.characters?.filter(row => characterIds.has(row.id)).map(row => lower(row.region)));
  for (const lesson of all.production_lessons ?? []) {
    const sameLanguage = lower(lesson.source_language) === lower(project.language), sameRegion = regions.has(lower(lesson.source_region));
    if (lesson.status === "active" && (lesson.scope_kind === "global" ||
      (lesson.scope_kind === "book" && lower(lesson.scope_value) === lower(project.book) && sameLanguage && sameRegion) ||
      (lesson.scope_kind === "language" && lower(lesson.scope_value) === lower(project.language) && sameRegion) ||
      (lesson.scope_kind === "region" && regions.has(lower(lesson.scope_value)) && sameLanguage))) selected.production_lessons!.add(lesson);
  }
  for (const lesson of selected.production_lessons ?? []) for (const note of all.review_notes ?? []) if (lesson.source_note_id === note.id) selected.review_notes!.add(note);
  function ownedByOtherChapter(table: string, row: Row): boolean {
    if (row.project_id != null) return row.project_id !== projectId;
    const owner = owners[table], fk = keys[table]?.find(key => key.from === owner);
    if (!fk) return false; // shared canon
    const parent = all[fk.table]?.find(p => p[fk.to || "id"] === row[fk.from]);
    return parent ? ownedByOtherChapter(fk.table, parent) : false;
  }
  while (changed) {
    changed = false;
    for (const [table, rows] of Object.entries(all)) for (const row of rows) {
      if (selected[table]!.has(row)) {
        for (const fk of keys[table]!) for (const parent of all[fk.table] ?? []) {
          if (row[fk.from] != null && parent[fk.to || "id"] === row[fk.from] && !selected[fk.table]!.has(parent)) {
            selected[fk.table]!.add(parent); changed = true;
          }
        }
      } else if (owners[table] && (!["shots", "shot_characters", "generation_attempts", "clips", "coverage_beats", "coverage_keyframe_attempts", "media_reuse_candidates"].includes(table) || !ownedByOtherChapter(table, row)) && keys[table]!.some(fk => fk.from === owners[table] &&
        fk.table !== "projects" && row[fk.from] != null && [...(selected[fk.table] ?? [])].some(parent => parent[fk.to || "id"] === row[fk.from]))) {
        selected[table]!.add(row); changed = true;
      }
    }
  }
  // Donor dependencies may have brought their project identity/scene along;
  // only their referenced records are retained, never their whole chapter.
  const tables = Object.fromEntries(definitions.map(({ name }) => [name, all[name]!.filter(row => selected[name]!.has(row))]));
  return { tables, schema };
}

const pathKey = /(?:path|file|keyframe|^source$|^src$|^inputs$|^references$|^pictureBase$|^audioBase$|^basePath$)/i;
const originKey = /^(?:imported_from|sourceRoot|originalPath|sourceOriginal|url|uri)$/;
const fileSuffix = /\.(?:mp4|mov|mkv|webm|wav|mp3|flac|m4a|aac|ogg|png|jpe?g|webp|exr|tiff?|blend\d*|docx|json|py|ttf|otf|vdb|abc)$/i;

/** No provider imports, retries, or generation are reachable from preservation. */
export function inspectChapterPackage(db: DatabaseSync, dataDir: string, projectId: string, options: PackageOptions = {}) {
  // Read a consistent SQLite snapshot; immutable files are rehashed when copied.
  db.exec("BEGIN");
  let snapshot: ReturnType<typeof productionRecords>;
  try { snapshot = productionRecords(db, projectId); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
  const { tables, schema } = snapshot;
  const project = tables.projects!.find(p => p.id === projectId)!;
  const assets = resolve(dataDir, "assets"), bySource = new Map<string, PreservedFile>();
  const problems: string[] = [], editability: string[] = [];
  const pendingJson: string[] = [];
  // Immutable sidecars can name the old computer's absolute paths. Whole-data
  // restoration records their retained targets without rewriting/hash-changing
  // those source documents. The same saved projection serves later audits.
  const projectionFile = resolve(dataDir, "logs/disaster-recovery-paths.json");
  const projection = existsSync(projectionFile) ? JSON.parse(readFileSync(projectionFile, "utf8")) as { version: number; references: Array<[string, string]> } : null;
  if (projection && (projection.version !== 1 || !Array.isArray(projection.references))) throw new Error("Invalid saved recovery path projection.");
  const restoredReferences = new Map(projection?.references ?? []);
  function add(value: string, reference: string, role: PreservedFile["role"] = "original", lockedDependency = false) {
    const retained = restoredReferences.get(value);
    const full = retained ? portablePath(dataDir, retained) : isAbsolute(value) ? resolve(value) : resolve(assets, value);
    if (!existsSync(full) || !statSync(full).isFile()) { problems.push(`Missing asset: ${value} (${reference})`); return; }
    const actual = realpathSync(full);
    if (inside(resolve(dataDir, "db"), actual)) throw new Error("The live database is represented by its consistent record snapshot; do not copy live database files into the package.");
    if (bySource.has(actual)) {
      const prior = bySource.get(actual)!; prior.references.push(reference);
      if (!prior.originals.includes(value)) prior.originals.push(value);
      if (role === "original") prior.role = role;
      return;
    }
    const sha256 = hash(readFileSync(actual));
    const path = inside(dataDir, actual) ? slash(relative(resolve(dataDir), actual)) : `assets/preserved-external/${sha256}/${basename(actual)}`;
    bySource.set(actual, { path, sha256, bytes: statSync(actual).size, originals: [value], references: [reference], role });
    if (extname(actual).toLowerCase() === ".json" && !reference.startsWith("producer-supplied dependency")) pendingJson.push(actual);
    // Retain provider settings, native stems, and review sidecars beside takes.
    for (const companion of [`${full}.json`, `${full}.ambience.wav`, full.replace(/\.[^.]+$/, ".json")]) {
      if (companion !== full && existsSync(companion)) add(companion, `sidecar:${value}`);
    }
    if (/\.blend\d*$/i.test(actual) && !lockedDependency) {
      const lock = `${full}.dependencies.json`;
      if (!inside(assets, full)) problems.push(`Place the portable Blender bundle under HeartWordData/assets before packaging: ${full}`);
      if (!existsSync(lock)) problems.push(`Blender dependency lock required: ${lock}. Use scripts/blender/preserve_dependencies.py.`);
      else {
        const dependency = JSON.parse(readFileSync(lock, "utf8")) as { schemaVersion: number; portable: boolean; blendSha256: string; blenderVersion: string; bundleRoot?: string; files: Array<{ path: string; sha256: string }> };
        const bundleRoot = resolve(dirname(full), dependency.bundleRoot ?? ".");
        if (!inside(assets, bundleRoot)) throw new Error("Blender bundle root must be inside the asset area.");
        if (dependency.schemaVersion !== 1 || dependency.portable !== true || dependency.blendSha256 !== sha256 || !dependency.blenderVersion || !Array.isArray(dependency.files)) problems.push(`Invalid/stale Blender dependency lock: ${lock}`);
        else for (const item of dependency.files) {
          const file = portablePath(bundleRoot, item.path);
          add(file, `Blender dependency:${value}`, "original", true);
          if (existsSync(file) && hash(readFileSync(file)) !== item.sha256) problems.push(`Changed Blender dependency: ${file}`);
        }
        add(lock, `Blender dependency lock:${value}`);
      }
    }
  }
  function visit(value: unknown, key: string, reference: string, legacyGeneratedRoot = false) {
    if (typeof value === "string") {
      if (originKey.test(key)) return;
      if (value.startsWith("{") || value.startsWith("[")) {
        let parsed: unknown; try { parsed = JSON.parse(value); } catch { return; }
        visit(parsed, key, reference, legacyGeneratedRoot); return;
      }
      if (/^(?:https?:|data:|s3:)/i.test(value)) return;
      const full = isAbsolute(value) ? value : resolve(assets, value);
      if (legacyGeneratedRoot && key === "src" && !isAbsolute(value)) add(`generated/${value}`, `${reference} (legacy patch recipe: generated root)`);
      else if (pathKey.test(key) && (fileSuffix.test(value) || existsSync(full))) add(value, reference, /thumbnail|proxy/i.test(key) ? "derived" : "original");
      else if (fileSuffix.test(value) && existsSync(full)) add(value, reference, /thumbnail|proxy/i.test(key) ? "derived" : "original");
    } else if (Array.isArray(value)) value.forEach(item => visit(item, key, reference, legacyGeneratedRoot));
    else if (value && typeof value === "object") {
      const recipe = value as Record<string, unknown>;
      // This retained historical patch format is defined by patchtool.py and
      // v73tool.py: picture src values are relative to assets/generated.
      const generatedRoot = legacyGeneratedRoot || (typeof recipe.pictureBase === "string" && Array.isArray(recipe.picture));
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey, `${reference}.${childKey}`, generatedRoot);
    }
  }
  for (const [table, rows] of Object.entries(tables)) for (const row of rows) visit(row, "", `${table}:${row.id ?? row.render_id ?? row.project_id ?? "relationship"}`);
  // Legacy chapters can predate project_source_bindings.
  if (!tables.project_source_bindings?.some(row => row.project_id === projectId)) {
    try {
      const source = discoverSourcePaths(project as unknown as { language: string; book: string; chapter: number }, undefined, dataDir, false);
      add(source.docxPath, "legacy verified source text"); add(source.referencePath, "legacy reference text");
    } catch (error) { problems.push(`Source discovery: ${(error as Error).message}`); }
  }
  function addTree(path: string) {
    if (!existsSync(path)) { problems.push(`Missing producer-supplied dependency: ${path}`); return; }
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Supply the actual dependency directory rather than a link: ${path}`);
    if (statSync(path).isDirectory()) for (const name of readdirSync(path)) addTree(resolve(path, name));
    else add(path, "producer-supplied dependency");
  }
  for (const file of options.extraFiles ?? []) addTree(resolve(file));
  // A Git commit alone does not identify uncommitted runtime fixes. Retain the
  // actual application source and lockfile, excluding credentials/dependencies.
  function addApplication(path: string) {
    if (!existsSync(path)) return;
    if (/^(?:\.env(?:\..*)?|node_modules|\.git|\.venv|__pycache__|dist)$/.test(basename(path))) return;
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Application source link is not portable: ${path}`);
    if (statSync(path).isDirectory()) for (const name of readdirSync(path)) addApplication(resolve(path, name));
    else {
      const full = realpathSync(path), bytes = statSync(full).size;
      bySource.set(full, { path: `application/${slash(relative(resolve("."), full))}`, bytes, sha256: hash(readFileSync(full)), originals: [full], references: ["application source snapshot"], role: "original" });
    }
  }
  if (options.includeApplication !== false) for (const path of ["src", "scripts", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.base.json", "vite.config.ts", "vitest.config.ts", "docs/design/fdl"]) addApplication(resolve(path));
  // Earlier voicing used fixed names and left superseded files unregistered.
  const castDirectory = resolve(assets, "generated", String(project.language), `${project.book}-${project.chapter}`, "composite_cast_master");
  if (inside(assets, castDirectory) && existsSync(castDirectory)) for (const name of readdirSync(castDirectory)) if (statSync(resolve(castDirectory, name)).isFile()) add(resolve(castDirectory, name), "retained cast-master history");
  for (let i = 0; i < pendingJson.length; i++) {
    const file = pendingJson[i]!;
    if (file.endsWith(".dependencies.json")) continue; // interpreted relative to its locked bundle above
    let parsed: unknown; try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch { problems.push(`Unreadable JSON dependency: ${file}`); continue; }
    visit(parsed, "", file);
  }
  // Stored hash authorities must match the pixels/audio being preserved.
  for (const row of tables.character_assets ?? []) if (row.content_hash && row.path) {
    const file = [...bySource.values()].find(f => f.originals.includes(String(row.path)));
    if (file && file.sha256 !== String(row.content_hash).toLowerCase()) problems.push(`Canon hash mismatch: ${row.id}`);
  }
  for (const row of tables.production_audio_assets ?? []) if (row.sha256 && row.path) {
    const file = [...bySource.values()].find(f => f.originals.includes(String(row.path)));
    if (file && file.sha256 !== row.sha256) problems.push(`Soundtrack hash mismatch: ${row.id}`);
  }
  for (const row of tables.project_source_bindings ?? []) for (const kind of ["docx", "audio", "reference"]) {
    const file = [...bySource.values()].find(f => f.originals.includes(String(row[`${kind}_path`])));
    if (file && file.sha256 !== row[`${kind}_hash`]) problems.push(`Bound source hash mismatch: ${kind}`);
  }
  for (const render of tables.chapter_renders ?? []) if (render.project_id === projectId) {
    const mapping = tables.chapter_render_manifests?.find(m => m.render_id === render.id);
    if (!mapping) editability.push(`Render ${render.id} has no saved timeline/source map; its picture edit cannot be reconstructed from its MP4.`);
    else {
      const picture = JSON.parse(String(mapping.timeline_json)), audio = JSON.parse(String(mapping.source_audio_json));
      if (!Array.isArray(picture) || !Array.isArray(audio)) editability.push(`Render ${render.id} retains a legacy/custom recipe, not the executable ordered timeline and exact source map. Preserve its original editor/scripts and dependencies; normalize that recipe before automatic picture rebuilding.`);
    }
  }
  if (!(tables.audio_segments ?? []).some(a => a.project_id === projectId && a.layer === "original_reading")) editability.push("No saved original-reading intervals.");
  const manifest: ChapterPackageManifest = {
    format: "heartword-chapter", version: 1, project, createdAt: new Date().toISOString(),
    application: { version: JSON.parse(readFileSync("package.json", "utf8")).version, gitCommit: toolVersion("git", ["rev-parse", "HEAD"]), node: process.version, ffmpeg: toolVersion("ffmpeg", ["-version"]).split("\n")[0]!, schemaSha256: hash(schema) },
    retention: { originals: "indefinite", rejectedAndSuperseded: "indefinite", automaticDeletion: false },
    sourceRoot: resolve(dataDir), schemaFile: "schema.sql", recordsFile: "records.json", recordsSha256: hash(JSON.stringify(tables)),
    files: [...bySource.values()], problems: [...new Set(problems)], editability
  };
  return { manifest, tables, schema, sources: bySource };
}
function toolVersion(program: string, args: string[]) {
  try { return execFileSync(program, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "not_reported"; }
}

export function exportChapterPackage(db: DatabaseSync, dataDir: string, projectId: string, destination: string, options: PackageOptions = {}): ChapterPackageManifest {
  if (existsSync(destination)) throw new Error("Package destination already exists; use a new directory.");
  const snapshot = inspectChapterPackage(db, dataDir, projectId, options);
  if (snapshot.manifest.problems.length) throw new Error(`Preservation held:\n${snapshot.manifest.problems.join("\n")}`);
  mkdirSync(destination, { recursive: true });
  for (const [source, file] of snapshot.sources) {
    const out = portablePath(destination, file.path); mkdirSync(dirname(out), { recursive: true });
    copyFileSync(source, out, constants.COPYFILE_EXCL);
    if (hash(readFileSync(out)) !== file.sha256) throw new Error(`Asset changed during packaging: ${source}`);
  }
  writeFileSync(resolve(destination, "schema.sql"), snapshot.schema, { flag: "wx" });
  writeFileSync(resolve(destination, "records.json"), JSON.stringify(snapshot.tables), { flag: "wx" });
  // Completion marker is written last. A partial directory is never a package.
  writeFileSync(resolve(destination, "chapter-package.json"), JSON.stringify(snapshot.manifest, null, 2), { flag: "wx" });
  return snapshot.manifest;
}

export function verifyChapterPackage(directory: string): ChapterPackageManifest {
  const manifest = JSON.parse(readFileSync(portablePath(directory, "chapter-package.json"), "utf8")) as ChapterPackageManifest;
  if (manifest.format !== "heartword-chapter" || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.problems.length) throw new Error("Unsupported or incomplete chapter package.");
  if (hash(readFileSync(portablePath(directory, manifest.schemaFile))) !== manifest.application.schemaSha256 || hash(readFileSync(portablePath(directory, manifest.recordsFile))) !== manifest.recordsSha256) throw new Error("Package records/schema integrity failed.");
  const seen = new Set<string>();
  for (const file of manifest.files) {
    const path = portablePath(directory, file.path);
    if (seen.has(file.path.toLowerCase())) throw new Error(`Duplicate portable asset: ${file.path}`);
    seen.add(file.path.toLowerCase());
    if (!existsSync(path)) throw new Error(`Missing retained asset: ${file.path}`);
    if (statSync(path).size !== file.bytes || hash(readFileSync(path)) !== file.sha256) throw new Error(`Retained asset integrity failed: ${file.path}`);
  }
  return manifest;
}

/** Restores into a new root, never merges over an existing production. Original
 * records remain in the package; only exact file references in the working DB
 * are relocated. Prompts, prose, decisions and timestamps remain unchanged. */
export function restoreChapterPackage(directory: string, destination: string): ChapterPackageManifest {
  const manifest = verifyChapterPackage(directory);
  if (existsSync(destination)) throw new Error("Restore requires a new data directory; existing production is protected.");
  const tables = JSON.parse(readFileSync(portablePath(directory, manifest.recordsFile), "utf8")) as Tables;
  const relocations = new Map<string, string>();
  for (const file of manifest.files) for (const original of file.originals) {
    const rel = file.path.replace(/^assets\//, "");
    const target = file.path.startsWith("assets/") ? rel : resolve(destination, file.path);
    relocations.set(original, target);
  }
  mkdirSync(resolve(destination, "db"), { recursive: true });
  for (const file of manifest.files) {
    const target = portablePath(destination, file.path); mkdirSync(dirname(target), { recursive: true });
    copyFileSync(portablePath(directory, file.path), target, constants.COPYFILE_EXCL);
    if (hash(readFileSync(target)) !== file.sha256) throw new Error(`Restore integrity failed: ${file.path}`);
  }
  restoreProductionRecords(resolve(destination, "db", "heartword.sqlite"), tables, readFileSync(portablePath(directory, manifest.schemaFile), "utf8"), relocations);
  writeFileSync(resolve(destination, "restored-from.json"), JSON.stringify({ package: resolve(directory), recordsSha256: manifest.recordsSha256, restoredAt: new Date().toISOString(), noGeneration: true }, null, 2), { flag: "wx" });
  return manifest;
}

/** Shared path projection for chapter packages and whole-data recovery. The
 * unchanged baseline remains in the package/SQLite snapshot. Never update an
 * immutable history row in place to relocate a restored working database. */
export function restoreProductionRecords(path: string, tables: Tables, schema: string, relocations: Map<string, string>): void {
  if (existsSync(path)) throw new Error("Restored database already exists.");
  function relocate(value: unknown): unknown {
    if (typeof value === "string") {
      if (relocations.has(value)) return relocations.get(value)!;
      if (value.startsWith("{") || value.startsWith("[")) {
        try {
          const parsed: unknown = JSON.parse(value), projected = relocate(parsed);
          return JSON.stringify(parsed) === JSON.stringify(projected) ? value : JSON.stringify(projected);
        } catch { return value; }
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(relocate);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, originKey.test(key) ? child : relocate(child)]));
    return value;
  }
  const { DatabaseSync: SQLite } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  const db = new SQLite(path);
  try {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
    db.exec(schema);
    db.exec("PRAGMA defer_foreign_keys=ON;");
    for (const [table, rows] of Object.entries(tables)) for (const original of rows) {
      const row = relocate(original) as Row, columns = Object.keys(row);
      db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...columns.map(c => row[c]!));
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Restored record relationships are incomplete.");
    db.exec("COMMIT");
  } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}
