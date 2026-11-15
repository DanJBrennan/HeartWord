/** Retain three closer canonical Jesus keyframes for producer review. These
 * are new still candidates only: they do not replace the earlier keyframes,
 * trigger video generation, or alter the final-cut timeline. */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const dataDir = getDataDir();
const assets = join(dataDir, "assets");
const candidates = [
  ["14-20-beat-1", "680fba01-4960-404c-8a29-97f7fcdcba76", "generated/review/mark4-v34-performance-candidates/mark4-14-20-beat-1-close-keyframe-v2.png", "Private olive-grove teaching: medium close-up, large unobstructed face for visible lip-sync; no public shoreline."],
  ["26-29-beat-3", "dbc3f313-54a7-4b06-b5de-1452629be4f3", "generated/review/mark4-v34-performance-candidates/mark4-26-29-beat-3-close-keyframe-v2-crop.png", "Field-side parable teaching: medium close-up, large unobstructed face for visible lip-sync."],
  ["30-32-beat-2", "b791ad84-184e-4875-806b-2e0f2f9b29f6", "generated/review/mark4-v34-performance-candidates/mark4-30-32-beat-2-close-keyframe-v2.png", "Mustard-seed teaching: medium close-up, mustard plant subordinate and clear face for visible lip-sync."]
] as const;

const db = getDb();
const requireShot = (key: string, shotId: string) => {
  const row = db.prepare("SELECT id FROM shots WHERE continuity_notes LIKE ?").get(`CANONICAL_JESUS_PERFORMANCE_${key};%`) as { id: string } | undefined;
  if (!row || row.id !== shotId) throw new Error(`Canonical performance shot ${key} no longer matches its immutable record.`);
};
db.exec("BEGIN IMMEDIATE");
try {
  for (const [key, fallbackShotId, path, description] of candidates) {
    const shotId = fallbackShotId;
    requireShot(key, shotId);
    if (!existsSync(join(assets, path))) throw new Error(`${key} close keyframe is missing: ${path}`);
    const prompt = `Mark 4 ${key} closer canonical Jesus keyframe replacement. ${description} Built-in Codex image generator; held for producer approval before any motion or lip-sync.`;
    const existing = db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_keyframe' AND result_asset_path=?").get(shotId, path) as { id: string } | undefined;
    if (!existing) db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
      VALUES (?,?, 'codex_imagegen','built-in-codex-image-generator','canonical_v34_close_keyframe','16:9',?,'hold_for_review',?,0,?)`)
      .run(randomUUID(), shotId, prompt, path, Date.now());
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log(JSON.stringify({ held: candidates.map(([key,,path]) => ({ key, path })), chapterPlacement: false }, null, 2));
