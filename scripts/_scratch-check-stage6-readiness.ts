import { getDb } from "../src/db/client.js";
const db = getDb();
const projectId = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const spaced = db.prepare(`SELECT COUNT(*) as n FROM audio_segments WHERE layer='spaced_production' AND project_id=?`).get(projectId);
console.log("spaced_production rows:", spaced);

const shots = db.prepare(`
  SELECT s.id, s.sequence, sc.sequence as scene_seq, s.verse_ref
  FROM shots s JOIN scenes sc ON sc.id = s.scene_id
  WHERE sc.project_id = ?
  ORDER BY sc.sequence, s.sequence
`).all(projectId);
console.log(`total shots: ${shots.length}`);
let missing = 0;
for (const s of shots as any[]) {
  const attempt = db.prepare(`SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' ORDER BY created_at DESC LIMIT 1`).get(s.id) as any;
  if (!attempt) {
    missing++;
    console.log(`MISSING assembled clip: Scene ${s.scene_seq} Shot ${s.sequence} (${s.verse_ref}) [${s.id}]`);
  }
}
console.log(`missing: ${missing}`);
