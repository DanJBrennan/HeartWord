/**
 * Generates the four producer-approved, picture-only Mark 4:31–32
 * mustard-seed illustration takes. They remain held review candidates;
 * chapter audio and the assembled timeline are intentionally untouched.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiVideoProvider } from "../src/providers/gemini/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const jesusCharacterId = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const jesusVersionId = "4e23012c-a74d-4e63-b4ae-a63d6847a02a";
const logPath = join(getDataDir(), "logs", "mark4-mustard-illustration.jsonl");
mkdirSync(dirname(logPath), { recursive: true });
const log = (event: string, detail: unknown) => appendFileSync(logPath, `${JSON.stringify({ at: Date.now(), event, detail })}\n`);

const takes = [
  {
    key: "seed-scale",
    targetShotId: "cdc3d490-e11f-4e67-8d50-07e8112daa90",
    image: "generated/review/mark4-mustard-seed/01-seed-in-hand-held.png",
    prompt: "Animate this approved Mark 4:31 keyframe as a quiet eight-second visual illustration. Preserve canonical Papuan Jesus's warm-brown hand and exact cream mantle with restrained indigo bands. The single tiny mustard seed remains visibly small and stable in his open palm; use only natural breathing in the hand, a faint breeze in the sleeve, and distant Galilean lake atmosphere. No speech, mouth movement, words, subtitles, music, extra seeds, plant growth, birds, camera cut, new person, or canon drift. The assembled film will place the real Hatam Jesus audio beneath it."
  },
  {
    key: "planting",
    targetShotId: "519df33a-1adc-4b10-9617-d9c4c3add6ed",
    image: "generated/review/mark4-mustard-seed/02-planting-held.png",
    prompt: "Animate this approved Mark 4:31 keyframe as a quiet eight-second visual illustration. Preserve canonical Papuan Jesus's warm-brown hand and exact cream mantle with restrained indigo bands. His fingers gently lower the one tiny mustard seed into the prepared Galilean furrow and naturally draw a little loose soil nearby; the seed must remain legible during the beginning of the motion. No speech, mouth movement, words, subtitles, music, extra people, repeated seeds, sudden plant growth, birds, camera cut, modern tools, or canon drift. The assembled film will place the real Hatam Jesus audio beneath it."
  },
  {
    key: "growth",
    targetShotId: "9522db93-f598-4777-ac1f-58cf67e6f72f",
    image: "generated/review/mark4-mustard-seed/03-growth-held.png",
    prompt: "Animate this approved Mark 4:32 keyframe as a quiet eight-second visual illustration. Keep the mature mustard plant, its scale over surrounding low garden plants, Galilean garden, sunlight, and natural botany exactly as shown. Use only gentle leaf and branch movement in a breeze, subtle changing light, and a restrained slow camera rise that lets the branching shape read. No speech, words, subtitles, music, people, birds, nests, magical time-lapse, camera cut, fantasy tree, or sudden new object. The assembled film will place the real Hatam Jesus audio beneath it."
  },
  {
    key: "branches-and-birds",
    targetShotId: "cacd5540-4576-4a15-b2bd-708eb27a4f8b",
    image: "generated/review/mark4-mustard-seed/04-branches-and-birds-held.png",
    prompt: "Animate this approved Mark 4:32 keyframe as a quiet eight-second visual illustration. Preserve the broad mature mustard plant, realistic garden scale, its established small birds, and their simple nests. Leaves and branches move naturally in a breeze; one bird may make a small natural settling adjustment, while the nests remain stable. No speech, words, subtitles, music, people, new flock, predation, magical growth, camera cut, fantasy tree, or modern object. The assembled film will place the real Hatam Jesus audio beneath it."
  }
] as const;

async function run() {
  const db = getDb();
  const provider = new GeminiVideoProvider();
  const completed: Array<{ key: string; path: string }> = [];
  for (const take of takes) {
    const requestId = `mark4-mustard-${take.key}-${randomUUID()}`;
    const existing = db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
      .get(take.targetShotId, `%Mark 4:${take.key}%`) as { id: string; result_asset_path: string } | undefined;
    if (existing?.result_asset_path) { completed.push({ key: take.key, path: existing.result_asset_path }); continue; }
    log("submission-started", { key: take.key, image: take.image });
    const result = await provider.generateFinal({
      shotId: requestId,
      prompt: take.prompt,
      characters: take.key === "seed-scale" || take.key === "planting"
        ? [{ characterId: jesusCharacterId, characterVersionId: jesusVersionId, storyVerseRef: "mark 4:31" }]
        : []
    }, { resolution: "720p", startFrame: { path: take.image }, durationSeconds: 8, tier: "economy" });
    if (!result.media) throw new Error(`No rendered media returned for ${take.key}.`);
    const attemptId = randomUUID(), now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO generation_attempts
        (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
        VALUES (?,?,?,?,?,'720p',?,'hold_for_review',?,?,?)`)
        .run(attemptId, take.targetShotId, result.provenance.provider, result.provenance.model, "generate_final_video", `Mark 4:${take.key}. ${result.provenance.prompt}`, result.media.path, result.cost.usd, now);
      db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
        .run(randomUUID(), projectId, attemptId, result.cost.usd, now);
      db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'human',?,0,?)")
        .run(randomUUID(), projectId, take.targetShotId, `Producer-approved Mark 4:31–32 ${take.key} illustration. Picture-only held candidate; chapter audio and timing remain locked.`, now);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    completed.push({ key: take.key, path: result.media.path });
    log("candidate-held", { key: take.key, path: result.media.path, costUsd: result.cost.usd });
    console.log(JSON.stringify({ event: "candidate-held", key: take.key, path: result.media.path }));
  }
  console.log(JSON.stringify({ event: "all-held", completed }));
}

run().catch((error) => { log("failed", { message: (error as Error).message }); console.error(error); process.exitCode = 1; });
