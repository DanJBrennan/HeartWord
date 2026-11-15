/**
 * Assembles one shot's already-generated clips into a single continuous,
 * reviewable video (trimmed to each beat's exact duration, normalized to
 * one resolution/framerate, muxed against the shot's real Hatam dialogue
 * audio). See src/pipeline/assembly/assemble-covered-shot.ts.
 *
 * Run: npx tsx scripts/assemble-shot.ts <shot-id>
 */
import "dotenv/config";
import { getDataDir, getDb } from "../src/db/client.js";
import { assembleCoveredSequenceShot } from "../src/pipeline/assembly/assemble-covered-shot.js";
import { join } from "node:path";

const shotId = process.argv[2];
if (!shotId) throw new Error("Usage: assemble-shot.ts <shot-id>");

const db = getDb();
const result = assembleCoveredSequenceShot(db, shotId);
console.log(JSON.stringify(result, null, 2));
console.log("\nFull path:", join(getDataDir(), "assets", result.assembledVideoPath));
