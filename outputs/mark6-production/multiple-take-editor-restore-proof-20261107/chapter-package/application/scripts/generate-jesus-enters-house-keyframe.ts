/**
 * New establishing insert for the Blender healing-sequence edit (Dan's
 * direction, 2026-09-10): Jesus walks the streets of Capernaum with a
 * few disciples and enters the house where he will soon preach, before
 * any crowd has gathered. This plays under the real Hatam narration's
 * chapter-title announcement ("Markus 2 / Yesus bindei ba..."), which is
 * followed by a genuine ~1.6s recorded pause before verse narration
 * resumes -- see docs/design/timeline.md and
 * scripts/extract-healing-sequence.ts for how this insert is placed.
 *
 * Same street/geography as the existing pilot-intro-2 establishing shot
 * (generated/pilot-source/shot-000b-people-in.mp4) for visual continuity.
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
const PETER = { characterId: "9cbc4222-b194-4db4-baa9-2ba7083e31f3", characterVersionId: "b7a65f2e-b1cc-494d-97b8-6c132e09a497" };
const ANDREW = { characterId: "600e366f-8323-459d-b300-292f4e63ac41", characterVersionId: "8c1be0de-b4dc-4fac-ae75-a872843776bd" };
const JOHN = { characterId: "3179d3c7-201d-4365-9a41-0e7ef0c49257", characterVersionId: "51d1e3f1-d343-454e-b5cb-a480f311e3c7" };

const shot = {
  id: "jesus-and-disciples-enter-house",
  characters: [JESUS, PETER, ANDREW, JOHN],
  prompt: `${CASTING_ANCHOR}

Shot: medium-wide, static camera, eye level, tracking-style composition following the group from behind and slightly to the side, on a narrow dirt street between stone courtyard walls in Capernaum -- the SAME street and lighting as the village's early-morning establishing shot (fishing boats and lake visible in the distance behind them, warm low sun, smoke rising from cooking fires between houses).
Action: Jesus walks purposefully along the street with Peter, Andrew, and John following just behind him, mid-conversation, calm and unhurried. No crowd is present yet -- the street is otherwise quiet, just ordinary village life in the background (a woman carrying a water jug, a man mending a net). Jesus is approaching a modest stone house ahead with its door open, about to enter it. This is BEFORE any crowd gathers -- the doorway and courtyard are still completely empty.
Population/crowd: only ordinary background village life, no crowd at or near the house.
Characters visible: Jesus, Peter, Andrew, John (each exactly once, matching their reference images).`
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
