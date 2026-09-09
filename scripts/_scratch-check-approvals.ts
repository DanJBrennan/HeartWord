import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();

const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
console.log("TABLES:", tables.map((t) => t.name).join(", "));

const shotCols = db.prepare(`PRAGMA table_info(shots)`).all();
console.log("\nSHOTS COLUMNS:", JSON.stringify(shotCols.map((c: any) => c.name)));

const statusCounts = db.prepare(`
  SELECT status, COUNT(*) as n FROM shots GROUP BY status
`).all();
console.log("\nSHOT STATUS COUNTS:", JSON.stringify(statusCounts, null, 2));
