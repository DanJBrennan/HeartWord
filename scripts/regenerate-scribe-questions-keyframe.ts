/**
 * Reshoot of Scene 1 Shot 6 (Mark 2:6-7, "scribe questions in heart",
 * shot id fe9886dc-0510-4cdb-afdc-ed9c22d14084) -- Dan's review note,
 * 2026-09-10: the original take is a wide group shot of several scribes
 * with no Jesus and no clear focal point, which reads as ambiguous under
 * real narration ("I hear someone speaking but the lipsync does not show
 * anyone speaking... if it is our scribe, it should be a close-up, not a
 * group shot"). This is an ADDITIONAL ad-hoc take generated for the
 * Blender/ffmpeg editing pass -- it replaces that shot only in the two
 * timeline scripts, not the DB-tracked shots.fe9886dc record.
 */
import "dotenv/config";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const CASTING_ANCHOR =
  "Photorealistic still frame from a Scripture video production (true photographic realism, not stylized/cartoon/3D). " +
  "CASTING: every person's face, skin tone, and build reads as Hatam/Papuan (Melanesian Arfak highland) -- match the " +
  "attached reference images exactly for any named character. SETTING: first-century Judea/Galilee -- buildings from " +
  "rough dark basalt fieldstone with flat timber/reed/mud roofs, simple first-century tunics, leather sandals. No " +
  "Melanesian/Pacific Islander tribal dress, no modern objects, no text or labels anywhere in the image.";

const PRINCIPAL_SCRIBE = { characterId: "3a50ba1f-955f-47ef-80ab-deeec15de742", characterVersionId: "936c2031-3abd-4240-a90a-b7f8b3d56915" };

const shot = {
  id: "scribe-questions-in-heart-closeup",
  characters: [PRINCIPAL_SCRIBE],
  prompt: `${CASTING_ANCHOR}

Shot: tight close-up on the Principal Scribe's face, static camera, eye level, shallow depth of field -- his face fills most of the frame, other scribes and the crowd reduced to a soft out-of-focus blur behind him.
Roof/ceiling: a FLAT mud-and-reed roof low overhead, matching the rest of this interior scene -- not visible in this tight a frame except perhaps a soft blur at the very top edge.
Action: The Principal Scribe sits still, listening, his brow furrowed in private suspicion and disapproval -- lips pressed together, NOT moving, NOT speaking aloud (he is questioning Jesus silently in his own heart, per the text). His eyes narrow slightly, calculating, offended by what he has just heard, but he says nothing out loud and makes no gesture toward speaking.
Population/crowd: other scribes and onlookers blurred in the background only, not the focus.
Characters visible: Principal Scribe (matching his reference image), in tight close-up, mouth closed and still.`
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
