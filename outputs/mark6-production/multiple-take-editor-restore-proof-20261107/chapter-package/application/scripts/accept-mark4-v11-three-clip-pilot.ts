/** Record Dan's approval of the bounded Mark 4:11 pilot reel. This marks
 * the review reel accepted, not a chapter clip, and retains every source
 * cut and alternate take as history. */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0",shotId="17246352-3c8d-498a-b99e-47c70ff89d2a";
const db=getDb();
const reel=db.prepare("SELECT id,status FROM generation_attempts WHERE shot_id=? AND operation='assemble_coverage_pilot' AND result_asset_path=? ORDER BY created_at DESC LIMIT 1").get(shotId,"generated/chapter/mark4-v11-three-clip-pilot-review.mp4") as {id:string;status:string}|undefined;
if(!reel || !["hold_for_review","accepted"].includes(reel.status)) throw Error("The exact Mark 4:11 review reel is unavailable for approval.");
const lipsyncs=db.prepare("SELECT COUNT(*) n FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND status='hold_for_review' AND prompt LIKE 'Mark 4:11 three-clip pilot segment %'").get(shotId) as {n:number};
if(lipsyncs.n!==2) throw Error(`Expected two held Mark 4:11 Jesus lip-sync clips, found ${lipsyncs.n}.`);
db.exec("BEGIN IMMEDIATE");try{
  db.prepare("UPDATE generation_attempts SET status='accepted' WHERE id=?").run(reel.id);
  const note="Dan Brennan approved the Mark 4:11 three-clip source-bound pilot review reel: opening master 0-3443 ms, first Jesus insert 3443-8416 ms, final Jesus insert 8416-11068 ms. This is a held pilot approval only; no chapter timeline clip was selected.";
  if(!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='human' AND note=?").get(projectId,shotId,note))db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,?,?, 'human', ?,1,?)").run(randomUUID(),projectId,"shot",shotId,note,Date.now());
  // Older Mark 4 material is retained on this parent shot. Only prove that
  // this new review-reel attempt has not been selected into that history.
  const timeline=db.prepare("SELECT COUNT(*) n FROM clips WHERE generation_attempt_id=?").get(reel.id) as {n:number};if(timeline.n!==0)throw Error("Pilot review reel must not select a chapter timeline clip.");
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({reelAttemptId:reel.id,accepted:true,timelineClips:0,cutsMs:[3443,8416]},null,2));
