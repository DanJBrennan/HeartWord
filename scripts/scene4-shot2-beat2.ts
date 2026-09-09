/**
 * Beat 2 retry: the 500x281 crop failed Kling's Avatar endpoint
 * ("Image pixel is invalid" -- too small in absolute pixels), and this
 * scene is too densely packed (5-6 forward-facing people) to isolate
 * the scribe at a wider, workable crop size. Switching to the
 * face-targeted flow (like beat 1) instead: keep the full uncropped
 * scene, generate via Kling, identify faces, and lip-sync only the
 * confirmed scribe -- no crop needed at all.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "94a721a3-1fc6-44d1-a9e2-9021e26ec408";

async function run() {
  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  const faceProvider = new KlingFaceLipSyncProvider();

  console.log("Beat 2 -- generating scene video...");
  const { videoUrl } = await faceProvider.generateSceneVideo(
    { path: shotKeyframe.result_asset_path },
    "Static medium-close shot in a wheat field. The Principal scribe speaks to Jesus, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    5
  );
  console.log("identifying faces...");
  const faces = await faceProvider.identifyFaces(videoUrl);
  const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", "94a721a3-beat2");
  mkdirSync(thumbDir, { recursive: true });
  for (const face of faces) {
    const res = await fetch(face.thumbnailUrl);
    writeFileSync(join(thumbDir, `face-${face.faceId}.jpg`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`found ${faces.length} face(s) -- thumbnails at ${thumbDir}`);
  console.log(JSON.stringify({ videoUrl }, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
