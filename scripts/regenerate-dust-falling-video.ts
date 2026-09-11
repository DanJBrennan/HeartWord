/**
 * Regenerates crowd-indoor-reaction-to-dust-falling's video motion only
 * -- Dan's review note (2026-09-10): "too dramatic. The entire roof did
 * not fall in. Plus it shows a supporting timber cut in half which they
 * could not do by digging by hand." The original keyframe
 * (generated/keyframes/crowd-indoor-reaction-to-dust-falling.png) is
 * actually fine -- a small, modest gap with narrow dust shafts -- the
 * video-motion model is what widened it into a large opening with
 * cleanly-severed structural timber. Same keyframe, tightened prompt.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const job = {
  shotId: "crowd-indoor-reaction-to-dust-falling",
  keyframe: "generated/keyframes/crowd-indoor-reaction-to-dust-falling.png",
  prompt:
    "The crowd continues looking up, unsettled, as a little more dust and a few loose reed fragments sift down through the SAME small gap already visible in the thatch -- the opening does not grow or widen at all during this shot, no additional roof material breaks away, no beam or timber shifts, cracks, or comes loose. This is only a small, still-forming gap someone is scraping at from above -- nothing structural fails, no wide collapse, no severed or broken support beam becomes visible. No camera movement. No speech."
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
    { resolution: "720p", startFrame: { path: job.keyframe }, durationSeconds: 8 }
  );
  console.log(`${job.shotId}: tier=${result.tier} veoAttempts=${result.veoAttempts} media=${result.media?.path}`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
