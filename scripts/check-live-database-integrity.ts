import "dotenv/config";
import { getDb } from "../src/db/client.js";

const db=getDb();
const integrity=db.prepare("PRAGMA integrity_check").all();
const foreignKeys=db.prepare("PRAGMA foreign_key_check").all();
console.log(JSON.stringify({integrity,foreignKeys},null,2));
