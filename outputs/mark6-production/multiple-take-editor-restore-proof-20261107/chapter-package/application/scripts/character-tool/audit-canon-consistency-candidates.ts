/** Review-only garment-critic pass for the r6 healed Withered Hand candidate. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";
import { runCanonGarmentCritic } from "../../src/pipeline/qc/canon-critic.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const candidates = [
  ["Man with Withered Hand — r6 healed candidate", "man-with-withered-hand-healed-costume-r6.png"],
] as const;

async function main() {
  const folder = path.join(getDataDir(), "assets", "characters", "candidates", "canon-consistency-repair-2026-09-21");
  const output = path.join(folder, "garment-critic-review-healed-r6.json");
  const db = getDb();
  const results = [];
  for (const [name, file] of candidates) {
    const overrides = /^(Principal scribe|Scribe \(younger, lean\))/.test(name)
      ? ["Keep the approved black/charcoal fabric as an explicit producer visual-identity choice; do not flag its color."]
      : [];
    const report = await runCanonGarmentCritic(name, [{ mimeType: "image/png", data: (await readFile(path.join(folder, file))).toString("base64") }], overrides);
    if (report.costUsd) db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,NULL,?,?)")
      .run(randomUUID(), projectId, report.costUsd, Date.now());
    results.push({ name, file, severity: report.severity, costUsd: report.costUsd ?? 0, findings: report.findings });
    await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
  }
  console.log(`Wrote ${results.length} verdicts to ${output}`);
}
main().catch(error => { console.error(error); process.exit(1); });
