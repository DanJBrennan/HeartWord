import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "../src/db/client.js";
import { runCanonGarmentCritic } from "../src/pipeline/qc/canon-critic.js";

const dataDir = getDataDir();
const CANDIDATES_DIR = path.join(dataDir, "assets", "characters", "candidates", "remaining-canon-garment-fix");

const TARGETS = [
  { slug: "crowd-elder-grey-beard", name: "Crowd witness (elder, grey beard)" },
  { slug: "crowd-man-headwrap", name: "Crowd witness (man, headwrap)" },
  { slug: "crowd-older-woman-cream", name: "Crowd witness (older woman, cream headscarf)" },
  { slug: "crowd-older-woman-rust", name: "Crowd witness (older woman, rust headscarf)" },
  { slug: "crowd-stern-man", name: "Crowd witness (stern man, spokesperson)" },
  { slug: "crowd-woman-with-child", name: "Crowd witness (woman with child)" },
  { slug: "crowd-young-man", name: "Crowd witness (young man)" },
  { slug: "crowd-young-woman", name: "Crowd witness (young woman)" },
  { slug: "paralytic", name: "Healed paralytic" },
  { slug: "principal-scribe", name: "Principal scribe" },
  { slug: "scribe-middleaged-tablet", name: "Scribe (middle-aged, tablet-bearer)" },
  { slug: "scribe-older-stout", name: "Scribe (older, stout)" },
  { slug: "scribe-younger-lean", name: "Scribe (younger, lean)" }
];

async function main() {
  for (const t of TARGETS) {
    const imgPath = path.join(CANDIDATES_DIR, `${t.slug}-fix.png`);
    const image = { mimeType: "image/png", data: readFileSync(imgPath).toString("base64") };
    console.log(`\n=========== ${t.name} ===========`);
    try {
      const result = await runCanonGarmentCritic(t.name, [image]);
      console.log(`SEVERITY: ${result.severity}`);
      console.log(result.findings);
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
