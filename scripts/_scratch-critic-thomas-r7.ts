import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "../src/db/client.js";
import { runCanonGarmentCritic } from "../src/pipeline/qc/canon-critic.js";

const dataDir = getDataDir();
const image = { mimeType: "image/png", data: readFileSync(path.join(dataDir, "assets", "characters", "candidates", "jesus-twelve-garment-fix", "thomas-garment-fix-r7.png")).toString("base64") };
const result = await runCanonGarmentCritic("Thomas", [image]);
console.log(`SEVERITY: ${result.severity}`);
console.log(result.findings);
