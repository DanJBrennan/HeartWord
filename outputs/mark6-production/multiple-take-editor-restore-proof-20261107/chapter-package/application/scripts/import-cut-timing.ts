/** Register measured editor timing or an explicitly incomplete audit; never renders or calls a model. */
import { readFileSync } from "node:fs";
import { getDataDir, getDb } from "../src/db/client.js";
import { loadCrewBrief } from "../src/pipeline/creative-direction/crew-context.js";
import { importCutManifest } from "../src/pipeline/assembly/import-cut-manifest.js";
import { recordCutTimingAudit } from "../src/pipeline/assembly/cut-timing-audit.js";

const [projectId, file] = process.argv.slice(2);
if (!projectId || !file) throw new Error("Usage: tsx scripts/import-cut-timing.ts <project-id> <timing.json>");
const bytes = readFileSync(file);
if (bytes.length > 1024 * 1024) throw new Error("Timing file must be under 1 MB.");
const value = JSON.parse(bytes.toString("utf8"));
const db = getDb(), dataDir = getDataDir();
if (value?.kind === "observed_cut_timing") {
  recordCutTimingAudit(db, loadCrewBrief(db, dataDir, projectId, "finishing"), value);
  console.log("Observed timing saved for crew review. Complete source coverage remains unverified; automatic finishing is held.");
} else {
  importCutManifest(db, dataDir, projectId, value);
  console.log("Validated timing saved. The original film was retained.");
}
