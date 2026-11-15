/**
 * Assembles one single_clip shot's raw generated video into its final
 * form (trimmed, normalized, real dialogue audio muxed in if the shot
 * needs lip-sync). See src/pipeline/assembly/assemble-single-shot.ts.
 *
 * Run: npx tsx scripts/assemble-single-shot.ts <shot-id>
 */
import "dotenv/config";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const shotId = process.argv[2];
if (!shotId) throw new Error("Usage: assemble-single-shot.ts <shot-id>");

const db = getDb();
const result = assembleSingleShot(db, shotId);
console.log(JSON.stringify(result, null, 2));
console.log("\nFull path:", join(getDataDir(), "assets", result.assembledVideoPath));
