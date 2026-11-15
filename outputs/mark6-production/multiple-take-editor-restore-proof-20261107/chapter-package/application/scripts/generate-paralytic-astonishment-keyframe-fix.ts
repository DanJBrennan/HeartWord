/**
 * Reshoot of the "paralytic-astonishment" keyframe (Dan's review note,
 * 2026-09-10: "roof is now angled pitch"): the original keyframe
 * (generated/keyframes/paralytic-astonishment.png) rendered a peaked
 * gable/vaulted roof with a diagonal skylight, despite its own prompt
 * already saying "low timber roof beams... interior room" -- a real
 * generation drift, not a prompt gap. Every other interior shot in this
 * scene (Shot 5, 6, 7, 8, 9, paralytic-rises-from-mat) correctly shows a
 * FLAT mud-and-reed roof with a torn square opening, matching the
 * digging shots (Scene 1 Shot 3/4) -- this reshoot matches that.
 */
import "dotenv/config";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const CASTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism, not stylized/cartoon/3D). " +
  "CASTING: every person's face, skin tone, and build reads as Hatam/Papuan (Melanesian Arfak highland) -- match the " +
  "attached reference images exactly for any named character. SETTING: first-century Judea/Galilee -- buildings from " +
  "rough dark basalt fieldstone with flat timber/reed/mud roofs, simple first-century tunics, leather sandals. No " +
  "Melanesian/Pacific Islander tribal dress, no modern objects, no text or labels anywhere in the image.";

const PARALYTIC = { characterId: "9c28accf-e63f-4351-b16c-6da54c9dc1c6", characterVersionId: "99c7902c-a613-4e2f-9cc9-b0ea34165ad6" };

const shot = {
  id: "paralytic-astonishment-flatroof",
  characters: [PARALYTIC],
  prompt: `${CASTING_ANCHOR}

Shot: medium close-up, static camera, straight-on eye level, slightly low angle looking up at him since he is now standing. INTERIOR of the SAME packed house room as the rest of this scene, where the healing just took place.
Roof/ceiling (critical, match exactly): a FLAT mud-and-reed roof low overhead, built from straight horizontal timber beams laid close together with packed mud and reed thatch on top -- the SAME flat roof construction the four friends tore a square opening into from outside (this is that same room, seen from below). A single square/rectangular torn opening lets one shaft of daylight down into the room, with a few loose reed fragments still hanging at its torn edges. Do NOT render a peaked/gable/vaulted/angled roof, do NOT render a ridge beam or sloped rafters, do NOT render a diagonal skylight window -- the ceiling is flat and low, not a pitched roof.
Walls: rough dark basalt stone walls close behind the crowd on all sides.
Action: The paralytic now stands fully upright, healed, having just risen from the mat moments ago, still inside the crowded room. His mouth is slightly open in disbelief, eyes wide and staring straight ahead, chest rising with a sharp astonished breath -- the raw, stunned moment of realizing his body works again, before any joy or relief has fully registered. Sweat and dust still visible on his face and simple tunic. A blurred crowd of onlookers fills the background, out of focus, all reacting, packed close within the same room.
Population/crowd: dense but out-of-focus crowd filling the background, inside the room.
Characters visible: Healed paralytic (matching his reference image), now standing and healed, indoors, under the flat torn roof.`
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
