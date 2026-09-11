/**
 * Video motion for the 3 new inserts from Dan's 2026-09-10 review round:
 * crowd-gathers-at-doorway, friends-approach-stairs,
 * friends-ready-ropes-at-opening. Same 3-tier fallback chain as the
 * other supplementary inserts.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const jobs = [
  {
    shotId: "crowd-gathers-at-doorway",
    keyframe: "generated/keyframes/crowd-gathers-at-doorway.png",
    prompt:
      "More people continue walking into frame from both sides, gradually converging toward the doorway -- the crowd visibly grows and tightens over the course of the shot as more arrivals press in closer together. No camera movement. No speech."
  },
  {
    shotId: "friends-approach-stairs",
    keyframe: "generated/keyframes/friends-approach-stairs.png",
    prompt:
      "The four friends continue carrying the paralytic on his mat toward the stone stairway, Friend 1 in front reaching the bottom step and beginning to climb, the others following close behind carrying the mat carefully up the first steps. No camera movement, continue the same walking motion already in progress. No speech."
  },
  {
    shotId: "friends-ready-ropes-at-opening",
    keyframe: "generated/keyframes/friends-ready-ropes-at-opening.png",
    prompt:
      "The four friends finish tightening the rope knots at each corner of the mat, exchange one last determined look with each other, and begin to lift the mat slightly off the roof surface toward the opening, preparing to lower it through. The paralytic grips the edge of the mat, bracing himself. No camera movement, continue the same kneeling motion already in progress. No speech."
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
  return result;
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
