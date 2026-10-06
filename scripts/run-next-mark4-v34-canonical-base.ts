/** Submit exactly one producer-approved canonical Jesus keyframe for a held,
 * silent base-motion take. Durable pending state prevents duplicate charges. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string; passage: string; startMs: number; endMs: number; keyframePath: string; audioPath: string };
const data = getDataDir(), assets = join(data, "assets"), db = getDb();
const manifest = JSON.parse(readFileSync(join(assets, "generated/pilot-source/mark4-v34-canonical-performances/manifest.json"), "utf8")) as { prepared: Item[] };
const pendingPath = join(assets, "generated/pilot-source/mark4-v34-canonical-performances/pending-bases.json");
const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) as Array<{ key: string; taskId: string }> : [];
const save = () => writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
const next = manifest.prepared.find(item => !db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_base' AND status='hold_for_review' AND result_asset_path IS NOT NULL").get(item.shotId));
if (!next) { console.log(JSON.stringify({ complete: true, count: manifest.prepared.length })); process.exit(0); }
if (pending.some(entry => entry.key === next.key)) throw new Error(`${next.key} is already submitted; recover its durable task instead of creating a duplicate.`);
if (!existsSync(join(assets, next.keyframePath)) || !existsSync(join(assets, next.audioPath))) throw new Error(`${next.key} lacks an approved keyframe or exact cast excerpt.`);
const setting = next.passage.startsWith("Mark 4:3") ? "boat teaching beside the shore" : next.passage.startsWith("Mark 4:14") ? "private olive-grove teaching circle" : next.passage.startsWith("Mark 4:21") ? "public lakeshore teaching" : next.passage.startsWith("Mark 4:26") ? "field-side parable teaching" : "mustard-seed teaching setting";
const prompt = `Mark 4 held canonical Jesus performance ${next.key}. Preserve the approved keyframe exactly: ${setting}; canonical Papuan Jesus with long dark wavy hair, beard, cream woven garment and restricted indigo bands. Create only natural eye, breath, restrained hand and body motion while his mouth remains neutral for later exact source-audio face lip sync. Jesus is the only readable foreground face; any listeners remain natural and silent. No spoken audio, music, camera move, new people, identity, wardrobe, or location change. Held review only.`;
const provider = new KlingFaceLipSyncProvider();
const { taskId, videoUrl } = await provider.generateSceneVideo({ path: next.keyframePath }, prompt, 5, async submitted => { pending.push({ key: next.key, taskId: submitted }); save(); });
const response = await fetch(videoUrl);
if (!response.ok) throw new Error(`${next.key} base download failed.`);
const rel = join("generated", "video", `mark4-v34-canonical-base-${next.key}-${taskId}.mp4`);
mkdirSync(join(assets, "generated", "video"), { recursive: true });
writeFileSync(join(assets, rel), Buffer.from(await response.arrayBuffer()), { flag: "wx" });
const durationMs = Math.round(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nokey=1", join(assets, rel)], { encoding: "utf8" }).trim()) * 1000);
if (durationMs < next.endMs - next.startMs) throw new Error(`${next.key} base is shorter than its exact audio excerpt.`);
db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
  VALUES (?,?,'kling','kling-v2-6-pro','canonical_v34_base','720p',?,'hold_for_review',?,?,?)`)
  .run(randomUUID(), next.shotId, prompt, rel, 0.6, Date.now());
pending.splice(pending.findIndex(entry => entry.key === next.key && entry.taskId === taskId), 1); save();
console.log(JSON.stringify({ key: next.key, taskId, path: rel, durationMs, heldForReview: true }, null, 2));
