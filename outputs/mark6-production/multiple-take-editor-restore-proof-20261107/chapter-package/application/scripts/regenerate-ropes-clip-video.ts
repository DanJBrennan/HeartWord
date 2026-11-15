/**
 * Regenerates the friends-ready-ropes-at-opening video motion -- the
 * first take (2026-09-10) had the video-motion model add a stray figure
 * poking up through the roof opening from inside the house, which isn't
 * in the original keyframe and doesn't belong in the shot (no one from
 * inside should be visible through the opening at this point). Same
 * keyframe, tightened prompt with an explicit negative constraint.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const job = {
  shotId: "friends-ready-ropes-at-opening",
  keyframe: "generated/keyframes/friends-ready-ropes-at-opening.png",
  prompt:
    "The four friends finish tightening the rope knots at each corner of the mat, exchange one last determined look with each other, and begin to lift the mat slightly off the roof surface toward the opening, preparing to lower it through. The paralytic grips the edge of the mat, bracing himself. The square opening below them shows only dust, loose straw, and the dim room below -- completely empty, no person, no face, no hand, no one visible through it at any point. No camera movement, continue the same kneeling motion already in progress. No speech."
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
