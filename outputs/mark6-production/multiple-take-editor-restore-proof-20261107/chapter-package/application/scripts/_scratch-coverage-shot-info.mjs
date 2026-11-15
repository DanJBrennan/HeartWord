import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db=getDb();
console.log(JSON.stringify(db.prepare("PRAGMA table_info(shots)").all(),null,2));
