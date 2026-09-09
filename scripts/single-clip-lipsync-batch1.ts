/**
 * Single-clip lip-sync shots, batch 1: Scene 1 Shots 5, 6, 10 -- all
 * dense multi-face keyframes, so all use the face-targeted flow
 * (generateSceneVideo + identifyFaces) rather than crop-and-Avatar.
 * Generates the 3 scene videos + face identification in parallel, then
 * stops for manual face_id confirmation before any lip-sync call.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const faceProvider = new KlingFaceLipSyncProvider();

async function identifyAndSave(label: string, imagePath: string, prompt: string, durationSec: number) {
  console.log(`${label} -- generating scene video...`);
  const { videoUrl } = await faceProvider.generateSceneVideo({ path: imagePath }, prompt, durationSec);
  console.log(`${label} -- identifying faces...`);
  const faces = await faceProvider.identifyFaces(videoUrl);
  const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", label);
  mkdirSync(thumbDir, { recursive: true });
  for (const face of faces) {
    const res = await fetch(face.thumbnailUrl);
    writeFileSync(join(thumbDir, `face-${face.faceId}.jpg`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`${label}: found ${faces.length} face(s) -- thumbnails at ${thumbDir}`);
  console.log(JSON.stringify({ label, videoUrl }));
}

async function run() {
  const shot5 = db.prepare(`SELECT * FROM shots WHERE id = '445d00de-7f66-494d-a104-d3e927d5dbdd'`).get() as any;
  const shot5kf = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(shot5.id) as any;

  const shot6 = db.prepare(`SELECT * FROM shots WHERE id = 'fe9886dc-0510-4cdb-afdc-ed9c22d14084'`).get() as any;
  const shot6kf = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(shot6.id) as any;

  const shot10 = db.prepare(`SELECT * FROM shots WHERE id = '27416798-3186-468a-978d-35b74297ea2f'`).get() as any;
  const shot10kf = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(shot10.id) as any;

  await Promise.allSettled([
    identifyAndSave("s1s5", shot5kf.result_asset_path, "Static medium-close shot. Jesus kneels beside the paralytic on his mat, speaking to him, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.", 4),
    identifyAndSave("s1s6", shot6kf.result_asset_path, "Static medium-close shot. The Principal scribe sits among the other scribes, speaking quietly, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.", 4),
    identifyAndSave("s1s10", shot10kf.result_asset_path, "Static medium-close shot. The crowd spokesperson reacts in amazement, speaking, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.", 4)
  ]);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
