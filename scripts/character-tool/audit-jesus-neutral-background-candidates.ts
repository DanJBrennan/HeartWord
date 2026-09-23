/** Review-only garment-critic pass for Jesus's three neutral-background candidates. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";
import { runCanonGarmentCritic } from "../../src/pipeline/qc/canon-critic.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const folder = path.join(getDataDir(), "assets", "characters", "candidates", "canon-background-repair-2026-09-21");
const candidates = [
  ["Jesus — seated neutral-background candidate", "jesus-motion-seated-listening-neutral-background-r1.png"],
  ["Jesus — teaching neutral-background candidate", "jesus-motion-teaching-neutral-background-r1.png"],
  ["Jesus — walking neutral-background candidate", "jesus-motion-walking-neutral-background-r1.png"]
] as const;

async function main() {
  const db = getDb();
  const results = [];
  for (const [name, file] of candidates) {
    const report = await runCanonGarmentCritic(name, [{ mimeType: "image/png", data: (await readFile(path.join(folder, file))).toString("base64") }], ["Keep Jesus's approved shoulder-length hair; do not flag its length."]);
    if (report.costUsd) db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,NULL,?,?)")
      .run(randomUUID(), projectId, report.costUsd, Date.now());
    results.push({ name, file, severity: report.severity, costUsd: report.costUsd ?? 0, findings: report.findings });
  }
  const output = path.join(folder, "garment-critic-review.json");
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ output, results }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
