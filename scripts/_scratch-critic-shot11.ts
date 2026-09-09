import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";

const db = getDb();
const shotId = "f6386c84-b0b0-404d-b080-faa644443f72";

const shot = db.prepare(`
  SELECT s.action, s.verse_ref, s.continuity_notes, s.crowd_density
  FROM shots s WHERE s.id = ?
`).get(shotId) as any;

const imagePath = process.argv[2];
if (!imagePath) throw new Error("Usage: _scratch-critic-shot11.ts <path-to-image>");

const report = await runCritic(shot.action, shot.verse_ref, shot.continuity_notes, shot.crowd_density, imagePath);
console.log(`SEVERITY: ${report.severity}\n\n${report.findings}`);
