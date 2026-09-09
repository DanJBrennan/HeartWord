/**
 * Assembles the whole chapter's video: concatenates every shot's own
 * already-assembled clip in scene/shot order. See
 * src/pipeline/assembly/assemble-chapter.ts for the real v1 scope
 * (hard cuts only -- no spaced_production editorial gaps yet).
 *
 * Run: npx tsx scripts/assemble-chapter.ts <project-id>
 */
import "dotenv/config";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { assembleChapter } from "../src/pipeline/assembly/assemble-chapter.js";

const projectId = process.argv[2];
if (!projectId) throw new Error("Usage: assemble-chapter.ts <project-id>");

const db = getDb();
const result = assembleChapter(db, projectId);
console.log(JSON.stringify(result, null, 2));
console.log("\nFull path:", join(getDataDir(), "assets", result.assembledVideoPath));
