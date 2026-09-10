/**
 * Generates real video motion for the 7 supplementary keyframes built in
 * generate-friends-sequence-keyframes.ts (four-friends approach/roof
 * beats, paralytic's healing reaction, friends' happy glance). Same
 * 3-tier fallback chain as the Shot_004 recast video. All are ADDITIONS
 * to the chapter -- they expand runtime, they don't replace any existing
 * shot.
 */
import "dotenv/config";
import { GeminiDraftVideoProvider, GeminiVideoProvider } from "../src/providers/gemini/index.js";
import { KlingVideoProvider } from "../src/providers/kling/index.js";
import { generateFinalVideoWithFallback } from "../src/pipeline/media-generation/generate-final-with-fallback.js";

const VEO_BATCH_CONCURRENCY = 3;
const DEFAULT_DURATION_SEC = 4;

const jobs = [
  {
    shotId: "friends-carrying-to-house",
    keyframe: "generated/keyframes/friends-carrying-to-house.png",
    prompt:
      "The four friends carrying the paralytic on a mat come to a stop in front of a packed stone house. They look up at the dense crowd blocking the doorway, their expressions shifting to visible exasperation -- brows furrow, shoulders sag, one glances sideways at another in frustration. No camera movement, continue the same standing moment already in progress. No speech."
  },
  {
    shotId: "friends-roof-arrival",
    keyframe: "generated/keyframes/friends-roof-arrival.png",
    prompt:
      "The four friends finish setting the woven mat with the paralytic down onto the flat roof surface, straightening up and catching their breath from the climb, chests rising and falling. No digging has begun. No camera movement, continue the same settling motion already in progress. No speech."
  },
  {
    shotId: "friends-roof-digging",
    keyframe: "generated/keyframes/friends-roof-digging.png",
    prompt:
      "Friend 1 and Friend 4 continue tearing at the roof opening, pulling up more broken mud and reed thatch with focused, determined effort. Dust and loose straw kick up into the sunlight with each motion. No camera movement, continue the same digging motion already in progress. No speech."
  },
  {
    shotId: "paralytic-face-before-healing",
    keyframe: "generated/keyframes/paralytic-face-before-healing.png",
    prompt:
      "The paralytic lies still, looking straight up, eyes glistening. A single tear slowly rolls down his cheek. His chest rises in a slow, shaky breath, lips trembling slightly, on the verge of tears but holding himself together. No camera movement, continue the same quiet moment already in progress. No speech."
  },
  {
    shotId: "paralytic-astonishment",
    keyframe: "generated/keyframes/paralytic-astonishment.png",
    prompt:
      "The paralytic stands frozen in disbelief, chest rising with a sharp astonished breath, eyes wide, mouth slightly open. He flexes his fingers and shifts his weight slightly, testing his healed legs, still stunned. No camera movement, continue the same standing moment already in progress. No speech."
  },
  {
    shotId: "paralytic-gratitude",
    keyframe: "generated/keyframes/paralytic-gratitude.png",
    prompt:
      "The paralytic tilts his head further back, looking upward with growing gratitude. He draws one slow, deep breath in, chest expanding, shoulders dropping in visible relief, and a genuine smile spreads across his face. No camera movement, continue the same upward gaze already in progress. No speech."
  },
  {
    shotId: "friends-happy-glance",
    keyframe: "generated/keyframes/friends-happy-glance.png",
    prompt:
      "The four friends, framing the torn roof opening from above, break into wide delighted grins, glancing quickly at each other in shared joy and relief before looking back down through the opening. No camera movement, continue the same reacting motion already in progress. No speech."
  },
  {
    shotId: "scribe-unhappy-amid-celebration",
    keyframe: "generated/keyframes/scribe-unhappy-amid-celebration.png",
    prompt:
      "The crowd continues celebrating -- clapping, cheering, a couple of people swaying/dancing in place with joy. The Principal Scribe remains seated alone against the wall, arms crossed, motionless except for a slow, disapproving shake of his head and a tightening of his jaw as he watches the celebration. No camera movement, continue the same contrasting moment already in progress. No speech."
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
    { resolution: "720p", startFrame: { path: job.keyframe }, durationSeconds: DEFAULT_DURATION_SEC }
  );
  console.log(`${job.shotId}: tier=${result.tier} veoAttempts=${result.veoAttempts} media=${result.media?.path}`);
  return result;
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  const executing: Promise<unknown>[] = [];
  for (const item of items) {
    const p = fn(item).then((r) => {
      executing.splice(executing.indexOf(p), 1);
      return r;
    });
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

async function run() {
  const only = process.argv.slice(2);
  const toRun = only.length > 0 ? jobs.filter((j) => only.includes(j.shotId)) : jobs;
  await runWithConcurrency(toRun, VEO_BATCH_CONCURRENCY, runOne);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
