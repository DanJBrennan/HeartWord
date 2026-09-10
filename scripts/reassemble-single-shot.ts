import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

async function run() {
  const [shotId] = process.argv.slice(2);
  if (!shotId) {
    console.error("Usage: npx tsx scripts/reassemble-single-shot.ts <shotId>");
    process.exit(1);
  }
  const db = getDb();
  const result = assembleSingleShot(db, shotId);
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
