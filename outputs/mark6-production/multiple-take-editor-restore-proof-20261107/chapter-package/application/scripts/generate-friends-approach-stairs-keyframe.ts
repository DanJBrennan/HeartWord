/**
 * New insert (Dan's review note, 2026-09-10): "We need a clip where the
 * four friends are approaching the stairs." Bridges friends-carrying-to-
 * house (arrive, find the door blocked) and friends-roof-arrival (already
 * on the roof, settling in) -- currently the cut jumps straight from
 * street level to the rooftop with no beat of them actually reaching/
 * starting up the exterior stairway.
 */
import "dotenv/config";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const CASTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism, not stylized/cartoon/3D). " +
  "CASTING: every person's face, skin tone, and build reads as Hatam/Papuan (Melanesian Arfak highland) -- match the " +
  "attached reference images exactly for any named character. SETTING: first-century Judea/Galilee -- buildings from " +
  "rough dark basalt fieldstone with flat timber/reed/mud roofs, simple first-century tunics, leather sandals. No " +
  "Melanesian/Pacific Islander tribal dress, no modern objects, no text or labels anywhere in the image.";

const FRIEND1 = { characterId: "6e0c3941-3b08-4b46-9d96-4270bb036da1", characterVersionId: "afa9d28a-1151-428a-bb31-a409826f3094" };
const FRIEND2 = { characterId: "a53169d7-acdf-4d9f-9207-a161171819ae", characterVersionId: "4c6ed20a-147a-4db3-a4f7-878a0d7b256f" };
const FRIEND3 = { characterId: "7dedfedd-e572-4d57-84a3-7cf48d0a66f5", characterVersionId: "968ecf08-4445-41ba-b1d4-497554dd84bb" };
const FRIEND4 = { characterId: "0c423af6-e843-4819-adf0-30babdb9c061", characterVersionId: "fc4a6305-bf86-44cd-9868-eaea96733ea9" };
const PARALYTIC = { characterId: "9c28accf-e63f-4351-b16c-6da54c9dc1c6", characterVersionId: "99c7902c-a613-4e2f-9cc9-b0ea34165ad6" };

const shot = {
  id: "friends-approach-stairs",
  characters: [FRIEND1, FRIEND2, FRIEND3, FRIEND4, PARALYTIC],
  prompt: `${CASTING_ANCHOR}

Shot: medium-wide, static camera, low eye-level angle, exterior side alley of the stone house, an exterior stone stairway visible ahead built against the house's outer wall leading up to the flat roof.
Action: Having found the front doorway blocked, the four friends (Friend 1 older/rust, Friend 2 tall/olive, Friend 3 broad bald/slate-blue, Friend 4 young/brown headwrap) carry the paralytic on his woven mat around the side of the house toward the base of the exterior stone stairway, having just decided on this new plan -- their pace is purposeful, having just resolved to try the roof. Friend 1 in front is already reaching for the bottom step.
Population/crowd: a few onlookers visible at the far edge of frame near the front of the house, but this side alley is otherwise clear.
Characters visible: Friend 1, Friend 2, Friend 3, Friend 4, Healed paralytic (each exactly once, matching their reference images), approaching the stairway.`
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
