import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb();
const shot=db.prepare(`SELECT s.* FROM shots s WHERE s.id=?`).get("cef5e711-3d67-4b5c-aff1-4315587c6e23");
const beats=db.prepare(`SELECT sequence, beat_type, notes, status, keyframe_asset_path FROM coverage_beats WHERE shot_id=? ORDER BY sequence`).all("cef5e711-3d67-4b5c-aff1-4315587c6e23");
console.log(JSON.stringify({shot,beats},null,2));


