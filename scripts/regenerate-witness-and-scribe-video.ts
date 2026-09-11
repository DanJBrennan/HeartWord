/**
 * Video motion for the crowd-witness-breathless-reaction (flat roof) and
 * scribe-questions-in-heart (close-up) reshoots. See the corresponding
 * keyframe scripts for narrative context.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const jobs = [
  {
    shotId: "crowd-witness-breathless-reaction-flatroof",
    keyframe: "generated/keyframes/crowd-witness-breathless-reaction-flatroof.png",
    prompt:
      "The crowd continues staring back at Jesus, stunned and breathless -- small head shakes, glances exchanged between them, mouths opening slightly as if to speak but no words come. No camera movement. No speech from Jesus's face since it is not in frame."
  },
  {
    shotId: "scribe-questions-in-heart-closeup",
    keyframe: "generated/keyframes/scribe-questions-in-heart-closeup.png",
    prompt:
      "The Principal Scribe continues sitting still, his eyes narrowing further, brow tightening in silent suspicion -- a slow, almost imperceptible shake of his head. His lips remain closed and still throughout -- he does not speak, mouth does not move. No camera movement."
  }
];

async function runOne(job: (typeof jobs)[number]) {
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

async function run() {
  for (const job of jobs) {
    await runOne(job);
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
