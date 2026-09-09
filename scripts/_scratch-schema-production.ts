import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb();
console.log(JSON.stringify({clips:db.prepare(`PRAGMA table_info(clips)`).all(), audio:db.prepare(`PRAGMA table_info(audio_segments)`).all()},null,2));
