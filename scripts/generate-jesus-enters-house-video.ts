/**
 * Video motion for the "Jesus and disciples enter the house" keyframe --
 * see generate-jesus-enters-house-keyframe.ts for narrative context.
 * Same 3-tier fallback chain as the other supplementary inserts.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const job = {
  shotId: "jesus-and-disciples-enter-house",
  keyframe: "generated/keyframes/jesus-and-disciples-enter-house.png",
  prompt:
    "Jesus continues walking calmly along the street with Peter, Andrew, and John following just behind, mid-conversation. They approach the open doorway of the house ahead and Jesus steps through it, disciples following him in one by one. No crowd is present. Natural, unhurried walking pace, slight camera drift following them forward. No speech."
};

async function run() {
  const videoProvider = new GeminiVideoProvider();
  const klingSceneProvider = new KlingVideoProvider();
  const draftProvider = new GeminiDraftVideoProvider();

  const result = await generateFinalVideoWithFallback(
    videoProvider,
    klingSceneProvider,
    draftProvider,
    { shotId: job.shotId, prompt: job.prompt, characters: [] },
    { resolution: "720p", startFrame: { path: job.keyframe }, durationSeconds: 4 }
  );
  console.log(`${job.shotId}: tier=${result.tier} veoAttempts=${result.veoAttempts} media=${result.media?.path}`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
