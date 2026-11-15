// outputs/disaster-backup-live-drill.ts
import { createRequire as createRequire4 } from "node:module";
import { readFileSync as readFileSync7, writeFileSync as writeFileSync3 } from "node:fs";
import { resolve as resolve4 } from "node:path";
import assert from "node:assert/strict";

// src/pipeline/assembly/chapter-package.ts
import { createHash as createHash2 } from "node:crypto";
import { constants, copyFileSync, existsSync as existsSync3, lstatSync, mkdirSync as mkdirSync2, readFileSync as readFileSync3, readdirSync as readdirSync2, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire as createRequire2 } from "node:module";
import { basename, dirname as dirname2, extname, isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// src/pipeline/ingestion/source-catalog.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync2, readFileSync as readFileSync2, readdirSync } from "node:fs";
import { join as join2 } from "node:path";

// src/db/client.ts
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
var __dirname = dirname(fileURLToPath(import.meta.url));
function resolveDataDir() {
  if (process.env.HEARTWORD_DATA_DIR) return process.env.HEARTWORD_DATA_DIR;
  const windowsPath = "C:\\Users\\danbr\\HeartWordData";
  if (existsSync(windowsPath)) return windowsPath;
  const bridgedPath = process.env.HOME ? join(process.env.HOME, "mnt", "HeartWordData") : void 0;
  if (bridgedPath && existsSync(bridgedPath)) return bridgedPath;
  throw new Error(
    "Could not find HeartWordData. Set HEARTWORD_DATA_DIR explicitly (see .env.example)."
  );
}
var SCHEMA_PATH = join(__dirname, "schema.sql");
var openedDataDir;
function getDataDir() {
  return openedDataDir ?? resolveDataDir();
}

// src/pipeline/ingestion/source-catalog.ts
var books = ["matthew", "mark", "luke", "john", "acts", "romans", "1-corinthians", "2-corinthians", "galatians", "ephesians", "philippians", "colossians", "1-thessalonians", "2-thessalonians", "1-timothy", "2-timothy", "titus", "philemon", "hebrews", "james", "1-peter", "2-peter", "1-john", "2-john", "3-john", "jude", "revelation"];
var display = { "1-corinthians": "1 Corinthians", "2-corinthians": "2 Corinthians", "1-thessalonians": "1 Thessalonians", "2-thessalonians": "2 Thessalonians", "1-timothy": "1 Timothy", "2-timothy": "2 Timothy", "1-peter": "1 Peter", "2-peter": "2 Peter", "1-john": "1 John", "2-john": "2 John", "3-john": "3 John" };
var title = (book) => display[book] ?? book.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
var relativeToAssets = (assets, path) => path.replace(`${assets}\\`, "").replaceAll("\\", "/");
function discoverSourcePaths(project, edition = "non_drama", dataDir = getDataDir(), requireAudio = true) {
  const assets = join2(dataDir, "assets");
  const legacy = join2(assets, "source", project.language, `${project.book}-${project.chapter}`);
  const legacyDocx = join2(legacy, `${project.book}-${project.chapter}-text.docx`);
  const legacyAudio = join2(legacy, `${project.book}-${project.chapter}-fcbh-audio.mp3`);
  const legacyReference = join2(assets, "reference", "english", `${project.book}-${project.chapter}`, `${project.book}-${project.chapter}-text.docx`);
  if (existsSync2(legacyDocx) && (!requireAudio || existsSync2(legacyAudio))) return { docxPath: legacyDocx, audioPath: legacyAudio, referencePath: legacyReference, audioRelPath: relativeToAssets(assets, legacyAudio), edition: "non_drama", provenance: "legacy" };
  if (project.language !== "hatam") throw new Error(`No source catalog is configured for language '${project.language}'.`);
  const index = books.indexOf(project.book);
  if (index < 0 && project.book !== "genesis") throw new Error(`No Hatam FCBH catalog entry exists for ${project.book} ${project.chapter}.`);
  const book = title(project.book), chapter = String(project.chapter);
  const docxPath = join2(assets, "source", "hatam", "text", book, `${book} ${chapter}.docx`);
  const referencePath = join2(assets, "source", "english-esv", "text", book, `${book} ${chapter}.docx`);
  const fileset = edition === "drama" ? "HADLAIN2DA" : "HADLAIN1DA";
  const editionDir = edition === "drama" ? "Hatam_had_LAI_NT_Drama" : "Hatam_had_LAI_NT_Non-Drama";
  const audioDir = join2(assets, "source", "hatam", "audio", editionDir);
  const prefix = index >= 0 ? `B${String(index + 1).padStart(2, "0")}___${chapter.padStart(2, "0")}_` : "no-fcbh-genesis-";
  const audioName = existsSync2(audioDir) ? readdirSync(audioDir).find((name) => name.startsWith(prefix) && name.endsWith(`______${fileset}.mp3`)) : void 0;
  const audioPath = audioName ? join2(audioDir, audioName) : join2(audioDir, `${prefix}missing______${fileset}.mp3`);
  const candidates = [["Hatam text", docxPath], ["English reference", referencePath], ...requireAudio ? [["Hatam FCBH audio", audioPath]] : []];
  const missing = candidates.filter(([, path]) => !existsSync2(path)).map(([label]) => label);
  if (missing.length) throw new Error(`Source catalog is incomplete for Hatam ${book} ${chapter}: missing ${missing.join(", ")}.`);
  return { docxPath, audioPath, referencePath, audioRelPath: relativeToAssets(assets, audioPath), edition, provenance: "catalog" };
}

// src/pipeline/assembly/chapter-package.ts
var hash = (bytes) => createHash2("sha256").update(bytes).digest("hex");
var slash = (value) => value.replaceAll("\\", "/");
var quote = (name) => `"${name.replaceAll('"', '""')}"`;
function inside(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../") && !isAbsolute(rel);
}
function portablePath(root, path) {
  if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").some((p) => p === ".." || p === "." || !p) || /^[A-Za-z]:/.test(path)) throw new Error(`Invalid package path: ${path}`);
  const full = resolve(root, path);
  if (!inside(root, full)) throw new Error(`Package path escapes root: ${path}`);
  let cursor = full;
  while (inside(root, cursor)) {
    if (existsSync3(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Package link is not portable: ${cursor}`);
    if (cursor === resolve(root)) break;
    cursor = dirname2(cursor);
  }
  return full;
}
function productionRecords(db, projectId2) {
  const definitions = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const all = {}, selected = {}, keys = {};
  for (const { name } of definitions) {
    all[name] = db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all();
    selected[name] = new Set(all[name].filter((row) => name === "projects" ? row.id === projectId2 : row.project_id === projectId2));
    keys[name] = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all();
  }
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name").all();
  const schema = [...definitions, ...indexes].map((d) => `${d.sql};`).join("\n");
  if (projectId2 === void 0) return { tables: all, schema };
  if (!selected.projects?.size) throw new Error("Project not found.");
  let changed = true;
  const owners = {
    shots: "scene_id",
    shot_characters: "shot_id",
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
  const project = all.projects.find((row) => row.id === projectId2);
  const sceneIds = new Set(all.scenes?.filter((row) => row.project_id === projectId2).map((row) => row.id));
  const shotIds = new Set(all.shots?.filter((row) => sceneIds.has(row.scene_id)).map((row) => row.id));
  const characterIds = /* @__PURE__ */ new Set([
    ...all.shot_characters?.filter((row) => shotIds.has(row.shot_id)).map((row) => row.character_id) ?? [],
    ...all.audio_segments?.filter((row) => row.project_id === projectId2).map((row) => row.speaker_character_id) ?? [],
    ...all.coverage_beats?.filter((row) => shotIds.has(row.shot_id)).map((row) => row.character_id) ?? []
  ]);
  const lower = (value) => String(value ?? "").toLowerCase();
  const regions = new Set(all.characters?.filter((row) => characterIds.has(row.id)).map((row) => lower(row.region)));
  for (const lesson of all.production_lessons ?? []) {
    const sameLanguage = lower(lesson.source_language) === lower(project.language), sameRegion = regions.has(lower(lesson.source_region));
    if (lesson.status === "active" && (lesson.scope_kind === "global" || lesson.scope_kind === "book" && lower(lesson.scope_value) === lower(project.book) && sameLanguage && sameRegion || lesson.scope_kind === "language" && lower(lesson.scope_value) === lower(project.language) && sameRegion || lesson.scope_kind === "region" && regions.has(lower(lesson.scope_value)) && sameLanguage)) selected.production_lessons.add(lesson);
  }
  for (const lesson of selected.production_lessons ?? []) for (const note of all.review_notes ?? []) if (lesson.source_note_id === note.id) selected.review_notes.add(note);
  function ownedByOtherChapter(table, row) {
    if (row.project_id != null) return row.project_id !== projectId2;
    const owner = owners[table], fk = keys[table]?.find((key) => key.from === owner);
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
      } else if (owners[table] && (!["shots", "shot_characters", "generation_attempts", "clips", "coverage_beats", "coverage_keyframe_attempts", "media_reuse_candidates"].includes(table) || !ownedByOtherChapter(table, row)) && keys[table].some((fk) => fk.from === owners[table] && fk.table !== "projects" && row[fk.from] != null && [...selected[fk.table] ?? []].some((parent) => parent[fk.to || "id"] === row[fk.from]))) {
        selected[table].add(row);
        changed = true;
      }
    }
  }
  const tables = Object.fromEntries(definitions.map(({ name }) => [name, all[name].filter((row) => selected[name].has(row))]));
  return { tables, schema };
}
var pathKey = /(?:path|file|keyframe|^source$|^src$|^inputs$|^references$|^pictureBase$|^audioBase$|^basePath$)/i;
var originKey = /^(?:imported_from|sourceRoot|originalPath|sourceOriginal|url|uri)$/;
var fileSuffix = /\.(?:mp4|mov|mkv|webm|wav|mp3|flac|m4a|aac|ogg|png|jpe?g|webp|exr|tiff?|blend\d*|docx|json|py|ttf|otf|vdb|abc)$/i;
function inspectChapterPackage(db, dataDir, projectId2, options = {}) {
  db.exec("BEGIN");
  let snapshot;
  try {
    snapshot = productionRecords(db, projectId2);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const { tables, schema } = snapshot;
  const project = tables.projects.find((p) => p.id === projectId2);
  const assets = resolve(dataDir, "assets"), bySource = /* @__PURE__ */ new Map();
  const problems = [], editability = [];
  const pendingJson = [];
  const projectionFile = resolve(dataDir, "logs/disaster-recovery-paths.json");
  const projection = existsSync3(projectionFile) ? JSON.parse(readFileSync3(projectionFile, "utf8")) : null;
  if (projection && (projection.version !== 1 || !Array.isArray(projection.references))) throw new Error("Invalid saved recovery path projection.");
  const restoredReferences = new Map(projection?.references ?? []);
  function add(value, reference, role = "original", lockedDependency = false) {
    const retained = restoredReferences.get(value);
    const full = retained ? portablePath(dataDir, retained) : isAbsolute(value) ? resolve(value) : resolve(assets, value);
    if (!existsSync3(full) || !statSync(full).isFile()) {
      problems.push(`Missing asset: ${value} (${reference})`);
      return;
    }
    const actual = realpathSync(full);
    if (inside(resolve(dataDir, "db"), actual)) throw new Error("The live database is represented by its consistent record snapshot; do not copy live database files into the package.");
    if (bySource.has(actual)) {
      const prior = bySource.get(actual);
      prior.references.push(reference);
      if (!prior.originals.includes(value)) prior.originals.push(value);
      if (role === "original") prior.role = role;
      return;
    }
    const sha256 = hash(readFileSync3(actual));
    const path = inside(dataDir, actual) ? slash(relative(resolve(dataDir), actual)) : `assets/preserved-external/${sha256}/${basename(actual)}`;
    bySource.set(actual, { path, sha256, bytes: statSync(actual).size, originals: [value], references: [reference], role });
    if (extname(actual).toLowerCase() === ".json" && !reference.startsWith("producer-supplied dependency")) pendingJson.push(actual);
    for (const companion of [`${full}.json`, `${full}.ambience.wav`, full.replace(/\.[^.]+$/, ".json")]) {
      if (companion !== full && existsSync3(companion)) add(companion, `sidecar:${value}`);
    }
    if (/\.blend\d*$/i.test(actual) && !lockedDependency) {
      const lock = `${full}.dependencies.json`;
      if (!inside(assets, full)) problems.push(`Place the portable Blender bundle under HeartWordData/assets before packaging: ${full}`);
      if (!existsSync3(lock)) problems.push(`Blender dependency lock required: ${lock}. Use scripts/blender/preserve_dependencies.py.`);
      else {
        const dependency = JSON.parse(readFileSync3(lock, "utf8"));
        const bundleRoot = resolve(dirname2(full), dependency.bundleRoot ?? ".");
        if (!inside(assets, bundleRoot)) throw new Error("Blender bundle root must be inside the asset area.");
        if (dependency.schemaVersion !== 1 || dependency.portable !== true || dependency.blendSha256 !== sha256 || !dependency.blenderVersion || !Array.isArray(dependency.files)) problems.push(`Invalid/stale Blender dependency lock: ${lock}`);
        else for (const item of dependency.files) {
          const file = portablePath(bundleRoot, item.path);
          add(file, `Blender dependency:${value}`, "original", true);
          if (existsSync3(file) && hash(readFileSync3(file)) !== item.sha256) problems.push(`Changed Blender dependency: ${file}`);
        }
        add(lock, `Blender dependency lock:${value}`);
      }
    }
  }
  function visit(value, key, reference, legacyGeneratedRoot = false) {
    if (typeof value === "string") {
      if (originKey.test(key)) return;
      if (value.startsWith("{") || value.startsWith("[")) {
        let parsed;
        try {
          parsed = JSON.parse(value);
        } catch {
          return;
        }
        visit(parsed, key, reference, legacyGeneratedRoot);
        return;
      }
      if (/^(?:https?:|data:|s3:)/i.test(value)) return;
      const full = isAbsolute(value) ? value : resolve(assets, value);
      if (legacyGeneratedRoot && key === "src" && !isAbsolute(value)) add(`generated/${value}`, `${reference} (legacy patch recipe: generated root)`);
      else if (pathKey.test(key) && (fileSuffix.test(value) || existsSync3(full))) add(value, reference, /thumbnail|proxy/i.test(key) ? "derived" : "original");
      else if (fileSuffix.test(value) && existsSync3(full)) add(value, reference, /thumbnail|proxy/i.test(key) ? "derived" : "original");
    } else if (Array.isArray(value)) value.forEach((item) => visit(item, key, reference, legacyGeneratedRoot));
    else if (value && typeof value === "object") {
      const recipe = value;
      const generatedRoot = legacyGeneratedRoot || typeof recipe.pictureBase === "string" && Array.isArray(recipe.picture);
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey, `${reference}.${childKey}`, generatedRoot);
    }
  }
  for (const [table, rows] of Object.entries(tables)) for (const row of rows) visit(row, "", `${table}:${row.id ?? row.render_id ?? row.project_id ?? "relationship"}`);
  if (!tables.project_source_bindings?.some((row) => row.project_id === projectId2)) {
    try {
      const source = discoverSourcePaths(project, void 0, dataDir, false);
      add(source.docxPath, "legacy verified source text");
      add(source.referencePath, "legacy reference text");
    } catch (error) {
      problems.push(`Source discovery: ${error.message}`);
    }
  }
  function addTree(path) {
    if (!existsSync3(path)) {
      problems.push(`Missing producer-supplied dependency: ${path}`);
      return;
    }
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Supply the actual dependency directory rather than a link: ${path}`);
    if (statSync(path).isDirectory()) for (const name of readdirSync2(path)) addTree(resolve(path, name));
    else add(path, "producer-supplied dependency");
  }
  for (const file of options.extraFiles ?? []) addTree(resolve(file));
  function addApplication(path) {
    if (!existsSync3(path)) return;
    if (/^(?:\.env(?:\..*)?|node_modules|\.git|\.venv|__pycache__|dist)$/.test(basename(path))) return;
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Application source link is not portable: ${path}`);
    if (statSync(path).isDirectory()) for (const name of readdirSync2(path)) addApplication(resolve(path, name));
    else {
      const full = realpathSync(path), bytes = statSync(full).size;
      bySource.set(full, { path: `application/${slash(relative(resolve("."), full))}`, bytes, sha256: hash(readFileSync3(full)), originals: [full], references: ["application source snapshot"], role: "original" });
    }
  }
  if (options.includeApplication !== false) for (const path of ["src", "scripts", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.base.json", "vite.config.ts", "vitest.config.ts", "docs/design/fdl"]) addApplication(resolve(path));
  const castDirectory = resolve(assets, "generated", String(project.language), `${project.book}-${project.chapter}`, "composite_cast_master");
  if (inside(assets, castDirectory) && existsSync3(castDirectory)) {
    for (const name of readdirSync2(castDirectory)) if (statSync(resolve(castDirectory, name)).isFile()) add(resolve(castDirectory, name), "retained cast-master history");
  }
  for (let i = 0; i < pendingJson.length; i++) {
    const file = pendingJson[i];
    if (file.endsWith(".dependencies.json")) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync3(file, "utf8"));
    } catch {
      problems.push(`Unreadable JSON dependency: ${file}`);
      continue;
    }
    visit(parsed, "", file);
  }
  for (const row of tables.character_assets ?? []) if (row.content_hash && row.path) {
    const file = [...bySource.values()].find((f) => f.originals.includes(String(row.path)));
    if (file && file.sha256 !== String(row.content_hash).toLowerCase()) problems.push(`Canon hash mismatch: ${row.id}`);
  }
  for (const row of tables.production_audio_assets ?? []) if (row.sha256 && row.path) {
    const file = [...bySource.values()].find((f) => f.originals.includes(String(row.path)));
    if (file && file.sha256 !== row.sha256) problems.push(`Soundtrack hash mismatch: ${row.id}`);
  }
  for (const row of tables.project_source_bindings ?? []) for (const kind of ["docx", "audio", "reference"]) {
    const file = [...bySource.values()].find((f) => f.originals.includes(String(row[`${kind}_path`])));
    if (file && file.sha256 !== row[`${kind}_hash`]) problems.push(`Bound source hash mismatch: ${kind}`);
  }
  for (const render of tables.chapter_renders ?? []) if (render.project_id === projectId2) {
    const mapping = tables.chapter_render_manifests?.find((m) => m.render_id === render.id);
    if (!mapping) editability.push(`Render ${render.id} has no saved timeline/source map; its picture edit cannot be reconstructed from its MP4.`);
    else {
      const picture = JSON.parse(String(mapping.timeline_json)), audio = JSON.parse(String(mapping.source_audio_json));
      if (!Array.isArray(picture) || !Array.isArray(audio)) editability.push(`Render ${render.id} retains a legacy/custom recipe, not the executable ordered timeline and exact source map. Preserve its original editor/scripts and dependencies; normalize that recipe before automatic picture rebuilding.`);
    }
  }
  if (!(tables.audio_segments ?? []).some((a) => a.project_id === projectId2 && a.layer === "original_reading")) editability.push("No saved original-reading intervals.");
  const manifest2 = {
    format: "heartword-chapter",
    version: 1,
    project,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    application: { version: JSON.parse(readFileSync3("package.json", "utf8")).version, gitCommit: toolVersion("git", ["rev-parse", "HEAD"]), node: process.version, ffmpeg: toolVersion("ffmpeg", ["-version"]).split("\n")[0], schemaSha256: hash(schema) },
    retention: { originals: "indefinite", rejectedAndSuperseded: "indefinite", automaticDeletion: false },
    sourceRoot: resolve(dataDir),
    schemaFile: "schema.sql",
    recordsFile: "records.json",
    recordsSha256: hash(JSON.stringify(tables)),
    files: [...bySource.values()],
    problems: [...new Set(problems)],
    editability
  };
  return { manifest: manifest2, tables, schema, sources: bySource };
}
function toolVersion(program, args) {
  try {
    return execFileSync(program, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "not_reported";
  }
}

// src/pipeline/creative-direction/crew-context.ts
import { createHash as createHash4 } from "node:crypto";
import { readFileSync as readFileSync5 } from "node:fs";
import { isAbsolute as isAbsolute2, relative as relative2, resolve as resolve2 } from "node:path";

// src/pipeline/ingestion/simple-zip.ts
import { readFileSync as readFileSync4 } from "node:fs";
import { inflateRawSync } from "node:zlib";
function readZipEntry(zipPath, entryName) {
  const data = readFileSync4(zipPath);
  const EOCD_SIGNATURE = 101010256;
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0 && i >= data.length - 22 - 65535; i--) {
    if (data.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error(`${zipPath} doesn't look like a valid .docx/.zip file (no End Of Central Directory record found).`);
  }
  const entryCount = data.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = data.readUInt32LE(eocdOffset + 16);
  let offset = centralDirOffset;
  const CENTRAL_DIR_SIGNATURE = 33639248;
  for (let i = 0; i < entryCount; i++) {
    if (data.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`${zipPath}: central directory entry ${i} has an unexpected signature -- file may be corrupt.`);
    }
    const compressionMethod = data.readUInt16LE(offset + 10);
    const compressedSize = data.readUInt32LE(offset + 20);
    const fileNameLength = data.readUInt16LE(offset + 28);
    const extraFieldLength = data.readUInt16LE(offset + 30);
    const fileCommentLength = data.readUInt16LE(offset + 32);
    const localHeaderOffset = data.readUInt32LE(offset + 42);
    const fileName = data.toString("utf-8", offset + 46, offset + 46 + fileNameLength);
    if (fileName === entryName) {
      const localFileNameLength = data.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = data.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressed = data.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return Buffer.from(compressed);
      if (compressionMethod === 8) return inflateRawSync(compressed);
      throw new Error(`${zipPath}: entry "${entryName}" uses unsupported compression method ${compressionMethod}.`);
    }
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }
  throw new Error(`${zipPath}: no entry named "${entryName}" found in the zip's central directory.`);
}

// src/pipeline/ingestion/parse-source-text.ts
function readDocumentXml(docxPath) {
  return readZipEntry(docxPath, "word/document.xml").toString("utf-8");
}
function xmlToParagraphLines(xml) {
  const withBreaks = xml.replace(/<w:p[ >]/g, "\n<w:p ");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return stripped.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}
var VERSE_MARKER = /(\d{1,3})(?:\s?(?=[A-ZÀ-Ÿ"“'])|(?=[a-zà-ÿ]))/g;
function splitParagraphIntoVerses(line) {
  const markers = [];
  for (const match of line.matchAll(VERSE_MARKER)) {
    markers.push({ verse: Number(match[1]), index: match.index ?? 0, markerLength: match[0].length });
  }
  if (markers.length === 0) return [];
  const verses = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const start = marker.index + marker.markerLength;
    const end = i + 1 < markers.length ? markers[i + 1].index : line.length;
    verses.push({ verse: marker.verse, text: line.slice(start, end).trim() });
  }
  return verses;
}
function parseSourceTextByVerse(docxPath) {
  const xml = readDocumentXml(docxPath);
  const lines = xmlToParagraphLines(xml);
  const records = [];
  lines.forEach((line, paragraphIndex) => {
    for (const { verse, text } of splitParagraphIntoVerses(line)) {
      records.push({ verse, text, paragraphIndex });
    }
  });
  return records;
}
function parseNarratedParagraphTitles(docxPath) {
  const lines = xmlToParagraphLines(readDocumentXml(docxPath)), titles = [];
  for (let i = 1; i + 2 < lines.length; i++) {
    const title2 = lines[i], refs = lines[i + 1], following = splitParagraphIntoVerses(lines[i + 2]);
    if (!splitParagraphIntoVerses(title2).length && /^\(.+\)$/.test(refs) && following.length) titles.push({ text: title2, parallelRefs: refs.slice(1, -1), paragraphIndex: i, verseStart: following[0].verse });
  }
  return titles;
}

// src/pipeline/scene-breakdown/build-scenes.ts
function parseVerseRange(verseRef) {
  const afterColon = verseRef.includes(":") ? verseRef.slice(verseRef.indexOf(":") + 1) : verseRef;
  const match = afterColon.match(/(\d+)(?:-(\d+))?/);
  if (!match) throw new Error(`parseVerseRange: could not find a verse number in "${verseRef}"`);
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return { start, end };
}

// src/pipeline/assembly/cut-timing-audit.ts
import { createHash as createHash3, randomUUID } from "node:crypto";
function readCutTimingAudit(db, projectId2, renderId) {
  const row = db.prepare(`SELECT payload FROM edit_commands WHERE project_id=? AND command_type='audit_cut_timing'
    AND undone=0 AND json_extract(payload,'$.renderId')=? ORDER BY sequence DESC LIMIT 1`).get(projectId2, renderId);
  return row ? JSON.parse(String(row.payload)) : null;
}

// src/pipeline/creative-direction/crew-context.ts
var digest = (value) => createHash4("sha256").update(value).digest("hex");
function productionAssetPath(dataDir, path) {
  const root = resolve2(dataDir, "assets");
  const absolute = resolve2(root, path);
  const rel = relative2(root, absolute);
  if (!rel || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute2(rel)) throw new Error("Asset must be inside HeartWord's assets directory.");
  return absolute;
}
function loadCrewBrief(db, dataDir, projectId2, phase) {
  const project = db.prepare("SELECT id, language, book, chapter FROM projects WHERE id = ?").get(projectId2);
  if (!project) throw new Error("Project not found.");
  if (project.language.toLowerCase() !== "hatam") throw new Error("Configure and approve a regional production canon before planning another language.");
  const approvedRegion = project.language.toLowerCase() === "hatam" ? "Papuan" : null;
  const textPaths = discoverSourcePaths(project, void 0, dataDir, false);
  const sources = [textPaths.docxPath, textPaths.referencePath];
  const source = { text: parseSourceTextByVerse(sources[0]), reference: parseSourceTextByVerse(sources[1]), hashes: sources.map((p) => digest(readFileSync5(p))) };
  if (!source.text.length || !source.reference.length) throw new Error("Both source and reference Scripture text are required.");
  const normalizeBook = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const checkRef = (value) => {
    const match = value?.match(/^(.+?)\s+(\d+):\d+/);
    if (!match || normalizeBook(match[1]) !== normalizeBook(project.book) || Number(match[2]) !== project.chapter) throw new Error("A verse reference belongs to another book or chapter.");
  };
  const sourceVerses = source.text.map((v) => v.verse).join(",");
  if (sourceVerses !== source.reference.map((v) => v.verse).join(",")) throw new Error("Source and reference verse coverage differ; review source material first.");
  const alignedAudio = db.prepare(`SELECT id, start_ms AS startMs, end_ms AS endMs, verse_ref AS verseRef,
    speaker_character_id AS speakerId, source_path AS path, confidence FROM audio_segments
    WHERE project_id = ? AND layer = 'original_reading' ORDER BY start_ms, id`).all(projectId2);
  if (!alignedAudio.length) throw new Error("Ingest and align the source audio before role planning.");
  const audio = [];
  let end = 0;
  for (const segment of alignedAudio) {
    if (segment.verseRef !== null) checkRef(segment.verseRef);
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.startMs < end || segment.endMs <= segment.startMs) throw new Error("Source audio intervals have an overlap or invalid duration.");
    if (segment.startMs > end) {
      const previous = audio.at(-1);
      if (previous && previous.path !== segment.path) throw new Error("Source audio intervals have a gap without an unambiguous source recording.");
      audio.push({
        id: `source-gap:${previous ? previous.id : "start"}:${segment.id}`,
        startMs: end,
        endMs: segment.startMs,
        verseRef: previous ? previous.verseRef : null,
        speakerId: null,
        path: segment.path,
        confidence: null,
        provenance: "unassigned_source_interval"
      });
    }
    audio.push(segment);
    end = segment.endMs;
  }
  for (const segment of audio) if (segment.speakerId) {
    const original2 = db.prepare("SELECT canon_status, group_id FROM characters WHERE id=?").get(segment.speakerId);
    if (original2?.canon_status === "rejected" && original2.group_id) {
      const spokespeople = db.prepare("SELECT id FROM characters WHERE group_id=? AND is_spokesperson=1 AND canon_status='approved'").all(original2.group_id);
      if (spokespeople.length === 1) {
        segment.sourceSpeakerId = segment.speakerId;
        segment.speakerId = String(spokespeople[0].id);
      }
    }
  }
  for (const path of [...new Set(audio.map((a) => a.path))]) source.hashes.push(digest(readFileSync5(productionAssetPath(dataDir, path))));
  if (phase !== "planning") {
    const castMaster = db.prepare(`SELECT id,source_path,start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments
      WHERE project_id=? AND layer='composite_cast_master' ORDER BY id`).all(projectId2);
    source.hashes.push(digest(JSON.stringify(castMaster)));
    for (const row of castMaster) source.hashes.push(digest(readFileSync5(productionAssetPath(dataDir, String(row.source_path)))));
  }
  const shots = db.prepare(`SELECT s.id, s.scene_id AS sceneId, sc.sequence AS sceneSequence, s.sequence,
    s.verse_ref AS verseRef, s.action, s.framing, s.camera_movement AS cameraMovement,
    s.continuity_notes AS continuity, sc.lighting_continuity AS lighting, s.needs_lip_sync AS needsLipSync,
    s.dialogue_character_id AS dialogueCharacterId,
    (SELECT source_audio_segment_id FROM shot_utterance_bindings ub WHERE ub.shot_id=s.id) AS sourceSegmentId FROM shots s JOIN scenes sc ON sc.id = s.scene_id
    WHERE sc.project_id = ? ORDER BY sc.sequence, s.sequence`).all(projectId2);
  if (!shots.length) throw new Error("Create the initial shot plan before running the production crew.");
  for (const shot of shots) {
    checkRef(shot.verseRef);
    const ref = parseVerseRange(shot.verseRef);
    if (!source.reference.some((v) => v.verse === ref.start) || !source.reference.some((v) => v.verse === ref.end)) throw new Error(`Shot ${shot.id} has no matching Scripture range.`);
    shot.needsLipSync = Boolean(shot.needsLipSync);
    shot.characterIds = db.prepare("SELECT character_id AS id FROM shot_characters WHERE shot_id = ? ORDER BY character_id").all(shot.id).map((c) => c.id);
    if (shot.needsLipSync && (!shot.dialogueCharacterId || !shot.characterIds.includes(shot.dialogueCharacterId))) throw new Error(`Shot ${shot.id} has no approved visible dialogue character.`);
    shot.beats = db.prepare(`SELECT id, sequence, notes, character_id AS characterId,
      audio_start_ms AS startMs, audio_end_ms AS endMs FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shot.id);
    shot.clip = db.prepare(`SELECT ga.id, ga.result_asset_path AS path,
      cl.timeline_end_ms - cl.timeline_start_ms AS durationMs FROM clips cl
      JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
      WHERE cl.shot_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
      ORDER BY ga.created_at DESC, ga.id DESC LIMIT 1`).get(shot.id) ?? null;
    if (phase !== "planning" && shot.clip) source.hashes.push(digest(readFileSync5(productionAssetPath(dataDir, shot.clip.path))));
  }
  const canon = [];
  const characterIds = [.../* @__PURE__ */ new Set([...shots.flatMap((s) => [...s.characterIds, ...s.beats.flatMap((b) => b.characterId ? [b.characterId] : [])]), ...audio.flatMap((a) => a.speakerId ? [a.speakerId] : [])])].sort();
  for (const id of characterIds) {
    const character = db.prepare(`SELECT id, name, region, (SELECT notes FROM character_versions WHERE character_id = characters.id AND status = 'approved' LIMIT 1) AS notes, joined_narrative_at AS joinedAt FROM characters WHERE id = ?
      AND canon_status = 'approved' AND region = ? AND (scope_kind = 'global' OR
      (lower(scope_book) = lower(?) AND (scope_kind = 'book' OR scope_chapter = ?)))`).get(id, approvedRegion, project.book, project.chapter);
    const versions = db.prepare("SELECT id FROM character_versions WHERE character_id = ? AND status = 'approved'").all(id);
    if (!character || versions.length !== 1) throw new Error(`Character ${id} needs one approved, project-appropriate Papuan canon version.`);
    const assets = db.prepare("SELECT path, content_hash FROM character_assets WHERE character_version_id = ? ORDER BY path").all(versions[0].id);
    if (!assets.length) throw new Error(`Missing approved reference assets for ${character.name}.`);
    for (const asset of assets) {
      const hash2 = digest(readFileSync5(productionAssetPath(dataDir, asset.path)));
      if (asset.content_hash && asset.content_hash.toLowerCase() !== hash2) throw new Error(`Canon file changed: ${character.name}.`);
      source.hashes.push(hash2);
    }
    canon.push({ ...character, versionId: versions[0].id });
  }
  const regions = [...new Set(canon.map((character) => character.region).filter((region2) => region2.trim().length > 0))];
  if (regions.length !== 1) throw new Error("A crew brief requires one approved regional canon context for its visible cast.");
  const region = regions[0];
  const producerNotes = db.prepare(`SELECT id, subject_id AS subjectId, note FROM review_notes
    WHERE project_id = ? AND (source = 'human' OR (source = 'qc' AND note LIKE 'Production Director approved edit:%')) ORDER BY created_at, id`).all(projectId2);
  if (phase === "planning") {
    const opening = db.prepare("SELECT plan_json FROM chapter_intro_plans WHERE project_id=?").get(projectId2);
    if (opening) producerNotes.push({
      id: "chapter-intro-plan",
      subjectId: projectId2,
      note: `Separate pre-source-clock chapter opening plan (do not turn into verse-timed shots or accept media without target review): ${opening.plan_json}`
    });
    const ending = db.prepare("SELECT plan_json FROM chapter_ending_plans WHERE project_id=?").get(projectId2);
    if (ending) producerNotes.push({
      id: "chapter-ending-plan",
      subjectId: projectId2,
      note: `Separate post-source chapter handoff toward the next verified first verse (an inferred visual bridge, not verse-timed Scripture; do not accept media without target review): ${ending.plan_json}`
    });
  }
  const appliedLessons = db.prepare(`SELECT id, subject_id AS subjectId, scope_kind AS scopeKind, requested_change AS requestedChange, rationale
    FROM production_lessons WHERE status='active' AND (
      (scope_kind='chapter' AND project_id=?) OR
      (scope_kind='shot' AND project_id=? AND subject_id IN (SELECT s.id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=?)) OR
      (scope_kind='scene' AND project_id=? AND subject_id IN (SELECT id FROM scenes WHERE project_id=?)) OR
      (scope_kind='book' AND lower(scope_value)=lower(?) AND lower(source_language)=lower(?) AND lower(source_region)=lower(?)) OR
      (scope_kind='language' AND lower(scope_value)=lower(?) AND lower(source_region)=lower(?)) OR
      (scope_kind='region' AND lower(scope_value)=lower(?) AND lower(source_language)=lower(?)) OR
      scope_kind='global'
    ) ORDER BY created_at,id`).all(projectId2, projectId2, projectId2, projectId2, projectId2, project.book, project.language, region, project.language, region, region, project.language);
  const resolvedTitleTreatments = /* @__PURE__ */ new Map();
  try {
    for (const row of db.prepare(`SELECT next_verse_ref AS nextVerseRef, film_treatment AS filmTreatment, reviewer_name AS reviewerName
      FROM source_alignment_editorial_classifications WHERE project_id=? AND next_verse_ref IS NOT NULL AND film_treatment IS NOT NULL ORDER BY created_at`).all(projectId2)) {
      const verse = Number(row.nextVerseRef.match(/:(\d+)/)?.[1]);
      if (Number.isFinite(verse)) resolvedTitleTreatments.set(verse, { filmTreatment: row.filmTreatment, reviewerName: row.reviewerName });
    }
  } catch {
  }
  producerNotes.push(...parseNarratedParagraphTitles(sources[0]).map((title2, index) => {
    const resolved = resolvedTitleTreatments.get(title2.verseStart);
    const treatmentNote = !resolved ? `Optional scene-title context; do not automatically display it. Separate cross-reference metadata: (${title2.parallelRefs}); do not treat it as film narration or on-screen content unless a human resolves an exception.` : resolved.filmTreatment === "title_card" ? `Human-resolved by ${resolved.reviewerName}: display as an on-screen title card. Cross-reference metadata: (${title2.parallelRefs}); still not film narration.` : resolved.filmTreatment === "omit" ? `Human-resolved by ${resolved.reviewerName}: omit from the finished film; retained only as review evidence.` : `Human-resolved by ${resolved.reviewerName}: include as narrated content in the film's audio track. Cross-reference metadata: (${title2.parallelRefs}).`;
    return { id: `source-title:${index}`, subjectId: projectId2, note: `Narrated paragraph title before verse ${title2.verseStart}: \u201C${title2.text}\u201D. ${treatmentNote}` };
  }));
  producerNotes.push(...appliedLessons.map((lesson) => ({ id: lesson.id, subjectId: lesson.subjectId ?? projectId2, note: `Reusable lesson (${lesson.scopeKind}): ${lesson.requestedChange}${lesson.rationale ? ` Rationale: ${lesson.rationale}` : ""}` })));
  const spentUsd = Number(db.prepare("SELECT COALESCE(SUM(amount_usd), 0) AS total FROM cost_ledger_entries WHERE project_id = ?").get(projectId2).total);
  const audioAssets = db.prepare(`SELECT id, kind, description, path, sha256, duration_ms AS durationMs
    FROM production_audio_assets WHERE project_id = ? ORDER BY id`).all(projectId2);
  for (const asset of audioAssets) if (digest(readFileSync5(productionAssetPath(dataDir, asset.path))) !== asset.sha256) throw new Error(`Approved audio asset changed: ${asset.description}.`);
  let render = null;
  if (phase === "finishing") {
    const row = db.prepare(`SELECT r.id, r.result_asset_path AS path, r.total_duration_ms AS durationMs,
      m.timeline_json AS timeline, m.source_audio_json AS audioMap FROM chapter_renders r LEFT JOIN chapter_render_manifests m ON m.render_id = r.id
      WHERE r.project_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 1`).get(projectId2);
    if (!row) throw new Error("Assemble a chapter before finishing review.");
    const audioMap = row.audioMap ? JSON.parse(row.audioMap) : void 0;
    render = {
      id: row.id,
      path: row.path,
      durationMs: row.durationMs,
      timeline: row.timeline ? JSON.parse(row.timeline) : [],
      audioMap: Array.isArray(audioMap) ? audioMap : void 0,
      sha256: digest(readFileSync5(productionAssetPath(dataDir, row.path)))
    };
    const audit2 = readCutTimingAudit(db, projectId2, row.id);
    if (audit2?.renderSha256 === render.sha256 && JSON.stringify(audit2.sourceHashes) === JSON.stringify(source.hashes)) render.timingAudit = audit2;
    const applied = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='apply_finishing' AND json_extract(payload,'$.renderId')=? LIMIT 1").get(projectId2, row.id);
    if (applied) {
      const payload = JSON.parse(String(applied.payload));
      const baseId = payload.baseRenderId ?? payload.parentRenderId;
      const base = db.prepare("SELECT result_asset_path AS path FROM chapter_renders WHERE id=? AND project_id=?").get(baseId, projectId2);
      const reviewed = db.prepare("SELECT result_json FROM production_runs WHERE id=? AND project_id=?").get(payload.runId, projectId2);
      if (!base || !reviewed) throw new Error("Finishing provenance is incomplete; preserve the existing cut and resolve its base render first.");
      render.finishing = { baseRenderId: baseId, basePath: String(base.path), baseSha256: digest(readFileSync5(productionAssetPath(dataDir, String(base.path)))), previousDecisions: JSON.parse(String(reviewed.result_json)).contributions };
    }
  }
  return { project, source, audio, canon, shots, producerNotes, appliedLessons, spentUsd, audioAssets, render };
}

// src/pipeline/assembly/disaster-backup.ts
import { createHash as createHash5, randomUUID as randomUUID2 } from "node:crypto";
import { constants as constants2, copyFileSync as copyFileSync2, createReadStream, existsSync as existsSync4, lstatSync as lstatSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync6, readdirSync as readdirSync3, statSync as statSync2, statfsSync, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { createRequire as createRequire3 } from "node:module";
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute3, relative as relative3, resolve as resolve3 } from "node:path";
var { DatabaseSync: DatabaseSync2, backup } = createRequire3(import.meta.url)("node:sqlite");
async function fileDigest(path) {
  const hash2 = createHash5("sha256");
  for await (const chunk of createReadStream(path)) hash2.update(chunk);
  return hash2.digest("hex");
}

// outputs/disaster-backup-live-drill.ts
var { DatabaseSync: DatabaseSync3 } = createRequire4(import.meta.url)("node:sqlite");
var backupRoot = resolve4(process.argv[2]);
var restoredRoot = resolve4(process.argv[3]);
var manifest = JSON.parse(readFileSync7(resolve4(backupRoot, "backup.json"), "utf8"));
assert.equal(process.permission?.has("fs.read", manifest.sourceRoot), false, "live data must be denied during this drill");
var baseline = new DatabaseSync3(resolve4(backupRoot, "data/db/heartword.sqlite"), { readOnly: true });
var restored = new DatabaseSync3(resolve4(restoredRoot, "db/heartword.sqlite"), { readOnly: true });
var original = productionRecords(baseline);
var recovered = productionRecords(restored);
var tableCounts = Object.fromEntries(Object.entries(original.tables).map(([name, rows]) => {
  assert.equal(recovered.tables[name]?.length, rows.length, `row count ${name}`);
  return [name, rows.length];
}));
assert.equal(recovered.schema, original.schema);
assert.deepEqual(restored.prepare("PRAGMA integrity_check").all().map((row) => row.integrity_check), ["ok"]);
assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
for (const name of ["cost_ledger_entries", "source_review_attestations", "source_alignment_corrections", "source_alignment_boundary_overrides", "source_alignment_editorial_classifications", "source_alignment_speaker_attributions", "edit_commands", "review_notes", "character_versions", "clips", "stage_executions"]) {
  if (original.tables[name]) assert.deepEqual(recovered.tables[name], original.tables[name], name);
}
for (const before of original.tables.generation_attempts ?? []) {
  const after = recovered.tables.generation_attempts.find((row) => row.id === before.id);
  for (const field of ["id", "shot_id", "provider", "model", "operation", "prompt", "status", "cost_usd", "created_at"]) assert.equal(after[field], before[field], `attempt ${field}`);
}
var projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
var brief = loadCrewBrief(restored, restoredRoot, projectId, "editing");
var audit = inspectChapterPackage(restored, restoredRoot, projectId, { includeApplication: false });
assert.deepEqual(audit.manifest.problems, []);
var audioPaths = [...new Set(brief.audio.map((segment) => segment.path))];
for (const path of audioPaths) {
  const entry = manifest.files.find((f) => f.path === `data/assets/${path.replaceAll("\\", "/")}`);
  assert(entry, `retained source ${path}`);
  assert.equal(await fileDigest(productionAssetPath(restoredRoot, path)), entry.sha256);
}
var clip = brief.shots.find((shot) => shot.clip)?.clip;
assert(clip, "representative retained clip");
assert.equal(await fileDigest(productionAssetPath(restoredRoot, clip.path)), manifest.files.find((f) => f.path === `data/assets/${clip.path.replaceAll("\\", "/")}`).sha256);
var report = { backupId: manifest.id, restoredRoot, liveDataReadAccess: false, integrity: "ok", foreignKeys: "ok", schemaIdentical: true, tableCounts, verifiedAuthoritativeRows: true, project: brief.project, sourceVerses: brief.source.text.length, referenceVerses: brief.source.reference.length, audioIntervals: brief.audio.length, canonIdentities: brief.canon.length, shots: brief.shots.length, selectedClips: brief.shots.filter((shot) => shot.clip).length, producerNotes: brief.producerNotes.length, spentUsd: brief.spentUsd, chapterMissingAssets: audit.manifest.problems, chapterEditabilityGaps: audit.manifest.editability.length, sourceFilesVerified: audioPaths.length, representativeClip: clip, noPaidRegeneration: true, remoteRecoveryVerified: false };
baseline.close();
restored.close();
writeFileSync3("outputs/disaster-backup-live-drill.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
