import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();

async function run() {
  const beat1 = db.prepare(`SELECT * FROM coverage_beats WHERE id = 'fb4b627c-f5fd-481b-b107-d88c95f90665'`).get() as any;
  const faceProvider = new KlingFaceLipSyncProvider();

  console.log("Beat 1 (master) -- generating scene video...");
  const { videoUrl } = await faceProvider.generateSceneVideo(
    { path: beat1.keyframe_asset_path },
    "Static medium-wide shot in a wheat field. The Principal scribe points toward the disciples and speaks to Jesus, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    Math.max(1, Math.round((beat1.audio_end_ms - beat1.audio_start_ms) / 1000))
  );
  console.log("identifying faces...");
  const faces = await faceProvider.identifyFaces(videoUrl);
  const thumbDir = join(dataDir, "assets", "generated", "face-thumbs", beat1.id);
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
