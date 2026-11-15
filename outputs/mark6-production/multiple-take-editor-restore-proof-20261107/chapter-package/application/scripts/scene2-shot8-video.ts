/**
 * Scene 2 Shot 8 (Mark 2:17, Jesus answering the scribes' complaint) --
 * 6 beats, 22.4s, dialogue_character_id = Jesus. Applies the validated
 * approach from Shot 8's redo and Scene 2 Shot 7:
 *  - master (1): Kling scene + KlingFaceLipSyncProvider (real audio-driven
 *    sync on the confirmed face_id), since a wide shot with the speaker
 *    visible needs real sync, not invented mouth motion.
 *  - lip_sync_insert (2, 4, 6): Kling Avatar (KlingLipSyncProvider),
 *    cropped only where a second sharp forward-facing face is present.
 *    Reviewed all three keyframes: beat 2 (the shot's own keyframe) has
 *    a clearly sharp scribe in the doorway -- cropped to exclude him.
 *    Beats 4 and 6's own keyframes are already clean single-speaker
 *    close-ups (only soft-focus background disciples) -- used as-is.
 *  - cutaway (3, 5): plain Kling scene generation, no dialogue/lip-sync
 *    -- both keyframes are reaction shots on a listener/scribe with
 *    Jesus barely or not visible.
 *
 * This step only generates beat 1's scene video and stops before
 * lip-sync so the confirmed face_id can be read from the thumbnails
 * (face_id is not stable across generations -- never guess).
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "cb1856ec-2e9f-4ba7-804c-a758da8c20d5";

async function run() {
  const beat1 = db.prepare(`SELECT * FROM coverage_beats WHERE id = '5590bfc7-9dc8-4e81-a97f-8f8d81c70d37'`).get() as any;
  const faceProvider = new KlingFaceLipSyncProvider();

  console.log("Beat 1 (master) -- generating scene video...");
  const { videoUrl } = await faceProvider.generateSceneVideo(
    { path: beat1.keyframe_asset_path },
    "Static medium-wide shot at a dining table. Jesus, reclining at the table, turns toward the doorway where scribes stand watching, speaking to them, mouth resting naturally between words. Everyone else holds their pose with only subtle natural movement.",
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
