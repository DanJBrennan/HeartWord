import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const shotId = "ea5e2ff9-c321-41f2-9c80-fd856c05d78d";
const beats = db.prepare(`SELECT id FROM coverage_beats WHERE shot_id = ?`).all(shotId) as any[];
for (const b of beats) {
  try {
    db.prepare(`DELETE FROM coverage_beats WHERE id = ?`).run(b.id);
    console.log(`Deleted ${b.id}`);
  } catch (err) {
    console.log(`FAILED on ${b.id}:`, (err as Error).message);
  }
}
