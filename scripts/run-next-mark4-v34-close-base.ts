/** Generate one held base-motion clip from an approved close performance
 * keyframe. Separate operation names preserve every earlier wide take. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string; passage: string; audioPath: string; durationMs: number };
const data = getDataDir(), assets = join(data, "assets"), db = getDb();
const manifest = JSON.parse(readFileSync(join(assets, "generated/pilot-source/mark4-v34-canonical-performances/manifest.json"), "utf8")) as { prepared: Item[] };
const closeKeys = new Set(["14-20-beat-1", "26-29-beat-3", "30-32-beat-2"]);
const pendingPath = join(assets, "generated/pilot-source/mark4-v34-canonical-performances/pending-close-bases.json");
const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) as Array<{ key: string; taskId: string }> : [];
const save = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
const next = manifest.prepared.find((item) => closeKeys.has(item.key) && !db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_base' AND status='hold_for_review' AND result_asset_path IS NOT NULL").get(item.shotId));
if (!next) { console.log(JSON.stringify({ complete: true })); process.exit(0); }
if (pending.some((entry) => entry.key === next.key)) throw new Error(`${next.key} has a durable base task; do not duplicate it.`);
const keyframe = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_keyframe' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(next.shotId) as { result_asset_path: string } | undefined;
if (!keyframe || !existsSync(join(assets, keyframe.result_asset_path))) throw new Error(`${next.key} approved close keyframe is unavailable.`);
const motionDirection = next.key === "30-32-beat-2"
  ? "He blinks naturally at least once, makes a subtle attentive head turn or nod, and completes one restrained open-hand teaching gesture by lowering or settling the raised hand naturally; never freeze the hand in midair."
  : "Use natural attentive head, eye, breath, and restrained shoulder motion suited to an intimate teaching performance.";
const prompt = `Mark 4 held close canonical Jesus performance ${next.key} (${next.passage}). Preserve the approved close keyframe exactly: same canonical Papuan Jesus, long dark wavy hair, beard, cream garment and restricted indigo bands, same setting and framing. ${motionDirection} Keep the mouth neutral for later exact audio-driven face lip sync. Jesus remains the sole readable face. No spoken audio, music, camera movement, new people, wardrobe, identity, location, or action. Held review only.`;
const provider = new KlingFaceLipSyncProvider();
const { taskId, videoUrl } = await provider.generateSceneVideo({ path: keyframe.result_asset_path }, prompt, 5, async (submitted) => { pending.push({ key: next.key, taskId: submitted }); save(); });
const response = await fetch(videoUrl); if (!response.ok) throw new Error(`${next.key} base download failed.`);
const rel = join("generated", "video", `mark4-v34-canonical-close-base-${next.key}-${taskId}.mp4`);
mkdirSync(join(assets, "generated", "video"), { recursive: true }); writeFileSync(join(assets, rel), Buffer.from(await response.arrayBuffer()), { flag: "wx" });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nokey=1", join(assets, rel)], { encoding: "utf8" }).trim()) * 1000);
if (durationMs < next.durationMs) throw new Error(`${next.key} base is shorter than its source excerpt.`);
db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
 VALUES (?,?,'kling','kling-v2-6-pro','canonical_v34_close_base','720p',?,'hold_for_review',?,?,?)`).run(randomUUID(), next.shotId, prompt, rel, 0.6, Date.now());
pending.splice(pending.findIndex((entry) => entry.key === next.key && entry.taskId === taskId), 1); save();
console.log(JSON.stringify({ key: next.key, path: rel, durationMs, heldForReview: true }, null, 2));
