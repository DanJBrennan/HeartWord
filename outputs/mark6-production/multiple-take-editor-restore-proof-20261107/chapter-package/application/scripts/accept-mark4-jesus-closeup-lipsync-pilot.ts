import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { acceptLipSyncCandidate } from "../src/pipeline/voice-lipsync/candidate-selection.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId="7af4222c-ae6e-4577-abe7-65f904cbdb67";
const attemptId="25c1c513-6af5-413e-921b-dd5f20904f9a";
const db=getDb();
const selected=acceptLipSyncCandidate(db,projectId,attemptId);
db.prepare(`INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at)
  VALUES (?,?,'shot',?,'human',?,1,?)`).run(
    randomUUID(),projectId,shotId,
    "Dan Brennan producer approval: Mark 4:3 source-bound Jesus lip-sync candidate approved after visual review. Select only the exact approved 5.969-second source interval.",Date.now());
console.log(JSON.stringify({ok:true,selected},null,2));
