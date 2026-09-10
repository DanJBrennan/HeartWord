/**
 * Three new supplementary shots for the four-friends/paralytic sequence,
 * built fresh with HeartWord's own canon references (per Dan's direction
 * to treat his pasted reference images as staging inspiration only, not
 * as source pixels to edit -- unlike Shot_004's recast, no real source
 * file was available for these). Each becomes an ADDITIONAL insert
 * (expands runtime, doesn't replace the existing Scene 1 Shots 3/4):
 *   A. Carrying to the house -- four friends carry the paralytic toward
 *      the crowded house, exasperated to find it blocked.
 *   B. Roof arrival -- the group arrives on the roof via the stairs and
 *      sets the mat down, before any digging begins.
 *   C. Roof-digging action -- close on Friend 1 (older, rust) and
 *      Friend 4 (young, brown/headwrap) tearing through roof material.
 *   D. Paralytic's face, just before the healing -- tight emotional
 *      close-up, lying on the mat looking up, on the verge of tears,
 *      moments before Jesus speaks/heals him.
 *   E. Paralytic's astonishment -- now standing, healed, staring in
 *      disbelief, moments after rising.
 *   F. Paralytic's gratitude -- a few seconds later, looking up to God
 *      and taking a deep breath.
 *   G. The four friends, still peering down through the roof opening,
 *      share a quick happy glance at each other after seeing the healing.
 *   H. The crowd celebrates/dances around the healed paralytic while
 *      HeartWord's own canon Principal Scribe sits apart, unhappy and
 *      disapproving of the healing.
 * D-H are all built fresh via HeartWord's own pipeline using the
 * paralytic's canon reference; Dan's pasted images (including one frame
 * of the published Mark 2 pilot video) are staging/expression reference
 * only, per his standing "build fresh from these as reference" direction.
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const db = getDb();

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
const PRINCIPAL_SCRIBE = { characterId: "3a50ba1f-955f-47ef-80ab-deeec15de742", characterVersionId: "936c2031-3abd-4240-a90a-b7f8b3d56915" };
const CROWD_WITNESSES = { characterId: "324a5375-2d40-4631-9962-8fd31622f1f8", characterVersionId: "0ed946d1-aae9-4aa5-96d6-29500e422ce6" };

const shots = [
  {
    id: "friends-carrying-to-house",
    characters: [FRIEND1, FRIEND2, FRIEND3, FRIEND4, PARALYTIC],
    prompt: `${CASTING_ANCHOR}

Shot: medium-wide, static camera, eye level.
Action: Four friends (Friend 1 older/rust, Friend 2 tall/olive, Friend 3 broad bald/slate-blue, Friend 4 young/brown headwrap) carry the paralytic on a woven mat toward a crowded stone house in Capernaum. They have just arrived and see the doorway and courtyard packed with people, blocking any way in. Their expressions show visible exasperation and frustration -- brows furrowed, shoulders tight -- at finding no path through. The paralytic looks up at them with quiet concern. A dense crowd fills the house's doorway and courtyard in the background, oblivious to the four friends.
Population/crowd: packed around the house entrance in the background.
Characters visible: Friend 1, Friend 2, Friend 3, Friend 4, Healed paralytic (each exactly once, matching their reference images).`
  },
  {
    id: "friends-roof-arrival",
    characters: [FRIEND1, FRIEND2, FRIEND3, FRIEND4, PARALYTIC],
    prompt: `${CASTING_ANCHOR}

Shot: wide, static camera, elevated rooftop angle.
Action: The four friends (Friend 1 older/rust, Friend 2 tall/olive, Friend 3 broad bald/slate-blue, Friend 4 young/brown headwrap) have just carried the paralytic up an exterior stone stairway onto the flat mud-and-reed roof of the house. They are setting the woven mat with the paralytic down onto the roof surface, catching their breath from the climb. No digging or roof damage has begun yet -- the roof surface is still completely intact. Other flat rooftops of Capernaum are visible in the background under warm daylight.
Population/crowd: empty rooftop except the five of them; the wider village is visible below/around.
Characters visible: Friend 1, Friend 2, Friend 3, Friend 4, Healed paralytic (each exactly once, matching their reference images).`
  },
  {
    id: "friends-roof-digging",
    characters: [FRIEND1, FRIEND4],
    prompt: `${CASTING_ANCHOR}

Shot: tight close-up, static camera, low angle looking across the roof surface.
Action: Friend 1 (older, rust robe, grey beard) and Friend 4 (young, brown robe, tan headwrap) kneel at the edge of a small opening they have started tearing into the roof, pulling up broken pieces of dried mud, reed thatch, and a cracked wood fragment. Dust and loose straw are caught mid-air in the warm sunlight. Their expressions are focused and determined, sweat visible. No other people are in this tight frame.
Population/crowd: empty except the two friends.
Characters visible: Friend 1, Friend 4 (each exactly once, matching their reference images).`
  },
  {
    id: "paralytic-face-before-healing",
    characters: [PARALYTIC],
    prompt: `${CASTING_ANCHOR}

Shot: extreme close-up on the paralytic's face, static camera, low angle looking straight down at him from almost directly overhead, as if we are looking down through the ceiling/roof opening toward the floor where he lies.
Action: The paralytic lies flat on his back on the woven mat, head toward camera, looking straight up. A single tear has just fallen down one cheek. His eyes are wide, glistening, full of desperate hope and quiet anguish -- lips slightly parted, on the verge of tears but holding himself together. This is the moment just before Jesus speaks to him and heals him; he does not yet know what is about to happen. Soft directional light from above (the roof opening) catches his face. Out-of-focus legs/robe hems of onlookers visible at the edges of the frame in a dim room beyond.
Population/crowd: blurred onlookers at the frame edges only, not the focus.
Characters visible: Healed paralytic (matching his reference image), still unhealed/suffering expression at this moment in the story.`
  },
  {
    id: "paralytic-astonishment",
    characters: [PARALYTIC],
    prompt: `${CASTING_ANCHOR}

Shot: medium close-up, static camera, straight-on eye level, slightly low angle looking up at him since he is now standing.
Action: The paralytic now stands fully upright, healed, having just risen from the mat moments ago. His mouth is slightly open in disbelief, eyes wide and staring straight ahead, chest rising with a sharp astonished breath -- the raw, stunned moment of realizing his body works again, before any joy or relief has fully registered. Sweat and dust still visible on his face and simple tunic. A blurred crowd of onlookers fills the background, out of focus, all reacting.
Population/crowd: dense but out-of-focus crowd filling the background.
Characters visible: Healed paralytic (matching his reference image), now standing and healed.`
  },
  {
    id: "paralytic-gratitude",
    characters: [PARALYTIC],
    prompt: `${CASTING_ANCHOR}

Shot: medium close-up, static camera, low angle looking up at his face and the sky/roof opening above him.
Action: A few seconds after standing up healed, the paralytic tilts his head back and looks upward with an expression of overwhelming gratitude -- eyes glistening, brows relaxed now instead of furrowed, the beginning of a genuine smile. He draws one slow, deep breath in, chest expanding, shoulders dropping in visible relief. Warm light falls across his upturned face from the roof opening above. The blurred crowd remains in the background, still reacting to the miracle.
Population/crowd: dense but out-of-focus crowd filling the background.
Characters visible: Healed paralytic (matching his reference image), now standing, healed, looking upward in gratitude.`
  },
  {
    id: "friends-happy-glance",
    characters: [FRIEND1, FRIEND2, FRIEND3, FRIEND4],
    prompt: `${CASTING_ANCHOR}

Shot: extreme wide, static camera, shot from directly below looking straight up through the torn roof opening at the sky, exactly the reverse angle of the paralytic's point of view looking up -- the four friends' faces ring the edges of the opening, framed by torn thatch, mud, and wood, with two ropes hanging down into frame. Warm bright sky/daylight fills the opening behind them.
Action: Having just watched the paralytic stand up healed below, the four friends (Friend 1 older/rust at upper-left, Friend 2 tall/olive at upper-right, Friend 3 broad bald/slate-blue at lower-center, Friend 4 young/brown headwrap at lower-left) all lean over the edge of the roof opening looking down, and share a quick, delighted glance with each other -- wide grins breaking out, eyes lit up with joy and relief, before looking back down. This is a brief, warm, happy beat right after the miracle.
Population/crowd: none, just the four friends framing the opening.
Characters visible: Friend 1, Friend 2, Friend 3, Friend 4 (each exactly once, matching their reference images), all smiling with joy.`
  },
  {
    id: "scribe-unhappy-amid-celebration",
    characters: [PRINCIPAL_SCRIBE, CROWD_WITNESSES],
    prompt: `${CASTING_ANCHOR}

Shot: medium-wide, static camera, eye level, inside the crowded room where the healing just took place.
Action: In the foreground and midground, a joyful crowd of onlookers claps, laughs, and dances in celebration around the newly-healed paralytic (who is not the focus of this shot and may be out of frame or only partially visible). Off to one side, seated alone on a low stone bench against the wall, the Principal Scribe sits apart from the celebration -- arms crossed or hands folded tightly in his lap, expression stern, jaw tight, eyes narrowed with disapproval and quiet indignation, completely unmoved by the joy around him. Dust hangs in shafts of light from a small window. The contrast between the crowd's motion/joy and the scribe's stillness/displeasure is the point of the shot.
Population/crowd: dense, celebrating, in motion, filling most of the frame.
Characters visible: Principal Scribe (matching his reference image, seated apart, disapproving), plus the recurring named crowd witnesses (matching their reference sheet) among the celebrating group.`
  }
];

async function run() {
  const provider = new GeminiImageProvider();
  const only = process.argv.slice(2);
  const toRun = only.length > 0 ? shots.filter((s) => only.includes(s.id)) : shots;
  for (const shot of toRun) {
    console.log(`Generating ${shot.id}...`);
    const result = await provider.generate({ shotId: shot.id, prompt: shot.prompt, characters: shot.characters }, { tier: "pro" });
    console.log(`  -> ${result.status}, ${result.media?.path}, $${result.cost.usd}`);
  }
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
