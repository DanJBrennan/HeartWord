import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";

const db = getDb();
const shot = db.prepare(`SELECT action, verse_ref, continuity_notes, crowd_density FROM shots WHERE id = ?`).get("cb1856ec-2e9f-4ba7-804c-a758da8c20d5");
if (!shot) throw new Error("Shot not found");
const inputs = [
  ["Beat 3 — doorway scribe reaction", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/cb1856ec-2e9f-4ba7-804c-a758da8c20d5/a60de7c6-8dc9-40ad-8db3-2e90871f9ecd-ec978b14-712f-42ac-b7cd-5843cba1af9c.png"],
  ["Beat 4 — Jesus lip-sync insert", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/cb1856ec-2e9f-4ba7-804c-a758da8c20d5/239b6c10-a2fa-4623-9532-5224eb7ebc43-b677de3e-d582-4db6-ad41-1b6354c6869f.png"],
  ["Beat 5 — meal-guest reaction", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/cb1856ec-2e9f-4ba7-804c-a758da8c20d5/182f33d4-5498-4443-8eab-95e7d03ef995-536820ae-ac1f-46ec-a7c0-08a330451c41.png"],
  ["Beat 6 — Jesus lip-sync insert", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/cb1856ec-2e9f-4ba7-804c-a758da8c20d5/47464ffa-6461-4618-9880-fdd0fb88e2ac-b2ab7110-04d4-43e7-932e-69f2f0ee3215.png"],
] as const;
const results = await Promise.all(inputs.map(async ([name, image]) => ({ name, ...(await runCritic(shot.action, shot.verse_ref, shot.continuity_notes, shot.crowd_density, image)) })));
console.log(JSON.stringify(results, null, 2));