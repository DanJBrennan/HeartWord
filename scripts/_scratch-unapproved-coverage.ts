import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb();
console.log(JSON.stringify(db.prepare(`SELECT cb.id, cb.sequence, cb.beat_type, cb.keyframe_asset_path, s.action, s.verse_ref FROM coverage_beats cb JOIN shots s ON s.id=cb.shot_id WHERE cb.id=?`).get("6a2de512-d440-4e91-8104-174afe1e3153"),null,2));
