import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb();
console.log(JSON.stringify(db.prepare(`SELECT status, COUNT(*) n FROM coverage_beats GROUP BY status ORDER BY status`).all(),null,2));
console.log(JSON.stringify(db.prepare(`SELECT cb.id, cb.sequence, cb.beat_type, cb.status, s.id shot_id FROM coverage_beats cb JOIN shots s ON s.id=cb.shot_id WHERE cb.status != 'accepted' ORDER BY s.sequence, cb.sequence`).all(),null,2));
