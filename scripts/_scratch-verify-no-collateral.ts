import "dotenv/config";
import { getDb } from "../src/db/client.js";
const db = getDb();
for (const shotId of ["44009342-73b8-4b8a-ad46-085d64253258", "8209a47b-eaa0-4dcd-9a43-e3a9afd2e369", "cef5e711-3d67-4b5c-aff1-4315587c6e23"]) {
  const beats = db.prepare(`SELECT COUNT(*) as n, SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) as accepted FROM coverage_beats WHERE shot_id = ?`).get(shotId);
  console.log(shotId, JSON.stringify(beats));
}
