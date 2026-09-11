/**
 * New insert (Dan's review note, 2026-09-10): a gradually growing crowd
 * near the doorway -- some people entering, others still arriving -- to
 * play BEFORE the existing Shot 1 (crowd already fully packed, doorway
 * entirely blocked). Shot 1 makes narrative sense as the payoff after
 * this build-up, per Dan: "There should be a gradual growing crowd with
 * some entering and others crowding the doorway. Then this crowd shot
 * makes sense after that."
 */
import "dotenv/config";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const CASTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism, not stylized/cartoon/3D). " +
  "CASTING: every person's face, skin tone, and build reads as Hatam/Papuan (Melanesian Arfak highland) -- match the " +
  "attached reference images exactly for any named character. SETTING: first-century Judea/Galilee -- buildings from " +
  "rough dark basalt fieldstone with flat timber/reed/mud roofs, simple first-century tunics, leather sandals. No " +
  "Melanesian/Pacific Islander tribal dress, no modern objects, no text or labels anywhere in the image.";

const shot = {
  id: "crowd-gathers-at-doorway",
  characters: [],
  prompt: `${CASTING_ANCHOR}

Shot: medium-wide, static camera, eye level, exterior of the same stone house from Mark 2:1-2, doorway visible.
Action: A crowd is in the process of gathering -- noticeably smaller and looser than a fully packed crowd, with clear gaps between clusters of people. Several individuals and small groups are visibly walking INTO frame from both sides, converging toward the doorway, curious, craning their necks to see inside. A few have already reached the doorway and are pressing close, but there is still visible open ground around them -- this is the doorway partway through filling up, not yet fully blocked. Ordinary villagers of all ages, empty-handed, arriving on foot only. Do NOT show anyone carrying a mat, stretcher, bundle on a pole, or any other person being carried -- no one in this crowd is sick or being transported; that is a different, later moment. Everyone here is walking normally under their own power.
Population/crowd: a growing but not-yet-packed crowd, with clear arrivals still entering from the edges of frame, all on foot, none carrying anything large.
Characters visible: ordinary background villagers only, no named characters.`
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
