import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb();
const shot=db.prepare(`SELECT * FROM shots WHERE id=?`).get("96199814-0884-4a4a-bd95-b84950fce4fd");
const beats=db.prepare(`SELECT id, sequence, beat_type, notes, status, keyframe_asset_path FROM coverage_beats WHERE shot_id=? ORDER BY sequence`).all("96199814-0884-4a4a-bd95-b84950fce4fd");
console.log(JSON.stringify({shot,beats},null,2));
