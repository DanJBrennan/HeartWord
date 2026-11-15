/** Read-only compatibility/preservation check; never opens the migrating client. */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readProductionView } from "../src/server/production-view.js";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const root = resolve(process.argv[2] ?? "C:/Users/danbr/HeartWordData"), output = process.argv[3];
if (!output) throw new Error("Supply a local JSON evidence output path.");
const path = join(root, "db", "heartword.sqlite"), hash = () => createHash("sha256").update(readFileSync(path)).digest("hex");
const before = hash(), db = new DatabaseSync(path, { readOnly: true }); db.exec("PRAGMA query_only=ON");
const summaries = db.prepare("SELECT id FROM projects ORDER BY id").all().map(project => {
  try { const view = readProductionView(db, root, String(project.id)); return { project: view.project, state: view.state, currentStage: view.currentStage, shots: view.shots.length, reel: view.reel.length, holds: view.holds.length, costs: view.costs, render: view.render }; }
  catch (error) { return { id: project.id, error: (error as Error).message }; }
});
const renders = db.prepare("SELECT id,result_asset_path FROM chapter_renders ORDER BY id").all().map(row => {
  const file = join(root, "assets", String(row.result_asset_path));
  return { ...row, ...(existsSync(file) ? { bytes: statSync(file).size, modifiedMs: statSync(file).mtimeMs } : { missing: true }) };
});
db.close(); const after = hash();
writeFileSync(output, JSON.stringify({ root, readOnly: true, databaseHashBefore: before, databaseHashAfter: after, databaseUnchanged: before === after, summaries, renders }, null, 2));
console.log(JSON.stringify({ databaseUnchanged: before === after, projects: summaries.length, errors: summaries.filter(row => "error" in row), renders: renders.length, output }));
