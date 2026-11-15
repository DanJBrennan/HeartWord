import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { acceptFinalVideoCandidate } from "../src/pipeline/media-generation/final-video.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId="b4f60ed5-c4f4-436f-bfac-fb0e8b357fdf";
const attemptId="6cc4410e-1ab9-4624-9df7-7ed9fa458268";
const db=getDb();
const selected=acceptFinalVideoCandidate(db,projectId,attemptId,8000);
db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
  VALUES (?,?,'shot',?,'human',?,1,?)`).run(
    randomUUID(),projectId,shotId,
    "Dan Brennan producer approval: Veo Standard Mark 4:1 boat-and-shore candidate approved after visual review. Producer confirms Papuan Jesus likeness and overall shot quality; automated composition-review hold is overridden for this pilot clip.",Date.now());
console.log(JSON.stringify({ok:true,selected},null,2));
