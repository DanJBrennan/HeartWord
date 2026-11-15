/**
 * Generates real video motion from the recast roof-lowering keyframe
 * (canonical Jesus, everything else preserved from the pilot's Shot_004
 * frame) via the same 3-tier fallback chain used throughout this
 * project. This is an ADDITIONAL shot -- per Dan's explicit direction,
 * these insertions expand the chapter's runtime, they don't replace the
 * existing Shot 4 (Mark 2:4) already covering this same beat from a
 * different (interior, non-overhead) angle.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const db = getDb();
const dataDir = getDataDir();

const keyframePath = "generated/edits/shot-004-frame-0.5-recast-c06f75a9.jpg";

async function run() {
  const videoProvider = new GeminiVideoProvider();
  const klingSceneProvider = new KlingVideoProvider();
  const draftProvider = new GeminiDraftVideoProvider();

  const result = await generateFinalVideoWithFallback(
    videoProvider,
    klingSceneProvider,
    draftProvider,
    {
      shotId: "pilot-shot004-recast",
      prompt:
        "Static overhead bird's-eye shot looking straight down through a roof opening. Four friends kneel at the corners of the opening, each slowly paying out a rope, gently lowering a woven mat carrying a paralyzed man down into a packed room below. Jesus stands in the room below looking up at the descending man with calm compassion, mouth closed, no speech. Dust drifts in the sunlight. No camera movement, continue the same slow lowering motion already in progress.",
      characters: []
    },
    { resolution: "720p", startFrame: { path: keyframePath }, durationSeconds: 4 }
  );
  console.log(`tier: ${result.tier}, Veo attempts: ${result.veoAttempts}`);
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
