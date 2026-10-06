/** Identify (never infer) the face target in each completed close performance
 * base. A later lip-sync submission is refused unless exactly one candidate is
 * returned and its thumbnail is retained for review. */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string };
const data = getDataDir(), assets = join(data, "assets"), db = getDb();
const manifest = JSON.parse(readFileSync(join(assets, "generated/pilot-source/mark4-v34-canonical-performances/manifest.json"), "utf8")) as { prepared: Item[] };
const keys = new Set(["14-20-beat-1", "26-29-beat-3", "30-32-beat-2"]);
const provider = new KlingFaceLipSyncProvider();
const apiKey = process.env.KLING_API_KEY_1; if (!apiKey) throw new Error("KLING_API_KEY_1 is not configured.");
const results: Array<{ key: string; candidates: Array<{ candidate: number; faceId: string; path: string }> }> = [];
for (const item of manifest.prepared.filter((candidate) => keys.has(candidate.key))) {
  const base = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_close_base' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(item.shotId) as { result_asset_path: string } | undefined;
  const taskId = base?.result_asset_path.match(/-(\d+)\.mp4$/)?.[1]; if (!taskId) throw new Error(`${item.key} close base is unavailable.`);
  const response = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const task = await response.json() as { data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const url = task.data?.task_result?.videos?.[0]?.url;
  if (!response.ok || task.data?.task_status !== "succeed" || !url) throw new Error(`${item.key} close base ${taskId} is not recoverable.`);
  const faces = await provider.identifyFaces(url);
  const dirRel = join("generated", "face-thumbs", "mark4-v34-canonical-close", item.key);
  mkdirSync(join(assets, dirRel), { recursive: true });
  const candidates = await Promise.all(faces.map(async (face, index) => {
    const image = await fetch(face.thumbnailUrl); if (!image.ok) throw new Error(`${item.key} face thumbnail ${index + 1} failed.`);
    const path = join(dirRel, `face-${index + 1}.jpg`); writeFileSync(join(assets, path), Buffer.from(await image.arrayBuffer()));
    return { candidate: index + 1, faceId: face.faceId, path };
  }));
  if (candidates.length !== 1) throw new Error(`${item.key} returned ${candidates.length} faces; producer selection is required.`);
  results.push({ key: item.key, candidates });
}
const out = join(assets, "generated/pilot-source/mark4-v34-canonical-performances/close-faces.json");
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ path: out, results }, null, 2));
