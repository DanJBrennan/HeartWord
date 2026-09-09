import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const n = db.prepare(`SELECT COUNT(*) as n FROM clips WHERE shot_id = ?`).get("0d43887a-8c20-4271-a6d8-3cafad177558") as any;
console.log("Existing clips for shot 7:", n.n);
