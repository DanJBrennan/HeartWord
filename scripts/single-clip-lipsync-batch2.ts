/**
 * Single-clip lip-sync shots, batch 2: Scene 2 Shot 3, Scene 3 Shots
 * 2, 3, 4 -- all dense multi-face keyframes, face-targeted flow.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const faceProvider = new KlingFaceLipSyncProvider();

async function identifyAndSave(label: string, shotId: string, prompt: string, durationSec: number) {
  const kf = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(shotId) as any;
  console.log(`${label} -- generating scene video...`);
  const { videoUrl } = await faceProvider.generateSceneVideo({ path: kf.result_asset_path }, prompt, durationSec);
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
  await Promise.allSettled([
    identifyAndSave(
      "s2s3",
      "ce87d971-d15f-4a75-b636-1c9dcb52a1fb",
      "Static medium-close shot at a tax booth. Jesus speaks to the tax collector, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
      4
    ),
    identifyAndSave(
      "s3s2",
      "f26b7be7-3801-4b47-8d38-a8ada38aa981",
      "Static medium-close shot. The crowd spokesperson speaks to Jesus, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
      4
    ),
    identifyAndSave(
      "s3s3",
      "9a1b2acb-6da9-4291-a4e1-5cbd78629e2c",
      "Static medium-close shot. Jesus responds to the crowd, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
      4
    ),
    identifyAndSave(
      "s3s4",
      "9c291cdd-389e-45db-b737-866543d730c6",
      "Static medium-close shot. Jesus continues speaking to the group, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
      4
    )
  ]);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
