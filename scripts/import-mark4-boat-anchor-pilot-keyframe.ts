import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

// Records Dan Brennan's spoken approval of the reference-locked Mark 4:1
// boat-and-shore pilot anchor. The original generated image remains untouched.
const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId = "b4f60ed5-c4f4-436f-bfac-fb0e8b357fdf";
const source = "C:\\Users\\danbr\\.codex\\generated_images\\01a0df30-f097-7403-b623-a3bc2dbaab40\\exec-20e7deed-bd30-4849-a97e-9580d48ed4c5.png";
const relativeResult = `generated/keyframes/codex/${shotId}/mark4-boat-anchor-papuan-r1.png`;
const dataDir = getDataDir();
const result = join(dataDir, "assets", relativeResult);
const provenance = result.replace(/\.png$/, ".json");
const db = getDb();
const now = Date.now();
const bytes = readFileSync(source);
const hash = createHash("sha256").update(bytes).digest("hex");

mkdirSync(dirname(result), { recursive: true });
if (!readFileSync) throw new Error("Node filesystem unavailable.");
try { copyFileSync(source, result, 1); } catch { /* already imported: verify below */ }
if (createHash("sha256").update(readFileSync(result)).digest("hex") !== hash) {
  throw new Error("The saved boat-anchor keyframe does not match the approved image.");
}

db.exec("BEGIN IMMEDIATE");
try {
  const existing = db.prepare(`SELECT id FROM generation_attempts WHERE shot_id=? AND result_asset_path=?`)
    .get(shotId, relativeResult) as { id: string } | undefined;
  const attemptId = existing?.id ?? randomUUID();
  if (!existing) {
    writeFileSync(provenance, JSON.stringify({
      provider: "codex_imagegen", model: "not_reported", resultPath: relativeResult,
      resultHash: hash, status: "accepted",
      review: "Dan Brennan approved the corrected Mark 4:1 boat-and-shore anchor in voice review. Papuan Jesus likeness and natural shoreline crowd accepted for the restart pilot.",
      billing: "Built-in Codex image tool billing was not reported; cost_usd=0 is a schema placeholder, not a claim of free generation."
    }, null, 2), { flag: "wx" });
    db.prepare(`INSERT INTO generation_attempts
      (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?,'codex_imagegen','not_reported','generate','16:9',?,'accepted',?,0,?)`)
      .run(attemptId, shotId, "Reference-locked correction: Jesus seated in boat; Papuan canon identity; shore crowd naturally distributed; no posed lineup.", relativeResult, now);
  }
  db.prepare("UPDATE shots SET status='keyframe_approved' WHERE id=?").run(shotId);
  db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES (?,?,'shot',?,'human',?,1,?)`).run(
      randomUUID(), projectId, shotId,
      "Dan Brennan producer approval: corrected Mark 4:1 boat-and-shore anchor is approved for the four-item restart pilot. The prior posed/identity-drift attempts remain retained revision history.", now);
  db.exec("COMMIT");
  console.log(JSON.stringify({ ok: true, attemptId, result }, null, 2));
} catch (error) { db.exec("ROLLBACK"); throw error; }
