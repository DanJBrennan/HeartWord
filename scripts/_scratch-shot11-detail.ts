import "dotenv/config";
import { getDataDir, getDb } from "../src/db/client.js";
import path from "node:path";
const db = getDb();
const dataDir = getDataDir();
const shot = db.prepare(`
  SELECT s.id, s.action, s.framing, s.camera_movement, s.crowd_density, s.continuity_notes, s.verse_ref,
         sc.lighting_continuity
  FROM shots s JOIN scenes sc ON sc.id = s.scene_id
  WHERE sc.project_id = 'fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d' AND sc.sequence = 1 AND s.sequence = 1
`).get() as any;
console.log(JSON.stringify(shot, null, 2));

const ga = db.prepare(`
  SELECT result_asset_path, status, prompt FROM generation_attempts WHERE shot_id = ? AND operation='generate' ORDER BY created_at DESC LIMIT 1
`).get(shot.id) as any;
console.log("Latest attempt status:", ga.status);
console.log("Image path:", path.join(dataDir, "assets", ga.result_asset_path));
console.log("\n--- PROMPT USED ---\n", ga.prompt);
