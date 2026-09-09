import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";
const beats = db.prepare(`SELECT * FROM coverage_beats WHERE shot_id = ? ORDER BY sequence`).all(shotId);
console.log(JSON.stringify(beats, null, 2));
