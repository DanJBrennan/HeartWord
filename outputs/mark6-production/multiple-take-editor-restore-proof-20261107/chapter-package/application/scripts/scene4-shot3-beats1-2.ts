/**
 * Scene 4 Shot 3 beats 1 (master) and 2 (lip_sync_insert, reusing the
 * shot's own crowded 5-person keyframe -- too dense to isolate Jesus
 * with a workable crop, per the lesson from Scene 4 Shot 2, so both use
 * the face-targeted flow instead: generate scene video, identify faces,
 * stop here for manual face_id confirmation.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "cef5e711-3d67-4b5c-aff1-4315587c6e23";

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
  const beat1 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '709638cd-c084-4376-aef2-0d51aba44f93'`).get() as any;
  await identifyAndSave(
    "beat1",
    beat1.keyframe_asset_path,
    "Static medium-wide shot in a wheat field by a lake. Jesus speaks to a scribe, gesturing with his hand, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    Math.max(1, Math.round((beat1.audio_end_ms - beat1.audio_start_ms) / 1000))
  );

  const shotKeyframe = db
    .prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id = ? AND operation = 'generate' AND status = 'accepted' ORDER BY created_at DESC LIMIT 1`)
    .get(shotId) as { result_asset_path: string };
  await identifyAndSave(
    "beat2",
    shotKeyframe.result_asset_path,
    "Static medium-close shot in a wheat field. Jesus speaks to a scribe, gesturing with his hand, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
    5
  );
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
