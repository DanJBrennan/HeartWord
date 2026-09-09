import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "0d43887a-8c20-4271-a6d8-3cafad177558";
const chars = db.prepare(`
  SELECT c.id AS character_id, cv.id AS character_version_id
  FROM shot_characters sc JOIN characters c ON c.id = sc.character_id
  JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
  WHERE sc.shot_id = ?
`).all(shotId);
console.log(JSON.stringify(chars, null, 2));
