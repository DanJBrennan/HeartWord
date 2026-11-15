/**
 * New insert (Dan's review note, 2026-09-10): "The lowering of the
 * paralytic clip is too soon" -- more roof-opening material is needed
 * before Shot 4 (lowering) so it doesn't feel rushed. Plays after
 * friends-watching-from-roof-aperture (the first peek down through the
 * finished opening) and before Shot 4: the friends widen the opening
 * further and ready the ropes/mat at the edge, immediately before
 * lowering him through.
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
  id: "friends-ready-ropes-at-opening",
  characters: [FRIEND1, FRIEND2, FRIEND3, FRIEND4, PARALYTIC],
  prompt: `${CASTING_ANCHOR}

Shot: wide, static camera, elevated rooftop angle, looking down at the now-finished square opening torn through the flat mud-and-reed roof, loose thatch and dust still settling at its torn edges.
Action: The four friends (Friend 1 older/rust, Friend 2 tall/olive, Friend 3 broad bald/slate-blue, Friend 4 young/brown headwrap) kneel around the finished opening, threading and knotting rope around the corners of the woven mat where the paralytic lies, double-checking the knots, exchanging a determined glance with each other -- the moment of final preparation immediately before lowering him through. The paralytic looks up at them with quiet trust.
Population/crowd: none, just the five of them on the rooftop.
Characters visible: Friend 1, Friend 2, Friend 3, Friend 4, Healed paralytic (each exactly once, matching their reference images), readying the ropes at the opening's edge.`
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
