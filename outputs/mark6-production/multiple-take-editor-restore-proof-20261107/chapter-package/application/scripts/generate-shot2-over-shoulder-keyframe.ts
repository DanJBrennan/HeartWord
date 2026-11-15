/**
 * Reshoot of Scene 1 Shot 2 ("Mark 2:2 -- Jesus preaches to the crowd",
 * shot id 8d9ac62b-9914-45d4-a124-d09546977e3f) for the Blender healing-
 * sequence edit (Dan's direction, 2026-09-10): the existing take is a
 * direct face-on shot with Jesus's lips clearly visible and moving, which
 * doesn't work now that this beat plays under the real Hatam narration
 * (not lip-synced dialogue) -- per the standing rule from earlier this
 * session, a narrated (non-lip-synced) beat should never show the
 * speaker's lips. This is an ADDITIONAL take generated as an ad-hoc
 * insert (like the other supplementary beats), not a DB-tracked
 * regeneration of the canon shots.8d9ac62b record -- it replaces that
 * shot only inside scripts/extract-healing-sequence.ts's Blender-editor
 * timeline, leaving the ffmpeg chapter-assembly pipeline's own tracked
 * clip untouched.
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
const PRINCIPAL_SCRIBE = { characterId: "3a50ba1f-955f-47ef-80ab-deeec15de742", characterVersionId: "936c2031-3abd-4240-a90a-b7f8b3d56915" };
const CROWD_WITNESSES = { characterId: "324a5375-2d40-4631-9962-8fd31622f1f8", characterVersionId: "0ed946d1-aae9-4aa5-96d6-29500e422ce6" };

const shot = {
  id: "shot2-jesus-preaches-over-shoulder",
  characters: [JESUS, PRINCIPAL_SCRIBE, CROWD_WITNESSES],
  prompt: `${CASTING_ANCHOR}

Shot: over-the-shoulder, static camera, positioned close behind and slightly to the side of Jesus's head and shoulder -- Jesus's face and mouth are NOT visible at all, only the back/side of his head, hair, shoulder, and upper back, out of focus in the extreme foreground edge of frame. The camera looks past him toward the seated crowd and scribes he is addressing, who ARE in clear focus.
Setting: the SAME house interior already established for this scene -- rough dark basalt stone walls, low wood beam ceiling, a striped woven textile hanging on the wall, a shelf with clay pots, a doorway to the exterior visible letting in daylight with onlookers crowding at it. People sit shoulder-to-shoulder on the floor listening intently, several scribes seated together to one side in darker robes, expressions ranging from rapt attention to quiet skepticism.
Action: Jesus (seen only from behind/the side, face hidden) gestures with one hand as he addresses the room. The listening crowd and scribes react -- leaning in, watching him closely.
Population/crowd: dense, seated, filling the room, matching the established crowded-house scene.
Characters visible (in focus): the seated crowd and Principal Scribe among the scribes, all clearly visible reacting to Jesus. Jesus is present but turned away from camera, face and mouth not visible.`
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
