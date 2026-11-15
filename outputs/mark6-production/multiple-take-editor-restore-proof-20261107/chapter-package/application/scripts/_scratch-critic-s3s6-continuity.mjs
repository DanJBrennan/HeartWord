import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";
const db = getDb();
const shot = db.prepare("SELECT action, verse_ref, continuity_notes, crowd_density FROM shots WHERE id = ?").get("8209a47b-eaa0-4dcd-9a43-e3a9afd2e369");
const report = await runCritic(shot.action, shot.verse_ref, shot.continuity_notes, shot.crowd_density, "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/8209a47b-eaa0-4dcd-9a43-e3a9afd2e369/131431ee-b918-46d5-a6eb-2807d0f1775a-1c01ec4e-13ef-45c9-959c-bf2e06036019.png", { label: "Scene 3, Shot 6 Beat 1 master", imagePath: "C:/Users/danbr/HeartWordData/assets/generated/keyframes/codex-coverage/8209a47b-eaa0-4dcd-9a43-e3a9afd2e369/431bc24b-6be0-4008-b7e9-5faf1bc2d5ea-bf1306c8-9914-4070-8581-51a0eb65a54e.png", description: "Jesus is standing in the basalt courtyard, holding an intact fresh leather wineskin and addressing the moderate seated audience." });
console.log(JSON.stringify(report, null, 2));