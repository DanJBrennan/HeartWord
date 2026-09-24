/**
 * Prepares the one approved Hatam Mark 3:10 speaking shot for safe,
 * face-targeted lip sync. It deliberately stops after identifying faces:
 * the speaker's face must be visually confirmed before an audio-driven
 * lip-sync request can be made.
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const PROJECT_ID = "0b386bfc-7919-4f40-91af-e198508a8267";
const SHOT_ID = "ffb0efa5-17ed-455a-a444-2f206a8643fd";

async function run() {
  const db = getDb();
  const keyframe = db.prepare(`
    SELECT ga.result_asset_path AS path
    FROM generation_attempts ga
    JOIN shots sh ON sh.id = ga.shot_id
    JOIN scenes sc ON sc.id = sh.scene_id
    WHERE ga.shot_id = ? AND sc.project_id = ?
      AND ga.operation = 'generate' AND ga.status = 'accepted'
    ORDER BY ga.created_at DESC LIMIT 1
  `).get(SHOT_ID, PROJECT_ID) as { path: string } | undefined;
  if (!keyframe?.path) throw new Error("Scene 2, shot 4 has no approved keyframe.");

  const provider = new KlingFaceLipSyncProvider();
  console.log("Generating the silent base video for Mark 3:10...");
  const base = await provider.generateSceneVideo(
    { path: keyframe.path },
    "Preserve the approved Papuan/Hatam identity, face, costume, composition, and setting of every visible person. The man with the unclean spirit has fallen to his knees before Jesus and is the sole intended speaker. Jesus listens silently; only subtle independent crowd motion. No English or other invented dialogue, no narration, no text, no synchronized movements, no exaggerated gestures. Keep mouths naturally at rest: face-targeted Hatam lip sync will be applied separately after speaker confirmation.",
    5
  );
  console.log("Identifying faces for visual confirmation...");
  const faces = await provider.identifyFaces(base.videoUrl);
  console.log(JSON.stringify({ baseVideoUrl: base.videoUrl, faces }, null, 2));
}

run().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
