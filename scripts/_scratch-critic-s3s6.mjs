import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";
const db = getDb();
const shot = db.prepare("SELECT action, verse_ref, continuity_notes, crowd_density FROM shots WHERE id = ?").get("8209a47b-eaa0-4dcd-9a43-e3a9afd2e369");
const frames = [
  ["Beat 1 — wineskin master", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/8209a47b-eaa0-4dcd-9a43-e3a9afd2e369/431bc24b-6be0-4008-b7e9-5faf1bc2d5ea-bf1306c8-9914-4070-8581-51a0eb65a54e.png"],
  ["Beat 3 — old-wineskin listener", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/8209a47b-eaa0-4dcd-9a43-e3a9afd2e369/131431ee-b918-46d5-a6eb-2807d0f1775a-9b7d10d3-3eec-4c38-b5fb-345a6cf8c5af.png"],
  ["Beat 4 — Jesus lip-sync insert", "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/8209a47b-eaa0-4dcd-9a43-e3a9afd2e369/db810db8-2ac0-4272-a507-2774a10c9bf2-2b178dcc-3c5b-4bd1-8947-ca6c8ddd8561.png"],
];
const results = await Promise.all(frames.map(async ([name, path]) => ({ name, ...(await runCritic(shot.action, shot.verse_ref, shot.continuity_notes, shot.crowd_density, path)) })));
console.log(JSON.stringify(results, null, 2));