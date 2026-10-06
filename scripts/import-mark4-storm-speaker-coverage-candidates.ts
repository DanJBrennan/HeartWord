/** Retains the four reviewed-source Mark 4 storm keyframe candidates as held
 * Codex image-generation attempts. It never approves a candidate or creates
 * video. */
import { createHash, randomUUID } from "node:crypto";
import { constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { readLandscapePng } from "../src/pipeline/media-generation/external-keyframes.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const sourceRoot = "C:\\Users\\danbr\\.codex\\generated_images\\01a0dfe2-0eda-78a3-a8ed-9c78be041c30";
const candidates = [
  { shotId: "6db6f5f1-ced4-4675-82f4-05c772333d01", file: "exec-be3acf60-847b-416e-a0ac-3c885d8ed72a.png", label: "Peter final plea, Mark 4:38" },
  { shotId: "c02b7bd2-d16d-4163-b7a0-88f32ae3e1dd", file: "exec-e52c967a-938a-451b-9f09-78860ab71a65.png", label: "Jesus command, Mark 4:39" },
  { shotId: "89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64", file: "exec-5b3823af-3632-4da5-af6b-0b14ba36ce0e.png", label: "Jesus first question beat, Mark 4:40" },
  { shotId: "404d00a7-a0c5-4d64-ae50-281e60f93302", file: "exec-99499c29-f118-48ca-bda2-1c9d7fd8c196.png", label: "Jesus second question beat, Mark 4:40" }
] as const;
const db = getDb();
const dataDir = getDataDir();
const now = Date.now();

for (const candidate of candidates) {
  const source = join(sourceRoot, candidate.file);
  const bytes = readFileSync(source);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const dimensions = readLandscapePng(bytes);
  const relativePath = `generated/keyframes/codex/${candidate.shotId}/mark4-storm-speaker-coverage-${candidate.file}`;
  const result = join(dataDir, "assets", relativePath);
  const provenance = result.replace(/\.png$/, ".json");
  mkdirSync(dirname(result), { recursive: true });
  try { copyFileSync(source, result, constants.COPYFILE_EXCL); } catch { /* repeat run: verify immutable saved copy below */ }
  if (createHash("sha256").update(readFileSync(result)).digest("hex") !== hash) {
    throw new Error(`Saved candidate differs from its generated source: ${candidate.label}.`);
  }
  const existing = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND result_asset_path=?")
    .get(candidate.shotId, relativePath) as { id: string } | undefined;
  if (existing) continue;

  const attemptId = randomUUID();
  const review = `${candidate.label}: generated from approved Papuan canon and the retained storm-boat reference. Held for Dan's visual review; no video generated.`;
  writeFileSync(provenance, JSON.stringify({
    provider: "codex_imagegen", model: "not_reported", resultPath: relativePath,
    resultHash: hash, dimensions, status: "hold_for_review", review,
    billing: "Built-in Codex image tool billing was not reported; cost_usd=0 is a schema placeholder, not a claim of free generation."
  }, null, 2), { flag: "wx" });
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO generation_attempts
      (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,'codex_imagegen','not_reported','generate',? ,?,'hold_for_review',?,0,?)`)
      .run(attemptId, candidate.shotId, `${dimensions.width}x${dimensions.height}`, candidate.label, relativePath, now);
    db.prepare("UPDATE shots SET status='keyframe_generated' WHERE id=?").run(candidate.shotId);
    db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
      VALUES (?,?,'shot',?,'qc',?,0,?)`)
      .run(randomUUID(), projectId, candidate.shotId, `${review}\nProvenance: ${relativePath.replace(/\.png$/, ".json")}`, now);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

console.log(JSON.stringify({ imported: candidates.length, status: "hold_for_review", videoGenerated: false }, null, 2));
