import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";
const db = getDb();
const shot = db.prepare("SELECT action, verse_ref, continuity_notes, crowd_density FROM shots WHERE id = ?").get("44009342-73b8-4b8a-ad46-085d64253258");
const frames = [
  ["Beat 5 v2 — older listener", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/44009342-73b8-4b8a-ad46-085d64253258/db7aa0de-987a-4cb5-aaab-3758da616627-2fb69621-9731-416a-872e-c503a4a7735d.png"],
  ["Beat 7 v2 — father-and-son reaction", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/44009342-73b8-4b8a-ad46-085d64253258/cbb60d23-f194-4c43-ae44-10cdbddc4e4b-d8a6b206-ca7d-4e0d-8213-9292973b9113.png"],
];
const results = await Promise.all(frames.map(async ([name, path]) => ({ name, ...(await runCritic(shot.action, shot.verse_ref, shot.continuity_notes, shot.crowd_density, path)) })));
console.log(JSON.stringify(results, null, 2));