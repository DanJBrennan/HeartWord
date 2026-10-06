import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId="7af4222c-ae6e-4577-abe7-65f904cbdb67";
const db=getDb();
db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
  VALUES (?,?,'shot',?,'human',?,1,?)`).run(
    randomUUID(),projectId,shotId,
    "Dan Brennan producer approval: Mark 4:3 source-bound Jesus close-up keyframe approved for the restart pilot's speaking coverage.",Date.now());
db.prepare("UPDATE shots SET status='keyframe_approved' WHERE id=?").run(shotId);
console.log(JSON.stringify({ok:true},null,2));
