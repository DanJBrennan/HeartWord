import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";
const dataRoot = "C:/Users/danbr/HeartWordData/assets/";
const db = getDb();
const getShot = (id: string) => db.prepare(`SELECT action, verse_ref, continuity_notes, crowd_density FROM shots WHERE id=?`).get(id) as any;
const s2 = getShot("94a721a3-1fc6-44d1-a9e2-9021e26ec408");
const s3 = getShot("cef5e711-3d67-4b5c-aff1-4315587c6e23");
const results = await Promise.all([
  runCritic(s2.action, s2.verse_ref, s2.continuity_notes, s2.crowd_density,
    dataRoot + "generated/keyframes/codex-coverage/94a721a3-1fc6-44d1-a9e2-9021e26ec408/3e585562-61b9-44f5-b3aa-928f70e1e720-8ace31a5-0bb3-41c3-8282-89c297c03245.png",
    { label: "Scene 4 Shot 2 Beat 3 cutaway", imagePath: dataRoot + "generated/keyframes/codex-coverage/94a721a3-1fc6-44d1-a9e2-9021e26ec408/b19b6263-f5eb-4b97-bf57-da2def608407-101a1924-0448-499f-837f-c52df5632214.png", description: "reaction cutaway during the scribe's continuing challenge; the scribe remains standing in the wheat field." }),
  runCritic(s3.action, s3.verse_ref, s3.continuity_notes, s3.crowd_density,
    dataRoot + "generated/keyframes/codex-coverage/cef5e711-3d67-4b5c-aff1-4315587c6e23/709638cd-c084-4376-aef2-0d51aba44f93-d0ac74f9-9493-45d7-ad13-59542319e5d9.png"),
  runCritic(s3.action, s3.verse_ref, s3.continuity_notes, s3.crowd_density,
    dataRoot + "generated/keyframes/codex-coverage/cef5e711-3d67-4b5c-aff1-4315587c6e23/adbb1ad9-0210-4275-8684-1570fbcd648e-47eb0020-feb0-4ac8-bfa5-853480cca6e3.png",
    { label: "Scene 4 Shot 3 Beat 1 master", imagePath: dataRoot + "generated/keyframes/codex-coverage/cef5e711-3d67-4b5c-aff1-4315587c6e23/709638cd-c084-4376-aef2-0d51aba44f93-d0ac74f9-9493-45d7-ad13-59542319e5d9.png", description: "Jesus speaks while standing opposite the principal scribe in the wheat field; Peter is behind Jesus holding wheat." })
]);
console.log(JSON.stringify([
  { beat: "Scene 4 Shot 2 Beat 4", ...results[0] },
  { beat: "Scene 4 Shot 3 Beat 1", ...results[1] },
  { beat: "Scene 4 Shot 3 Beat 3", ...results[2] }
], null, 2));
