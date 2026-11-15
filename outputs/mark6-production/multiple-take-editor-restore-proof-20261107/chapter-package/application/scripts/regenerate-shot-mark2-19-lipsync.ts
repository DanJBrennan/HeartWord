/**
 * Regenerates Scene 3 Shot 3 (Mark 2:19, Jesus) with a scene video long
 * enough to cover the full real dialogue -- same root cause as Shot 5 /
 * Shot 10 (a hardcoded short durationSec in an old batch script), real
 * composite_cast_master line is 7245ms.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const faceProvider = new KlingFaceLipSyncProvider();
const SHOT_ID = "9a1b2acb-6da9-4291-a4e1-5cbd78629e2c";

async function run() {
  const kf = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(SHOT_ID) as any;
  console.log("Keyframe:", kf.result_asset_path);

  const audioRow = db
    .prepare(`SELECT source_path, start_ms, end_ms FROM audio_segments WHERE verse_ref = 'Mark 2:19' AND source_path LIKE '%composite_cast_master%'`)
    .get() as { source_path: string; start_ms: number; end_ms: number };
  console.log(`Required real dialogue duration: ${audioRow.end_ms - audioRow.start_ms}ms`);

  console.log("Generating scene video (10s)...");
  const { videoUrl } = await faceProvider.generateSceneVideo(
    { path: kf.result_asset_path },
    "Static medium-close shot. Jesus speaks continuously throughout, mouth moving naturally as if mid-speech. Everyone else holds their pose with only subtle natural movement. No cuts.",
    10
  );
  console.log("Scene video:", videoUrl);

  console.log("Identifying faces...");
  const faces = await faceProvider.identifyFaces(videoUrl);
  const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", "mark2-19-redo");
  mkdirSync(thumbDir, { recursive: true });
  for (const face of faces) {
    const res = await fetch(face.thumbnailUrl);
    writeFileSync(join(thumbDir, `face-${face.faceId}.jpg`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`Found ${faces.length} face(s), thumbnails at ${thumbDir}`);
  console.log(JSON.stringify({ videoUrl }, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
