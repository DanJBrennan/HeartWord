import "dotenv/config";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { GeminiImageProvider } from "../src/providers/gemini/index.js";

const db = getDb();
const dataDir = getDataDir();
const shotId = "f6386c84-b0b0-404d-b080-faa644443f72";

const characters = db.prepare(`
  SELECT c.id AS character_id, cv.id AS character_version_id, c.name
  FROM shot_characters sc
  JOIN characters c ON c.id = sc.character_id
  JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
  WHERE sc.shot_id = ?
`).all(shotId) as any[];

const provider = new GeminiImageProvider();

// Usage: npx tsx scripts/_scratch-iterate-shot11.ts <path-to-prompt-file> <outName>
// (reading from a file avoids Windows/git-bash argv mangling on long multi-line prompts)
const promptFile = process.argv[2];
const prompt = readFileSync(promptFile, "utf8");
const outName = process.argv[3] || "iter";

const result = await provider.generate(
  { shotId: `_scratch-${outName}`, prompt, characters: characters.map(c => ({ characterId: c.character_id, characterVersionId: c.character_version_id })) },
  { tier: "standard" }
);
console.log("Saved to:", result.media?.path, "-- full path:", path.join(dataDir, "assets", result.media?.path ?? ""));
