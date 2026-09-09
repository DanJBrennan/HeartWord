import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { GeminiDraftVideoProvider, GeminiImageEditor } from "../src/providers/gemini/index.js";

const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558"; // Mark 2:8-9, Scene 1 Shot 7
const characters = db.prepare(`
  SELECT c.id AS character_id, cv.id AS character_version_id
  FROM shot_characters sc
  JOIN characters c ON c.id = sc.character_id
  JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
  WHERE sc.shot_id = ?
`).all(shotId) as any[];

const provider = new GeminiDraftVideoProvider();
const result = await provider.generateDraft({
  shotId: `_scratch-e2e-${shotId}`,
  prompt: "Jesus turns toward the paralytic and speaks with calm authority, a slight forward lean.",
  characters: characters.map((c) => ({ characterId: c.character_id, characterVersionId: c.character_version_id }))
});
console.log("generateDraft result:", JSON.stringify(result, null, 2));
