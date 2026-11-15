/**
 * New transitional insert (Dan's review note, 2026-09-10: "instant stand,
 * need a transition where he gets up"): bridges the cut from the
 * paralytic lying on the mat (end of Shot 8, command to rise) directly to
 * him already standing/astonished (paralytic-astonishment.mp4) -- there
 * was never a shot of the actual physical motion of rising. This plays
 * between Shot 8 and paralytic-astonishment in the timeline.
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
  id: "paralytic-rises-from-mat",
  characters: [PARALYTIC],
  prompt: `${CASTING_ANCHOR}

Shot: medium shot, static camera, low eye-level angle looking slightly up at him, INTERIOR of the crowded house room where the healing just took place -- rough dark basalt stone walls, low wood beam ceiling, a shaft of daylight falling from the torn roof opening above, dim ambient light, blurred crowd filling the background on all sides.
Action: The paralytic is caught mid-motion pushing himself up off the woven mat with both arms, torso lifted halfway, one knee bent underneath him as he rises -- NOT yet fully standing, NOT still lying down. His face shows strain mixed with disbelief as he feels his own legs and back working for the first time. The blanket/mat is still partially beneath him. This is the physical midpoint between lying down and standing up.
Population/crowd: dense but out-of-focus crowd filling the background, indoors, each reacting in their OWN distinct way rather than all together -- some with both hands clasped over their open mouths, some gaping with jaws dropped, some craning and shifting position to get a clearer view past others, some with one or both hands raised, some leaning toward a neighbor wide-eyed. No two nearby figures share the same pose or gesture.
Characters visible: Healed paralytic (matching his reference image), mid-rise from the mat, not yet upright.`
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
