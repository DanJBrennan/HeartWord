/**
 * Video motion for the paralytic-rises-from-mat keyframe -- see
 * generate-paralytic-rises-keyframe.ts for narrative context.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const job = {
  shotId: "paralytic-rises-from-mat",
  keyframe: "generated/keyframes/paralytic-rises-from-mat.png",
  prompt:
    "The paralytic continues pushing himself up off the mat, planting his feet and straightening his legs, rising the rest of the way to standing over the course of the shot -- his motion is shaky and disbelieving at first, then steadies as he reaches full height. The crowd around him leans in, reacting with growing astonishment. No speech."
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
