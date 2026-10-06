import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { recordSourceAlignmentSpeakerAttribution } from "../src/pipeline/ingestion/source-alignment-speaker-attributions.js";
import { bindShotUtterance } from "../src/pipeline/voice-lipsync/utterance-binding.js";
import { materializeEditorialBeats } from "../src/pipeline/assembly/editorial-beats.js";
import { recordRestartCutover } from "../src/pipeline/media-generation/restart-cutover.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const shotId="7af4222c-ae6e-4577-abe7-65f904cbdb67"; // Mark 4:3 first Jesus close-up
const sourceSegmentId="74dc9b1b-9005-4f17-82d2-3fac41482a6e";
const jesusId="b78bed54-1d53-4b9f-9070-549dddb71b19";
const jesusVersionId="4e23012c-a74d-4e63-b4ae-a63d6847a02a";
const db=getDb(), approvedBy="Dan Brennan, Mark 4 restart approval";

db.exec("BEGIN IMMEDIATE");
try {
  const cutover=recordRestartCutover(db,{projectId,approvedBy,reason:"Producer-directed Mark 4 restart: prior final clips remain immutable evidence and cost history, not approved restart-pilot footage."});
  const existingBinding=db.prepare("SELECT id FROM shot_utterance_bindings WHERE shot_id=?").get(shotId);
  if (!existingBinding) {
    recordSourceAlignmentSpeakerAttribution(db,{projectId,audioSegmentId:sourceSegmentId,characterId:jesusId,verseRef:"Mark 4:3",reviewerName:"Dan Brennan",evidence:"Producer confirmed that the complete retained Mark 4:3 interval is Jesus speaking."});
    db.prepare("UPDATE shots SET needs_lip_sync=1, dialogue_character_id=? WHERE id=?").run(jesusId,shotId);
    bindShotUtterance(db,{projectId,shotId,sourceSegmentId,startMs:35288,endMs:41257,characterVersionId:jesusVersionId,approvedBy});
  }
  const editorial=materializeEditorialBeats(db,{projectId,approvedBy});
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (lower(hex(randomblob(16))),?,'project',?,'human',?,1,?)")
    .run(projectId,projectId,"Producer approved Mark 4 pre-source opening and post-source ending material; materialized as editorial beats. Mark 4:3 is bound to Jesus for the source-timed pilot.",Date.now());
  db.exec("COMMIT");
  console.log(JSON.stringify({ok:true,cutover,editorial},null,2));
} catch(error) { db.exec("ROLLBACK"); throw error; }
