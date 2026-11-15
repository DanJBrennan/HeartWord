/**
 * Reshoot of crowd-witness-breathless-reaction (Dan's review note,
 * 2026-09-10: "clip at 1:xx has an arched roof") -- the original keyframe
 * itself (not just the video motion) rendered a peaked gable roof, same
 * class of defect as the paralytic-astonishment fix earlier this
 * session. Every other interior shot in this scene shows a FLAT
 * mud-and-reed roof with a torn square opening -- this reshoot matches
 * that, and matches Shot 2's established over-the-shoulder-on-Jesus
 * framing for this narrated beat.
 */
import "dotenv/config";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const CASTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism, not stylized/cartoon/3D). " +
  "CASTING: every person's face, skin tone, and build reads as Hatam/Papuan (Melanesian Arfak highland) -- match the " +
  "attached reference images exactly for any named character. SETTING: first-century Judea/Galilee -- buildings from " +
  "rough dark basalt fieldstone with flat timber/reed/mud roofs, simple first-century tunics, leather sandals. No " +
  "Melanesian/Pacific Islander tribal dress, no modern objects, no text or labels anywhere in the image.";

const JESUS = { characterId: "b78bed54-1d53-4b9f-9070-549dddb71b19", characterVersionId: "4de516fb-60a5-4200-a590-75876eda36ff" };
const CROWD_WITNESSES = { characterId: "324a5375-2d40-4631-9962-8fd31622f1f8", characterVersionId: "0ed946d1-aae9-4aa5-96d6-29500e422ce6" };

const shot = {
  id: "crowd-witness-breathless-reaction-flatroof",
  characters: [JESUS, CROWD_WITNESSES],
  prompt: `${CASTING_ANCHOR}

Shot: over-the-shoulder, static camera, positioned close behind and slightly to the side of Jesus's head and shoulder -- Jesus's face and mouth are NOT visible at all, only the back/side of his head, hair, shoulder, and upper back, out of focus in the extreme foreground edge of frame. The camera looks past him toward the crowd he has just spoken to, who ARE in clear focus, reacting with breathless amazement.
Roof/ceiling (critical, match exactly): a FLAT mud-and-reed roof low overhead, built from straight horizontal timber beams laid close together -- the SAME flat roof as every other interior shot in this scene, including the torn square opening visible off to one side where the friends lowered the paralytic. Do NOT render a peaked/gable/vaulted/angled roof, do NOT render a ridge beam or sloped rafters -- the ceiling is flat and low, not a pitched roof.
Walls: rough dark basalt stone walls close behind the crowd on all sides, a window letting in daylight.
Action: The crowd stares back at Jesus (whose back is to camera), stunned and breathless, mouths slightly open, eyes wide with amazement at what they just witnessed and heard.
Population/crowd: dense, filling the room, all reacting with awe.
Characters visible (in focus): the crowd witnesses, all clearly visible reacting. Jesus is present but turned away from camera, face and mouth not visible.`
};

async function run() {
  const provider = new GeminiImageProvider();
  const result = await provider.generate({ shotId: shot.id, prompt: shot.prompt, characters: shot.characters }, { tier: "pro" });
  console.log(`${shot.id} -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
