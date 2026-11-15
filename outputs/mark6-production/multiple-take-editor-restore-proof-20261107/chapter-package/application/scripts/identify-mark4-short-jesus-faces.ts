/** Identify every provider-tracked face in the seven bounded Mark 4 bases.
 * The thumbnails make the speaking target reviewable before any lip sync. */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

type Item = { key: string; shotId: string; label: string };
const dataDir = getDataDir();
const db = getDb();
const key = process.env.KLING_API_KEY_1;
if (!key) throw Error("Kling key is unavailable.");
const manifest = JSON.parse(readFileSync(join(dataDir, "assets", "generated", "pilot-source", "mark4-short-jesus-batch.json"), "utf8")) as { items: Item[] };
const provider = new KlingFaceLipSyncProvider();
const output = [] as Array<{ key: string; label: string; candidates: Array<{ candidate: number; faceId: string; start: number; end: number; path: string }> }>;
for (const item of manifest.items) {
  const base = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_short_jesus_base'
    AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1`).get(item.shotId, `Mark 4 short-Jesus batch ${item.key}%`) as { result_asset_path: string } | undefined;
  if (!base) throw Error(`Held base is unavailable for ${item.label}.`);
  const taskId = /-(\d+)\.mp4$/.exec(base.result_asset_path)?.[1];
  if (!taskId) throw Error(`Cannot recover provider task from ${item.label} base path.`);
  const res = await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`, { headers: { Authorization: `Bearer ${key}` } });
  const task = await res.json() as { code: number; data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };
  const videoUrl = task.data?.task_result?.videos?.[0]?.url;
  if (!res.ok || task.code !== 0 || task.data?.task_status !== "succeed" || !videoUrl) throw Error(`Completed provider base is unavailable for ${item.label}.`);
  const faces = await provider.identifyFaces(videoUrl);
  const dir = join(dataDir, "assets", "generated", "face-thumbs", "mark4-short-jesus", item.key);
  mkdirSync(dir, { recursive: true });
  const candidates = [] as Array<{ candidate: number; faceId: string; start: number; end: number; path: string }>;
  for (const [index, face] of faces.entries()) {
    const image = await fetch(face.thumbnailUrl);
    if (!image.ok) throw Error(`Face thumbnail download failed for ${item.label}.`);
    const path = join(dir, `face-${index + 1}.jpg`);
    writeFileSync(path, Buffer.from(await image.arrayBuffer()));
    candidates.push({ candidate: index + 1, faceId: face.faceId, start: face.startTime, end: face.endTime, path });
  }
  output.push({ key: item.key, label: item.label, candidates });
}
console.log(JSON.stringify(output, null, 2));
