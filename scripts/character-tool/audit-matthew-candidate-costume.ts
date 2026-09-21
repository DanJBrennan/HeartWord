/** Runs the grounded canon garment critic on Matthew's unpromoted v5 costume candidate. */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDataDir, getDb } from "../../src/db/client.js";
import { runCanonGarmentCritic } from "../../src/pipeline/qc/canon-critic.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const candidate = path.join(getDataDir(), "assets", "characters", "candidates", "canon-costume-fixes-2026-09-21", "matthew-standing-v5-costume-critic-fixes-r4.png");
async function main() {
  const report = await runCanonGarmentCritic("Matthew (Levi) — unpromoted costume candidate", [{ mimeType: "image/png", data: (await readFile(candidate)).toString("base64") }]);
  if (report.costUsd) getDb().prepare("INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, NULL, ?, ?)").run(randomUUID(), projectId, report.costUsd, Date.now());
  const output = JSON.stringify({ severity: report.severity, costUsd: report.costUsd ?? 0, findings: report.findings }, null, 2);
  await writeFile(path.join(process.cwd(), "tmp", "matthew-candidate-costume-audit.json"), output);
  console.log(output);
}
main().catch((error) => { console.error(error); process.exit(1); });
