import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "../src/db/client.js";
import { runCanonGarmentCritic } from "../src/pipeline/qc/canon-critic.js";

const dataDir = getDataDir();
const OVERRIDE_TEXT =
  "This character's tunic and mantle are deliberately dyed solid black/charcoal as a storytelling/visual-" +
  "identity device (distinguishing scribes on screen), not a historical claim -- Dan explicitly reviewed the " +
  "off-white historically-accurate alternative and chose to keep black. Do not flag solid black dye as a " +
  "historical inaccuracy for this character.";

const image = { mimeType: "image/png", data: readFileSync(path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix", "scribe-younger-lean-fix-r5.png")).toString("base64") };
const result = await runCanonGarmentCritic("Scribe (younger, lean)", [image], [OVERRIDE_TEXT]);
console.log(`SEVERITY: ${result.severity}`);
console.log(result.findings);
