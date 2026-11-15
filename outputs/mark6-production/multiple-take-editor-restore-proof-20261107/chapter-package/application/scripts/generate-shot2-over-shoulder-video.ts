/**
 * Video motion for the over-the-shoulder Shot 2 reshoot -- see
 * generate-shot2-over-shoulder-keyframe.ts for narrative context.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const job = {
  shotId: "shot2-jesus-preaches-over-shoulder",
  keyframe: "generated/keyframes/shot2-jesus-preaches-over-shoulder.png",
  prompt:
    "Jesus continues gesturing with his hand as he speaks, seen only from behind/the side -- his face and mouth remain out of frame throughout. The seated crowd and scribes listen intently, reacting naturally -- small head nods, glances exchanged, the Principal Scribe's skeptical expression deepening slightly. No camera movement. No visible speech from Jesus's face since it is not in frame."
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
