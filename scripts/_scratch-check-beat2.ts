import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const beat = db.prepare(`SELECT * FROM coverage_beats WHERE id = ?`).get("8d05821d-d696-4844-8d72-d7f4ea1a11a4");
console.log("beat:", JSON.stringify(beat));
const clips = db.prepare(`SELECT cl.*, ga.operation, ga.result_asset_path FROM clips cl JOIN generation_attempts ga ON ga.id=cl.generation_attempt_id WHERE cl.shot_id = ?`).all("0d43887a-8c20-4271-a6d8-3cafad177558");
console.log("remaining clips:", JSON.stringify(clips, null, 2));
