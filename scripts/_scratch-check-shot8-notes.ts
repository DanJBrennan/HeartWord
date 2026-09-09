import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const row = db.prepare(`SELECT coverage_plan, coverage_notes FROM shots WHERE id = ?`).get("ea5e2ff9-c321-41f2-9c80-fd856c05d78d");
console.log(JSON.stringify(row, null, 2));
