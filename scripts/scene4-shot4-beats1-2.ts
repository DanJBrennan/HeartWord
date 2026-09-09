/**
 * Scene 4 Shot 4 beats 1 (master) and 2 (lip_sync_insert, reusing the
 * shot's own 4-person keyframe) -- both dense enough to warrant the
 * face-targeted flow instead of cropping. Generates scene videos and
 * identifies faces; stops for manual face_id confirmation.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "96199814-0884-4a4a-bd95-b84950fce4fd";

async function identifyAndSave(label: string, imagePath: string, prompt: string, durationSec: number) {
  const faceProvider = new KlingFaceLipSyncProvider();
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
  console.log(JSON.stringify({ label, videoUrl }, null, 2));
}

async function run() {
  const beat1 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'df37e404-0393-4a60-86c5-9e7a0752567d'`).get() as any;
  await identifyAndSave(
    "s4s4-beat1",
    beat1.keyframe_asset_path,
    "Static medium-wide shot in a wheat field by a lake. Jesus speaks to two scribes, gesturing with his hand, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    Math.max(1, Math.round((beat1.audio_end_ms - beat1.audio_start_ms) / 1000))
  );

  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  await identifyAndSave(
    "s4s4-beat2",
    shotKeyframe.result_asset_path,
    "Static medium-close shot in a wheat field. Jesus speaks to two scribes, gesturing with his hand, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    5
  );
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
