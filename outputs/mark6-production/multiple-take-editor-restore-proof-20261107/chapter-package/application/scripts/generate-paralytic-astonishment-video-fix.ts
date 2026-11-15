/**
 * Video motion for the corrected flat-roof paralytic-astonishment
 * keyframe -- see generate-paralytic-astonishment-keyframe-fix.ts.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const job = {
  shotId: "paralytic-astonishment-flatroof",
  keyframe: "generated/keyframes/paralytic-astonishment-flatroof.png",
  prompt:
    "The paralytic stands frozen in disbelief, chest rising with a sharp astonished breath, eyes wide, mouth slightly open. He flexes his fingers and shifts his weight slightly, testing his healed legs, still stunned. No camera movement, continue the same standing moment already in progress. No speech."
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
