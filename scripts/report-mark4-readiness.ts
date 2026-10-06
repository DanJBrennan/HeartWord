/** Read-only Mark 4 readiness/preflight report. It never creates a project,
 * binds source inputs, calls a provider, or mutates the production database. */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverSourcePaths } from "../src/pipeline/ingestion/source-catalog.js";
import { parseChapterTitle, parseSourceHeadings, parseSourceText, parseSourceTextByVerse } from "../src/pipeline/ingestion/parse-source-text.js";
import { getAudioDurationMs } from "../src/pipeline/ingestion/detect-silences.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const dbPath = join(dataDir, "db", "heartword.sqlite");
const project = { language: "hatam", book: "mark", chapter: 4 } as const;
const report: Record<string, unknown> = { chapter: "Hatam Mark 4", readOnly: true, sourceCatalog: { status: "unresolved" } };

try {
  // Deliberately call discovery rather than resolveAndBindSourcePaths: this is
  // a preflight and must not create the project's durable source binding.
  const source = discoverSourcePaths(project, "non_drama", dataDir);
  const verses = parseSourceTextByVerse(source.docxPath);
  const groups = parseSourceText(source.docxPath, project.book, project.chapter);
  report.sourceCatalog = {
    status: "ready", provenance: source.provenance, edition: source.edition,
    hatamText: source.docxPath, englishReference: source.referencePath, hatamAudio: source.audioPath,
    allFilesPresent: [source.docxPath, source.referencePath, source.audioPath].every(existsSync)
  };
  report.textParsing = {
    chapterTitle: parseChapterTitle(source.docxPath, project.chapter), verseCount: verses.length,
    verseRange: verses.length ? `${verses[0]!.verse}-${verses.at(-1)!.verse}` : null,
    verseGroups: groups.length,
    headings: parseSourceHeadings(source.docxPath)
  };
  report.audio = { durationMs: getAudioDurationMs(source.audioPath) };
} catch (error) {
  report.sourceCatalog = { status: "blocked", reason: (error as Error).message };
}

report.databasePresent = existsSync(dbPath);
if (existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    report.existingProject = db.prepare("SELECT id,stage,status FROM projects WHERE language='hatam' AND book='mark' AND chapter=4").get();
    report.approvedPapuanCanon = db.prepare("SELECT COUNT(*) count FROM characters c JOIN character_versions v ON v.character_id=c.id WHERE c.region='Papuan' AND c.canon_status='approved' AND v.status='approved'").get();
  } finally { db.close(); }
}
console.log(JSON.stringify(report, null, 2));
