/** Save all provider face thumbnails for the producer-approved v34 canonical
 * bases. Lip sync must not proceed until these targets are visibly checked. */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string };
const data = getDataDir(), assets = join(data, "assets"), db = getDb();
const manifest = JSON.parse(readFileSync(join(assets, "generated/pilot-source/mark4-v34-canonical-performances/manifest.json"), "utf8")) as { prepared: Item[] };
const provider = new KlingFaceLipSyncProvider(), result: Array<Record<string, unknown>> = [];
for (const item of manifest.prepared) {
  const base = db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='canonical_v34_base' AND status='hold_for_review' ORDER BY created_at DESC LIMIT 1").get(item.shotId) as { result_asset_path: string } | undefined;
  const taskId = base?.result_asset_path.match(/-(\d+)\.mp4$/)?.[1];
  if (!taskId) throw new Error(`No retained base task for ${item.key}.`);
  const taskResponse = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${process.env.KLING_API_KEY_1}` } });
  const task = await taskResponse.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const url = task.data?.task_result?.videos?.[0]?.url;
  if (!taskResponse.ok || task.code !== 0 || task.data?.task_status !== "succeed" || !url) throw new Error(`Provider base is unavailable for ${item.key}.`);
  const faces = await provider.identifyFaces(url), dir = join(assets, "generated/face-thumbs/mark4-v34-canonical", item.key);
  mkdirSync(dir, { recursive: true });
  const candidates: Array<{ candidate: number; faceId: string; path: string }> = [];
  for (const [index, face] of faces.entries()) {
    const path = join(dir, `face-${index + 1}.jpg`);
    if (!existsSync(path)) { const image = await fetch(face.thumbnailUrl); if (!image.ok) throw new Error(`Face thumbnail failed for ${item.key}.`); writeFileSync(path, Buffer.from(await image.arrayBuffer())); }
    candidates.push({ candidate: index + 1, faceId: face.faceId, path: join("generated/face-thumbs/mark4-v34-canonical", item.key, `face-${index + 1}.jpg`) });
  }
  result.push({ key: item.key, candidates });
}
const out = join(assets, "generated/pilot-source/mark4-v34-canonical-performances/faces.json");
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output: out, result }, null, 2));
