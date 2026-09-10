/**
 * Re-casts Shot_004's stand-in Jesus with HeartWord's own canonical
 * Jesus, preserving everything else in the frame (four friends, rope
 * rig, crowd, overhead camera angle) exactly as filmed. See
 * GeminiImageEditor.recastCharacter's header comment for why this
 * needed a new provider method rather than reusing editRegion.
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { GeminiImageEditor } from "../src/providers/gemini/index.js";

const db = getDb();

async function run() {
  const jesus = db
    .prepare(
      `SELECT c.id AS characterId, cv.id AS characterVersionId FROM characters c
       JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
       WHERE c.name = 'Jesus'`
    )
    .get() as { characterId: string; characterVersionId: string };
  console.log("Jesus canon:", jesus);

  const editor = new GeminiImageEditor();
  const result = await editor.recastCharacter(
    { path: "generated/pilot-source-frames/shot-004-frame-0.5.jpg" },
    jesus,
    "the man standing in the dark blue robe in the lower-center of the frame, below the roof opening, looking up at the man being lowered on the mat"
  );
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
