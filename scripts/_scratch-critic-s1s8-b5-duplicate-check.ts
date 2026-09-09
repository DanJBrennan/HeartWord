import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { runCritic } from "../src/pipeline/qc/critic.js";
const db=getDb();
const row=db.prepare(`SELECT cb.sequence, cb.beat_type, cb.notes, cb.keyframe_asset_path, s.action, s.verse_ref, s.continuity_notes, s.crowd_density FROM coverage_beats cb JOIN shots s ON s.id=cb.shot_id WHERE cb.id=?`).get("6a2de512-d440-4e91-8104-174afe1e3153") as any;
const report=await runCritic(row.action,row.verse_ref,row.continuity_notes,row.crowd_density,"C:/Users/danbr/HeartWordData/assets/"+row.keyframe_asset_path,undefined,{sequence:row.sequence,type:row.beat_type,notes:row.notes});
console.log(JSON.stringify(report,null,2));
