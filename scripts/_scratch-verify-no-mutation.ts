import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const row = db.prepare(`SELECT status, keyframe_asset_path FROM coverage_beats WHERE id = ?`).get("a70da82f-890f-46fc-87ad-73ae6aa3a303");
console.log(row);
