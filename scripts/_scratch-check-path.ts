import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
const row = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE id = '03f6b4ee-b699-40d2-ac83-3f6a3070e252'`).get() as any;
console.log(JSON.stringify(row.result_asset_path));
console.log([...row.result_asset_path].map((c:string)=>c.charCodeAt(0)));
