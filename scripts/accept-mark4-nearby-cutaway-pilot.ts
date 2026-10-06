import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { acceptFinalVideoCandidate } from "../src/pipeline/media-generation/final-video.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId="1172d540-c778-46af-8c7e-9dfa2cc565a1";
const attemptId="f88691c0-01c0-444d-9e9d-2c4930b10f72";
const db=getDb();
const selected=acceptFinalVideoCandidate(db,projectId,attemptId,8000);
db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
  VALUES (?,?,'shot',?,'human',?,1,?)`).run(
    randomUUID(),projectId,shotId,
    "Dan Brennan producer approval: nearby seeds-on-the-path motion candidate approved after visual review and selected into the restart pilot.",Date.now());
console.log(JSON.stringify({ok:true,selected},null,2));
