/**
 * Submit one held v63 non-speaking scene-world coverage candidate at a time.
 * It has no audio, lip-sync, acceptance, or chapter-placement authority.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Candidate = { key: string; shotId: string; imagePath: string; setting: string };
const candidates: Candidate[] = [
  { key: "scene1-boat-reverse", shotId: "5a812d41-8b6a-443e-9028-3dd8bc4649d2", imagePath: "generated/keyframes/codex/5a812d41-8b6a-443e-9028-3dd8bc4649d2/83006f46-785b-43b7-996e-5bf1034219a3.png", setting: "the established offshore wooden fishing boat and the same rocky shore crowd" },
  { key: "scene2-hillside-listeners", shotId: "6096a4f9-7032-440d-97c8-ee2d92f377d7", imagePath: "generated/keyframes/codex/6096a4f9-7032-440d-97c8-ee2d92f377d7/1b6afbd0-2e8c-49cd-a954-95963e6358bb.png", setting: "the private rocky seaside hillside with the same small disciple circle" },
  { key: "scene3-olive-grove-group", shotId: "cfdb65be-62c3-4c88-b2e7-8d2f5459ab39", imagePath: "generated/keyframes/codex/cfdb65be-62c3-4c88-b2e7-8d2f5459ab39/03403a60-94a3-47b4-82c4-deceb0b488e9.png", setting: "the private olive-grove slope above the lake and the same disciple circle" },
  { key: "scene4-lakeshore-group", shotId: "0003976f-7c1a-4508-a40c-cad61cd7bb37", imagePath: "generated/keyframes/codex/0003976f-7c1a-4508-a40c-cad61cd7bb37/dbef2aea-7e1d-47cd-a4b5-7e353103cf2f.png", setting: "the rocky lakeshore and same moored fishing boat" }
];

const data = getDataDir();
const assets = join(data, "assets");
const pendingPath = join(assets, "generated/pilot-source/mark4-v63-world-coverage-pending.json");
const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) as Array<{ key: string; taskId: string }> : [];
const save = () => { mkdirSync(join(assets, "generated/pilot-source"), { recursive: true }); writeFileSync(pendingPath, JSON.stringify(pending, null, 2)); };
const db = getDb();
const next = candidates.find(candidate => !db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='v63_scene_world_base' AND status='hold_for_review' AND result_asset_path IS NOT NULL").get(candidate.shotId));
if (!next) { console.log(JSON.stringify({ complete: true, heldCandidates: candidates.length })); process.exit(0); }
if (pending.some(entry => entry.key === next.key)) throw new Error(`${next.key} is already submitted; recover its durable provider task instead of duplicating it.`);
if (!existsSync(join(assets, next.imagePath))) throw new Error(`Missing registered held keyframe: ${next.imagePath}`);

const prompt = `Mark 4 held non-speaking continuity coverage, ${next.key}. Preserve the approved keyframe's canon, faces, garment colours, geography, and warm scene light exactly: ${next.setting}. Create gentle natural motion only: wind, water, breathing, eye movement, subtle listener reaction, and restrained body motion. No readable speaking mouth, spoken audio, music, new action, new people, camera relocation, costume/identity changes, or location change. This is a five-second held review take only, never a chapter placement.`;
const provider = new KlingFaceLipSyncProvider();
const { taskId, videoUrl } = await provider.generateSceneVideo({ path: next.imagePath }, prompt, 5, async submitted => { pending.push({ key: next.key, taskId: submitted }); save(); });
const response = await fetch(videoUrl);
if (!response.ok) throw new Error(`${next.key} base download failed with ${response.status}.`);
const rel = join("generated", "video", `mark4-v63-world-base-${next.key}-${taskId}.mp4`);
mkdirSync(join(assets, "generated", "video"), { recursive: true });
writeFileSync(join(assets, rel), Buffer.from(await response.arrayBuffer()), { flag: "wx" });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", join(assets, rel)], { encoding: "utf8" }).trim()) * 1000);
if (durationMs < 4500) throw new Error(`${next.key} generated only ${durationMs}ms of motion.`);
db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
  VALUES (?,?,'kling','kling-v2-6-pro','v63_scene_world_base','720p',?,'hold_for_review',?,?,?)`)
  .run(randomUUID(), next.shotId, prompt, rel, 0.6, Date.now());
const pendingIndex = pending.findIndex(entry => entry.key === next.key && entry.taskId === taskId);
if (pendingIndex >= 0) pending.splice(pendingIndex, 1);
save();
console.log(JSON.stringify({ key: next.key, taskId, path: rel, durationMs, heldForReview: true }, null, 2));
