import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const total = (db.prepare(`SELECT COUNT(*) as n FROM coverage_beats`).get() as any).n;
console.log("Total coverage_beats rows:", total);
const perShot = db.prepare(`SELECT shot_id, COUNT(*) as n FROM coverage_beats GROUP BY shot_id`).all();
console.log("Shots with beats:", perShot.length);
