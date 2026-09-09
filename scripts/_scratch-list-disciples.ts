import "dotenv/config";
import { getDb, getDataDir } from "../src/db/client.js";
const db = getDb();
const rows = db.prepare(`
  SELECT c.name, cv.id as cv_id, ca.category, ca.path
  FROM characters c
  JOIN character_versions cv ON cv.character_id = c.id AND cv.status = 'approved'
  JOIN character_assets ca ON ca.character_version_id = cv.id AND ca.category = 'headshot'
  ORDER BY c.name
`).all();
console.log(JSON.stringify(rows, null, 2));
console.log("DATA DIR:", getDataDir());
