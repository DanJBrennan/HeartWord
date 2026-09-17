/** Read-only readiness report: never creates a project, calls a provider, or
 * mutates the production database. */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const dataDir = process.env.HEARTWORD_DATA_DIR || "C:\\Users\\danbr\\HeartWordData";
const base = join(dataDir, "assets", "source", "hatam", "mark-4");
const text = join(base, "mark-4-text.docx"), audio = join(base, "mark-4-fcbh-audio.mp3");
const dbPath = join(dataDir, "db", "heartword.sqlite");
const report: Record<string, unknown> = { chapter: "Hatam Mark 4", readOnly: true, sourceTextPresent: existsSync(text), sourceAudioPresent: existsSync(audio), databasePresent: existsSync(dbPath) };
if (existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    report.existingProject = db.prepare("SELECT id,stage,status FROM projects WHERE language='hatam' AND book='mark' AND chapter=4").get();
    report.approvedPapuanCanon = db.prepare("SELECT COUNT(*) count FROM characters c JOIN character_versions v ON v.character_id=c.id WHERE c.region='Papuan' AND c.canon_status='approved' AND v.status='approved'").get();
  } finally { db.close(); }
}
console.log(JSON.stringify(report, null, 2));
