import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
db.prepare(`UPDATE generation_attempts SET result_asset_path = ? WHERE id = ?`)
  .run("generated/video/kling-926681231671697478.mp4", "03f6b4ee-b699-40d2-ac83-3f6a3070e252");
const row = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE id = ?`).get("03f6b4ee-b699-40d2-ac83-3f6a3070e252") as any;
console.log(JSON.stringify(row.result_asset_path));
