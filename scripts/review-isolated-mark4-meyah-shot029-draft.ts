/** Normal visual QC for the exact recovered, silent private-group LTX draft. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not isolated");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId="632e9a87-93d3-49cc-a3a0-394e0f8ee121";
const attemptId="0a71d833-7655-4ad9-9b6c-44bfac6c73ae";
const [{getDb},{reviewGeneratedVideo,videoReviewPassed},{checkFilmSpend}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/qc/video-review.js"),
  import("../src/pipeline/voice-lipsync/performance-direction.js")]);
const db=getDb();
const attempt=db.prepare("SELECT id,status,result_asset_path,prompt FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_draft'")
  .get(attemptId,shotId) as {id:string;status:string;result_asset_path:string;prompt:string}|undefined;
if(!attempt||attempt.status!=="hold_for_review")throw Error("Recovered draft is not held for review");
const existing=db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND note LIKE ?")
  .get(projectId,shotId,`Draft ${attemptId} automated review:%`) as {id:string}|undefined;
if(existing)throw Error("This draft already has an automated review");
const keyframe=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shotId) as {result_asset_path:string}|undefined;
if(!keyframe)throw Error("Accepted keyframe missing");
checkFilmSpend(db,projectId,2);
const review=await reviewGeneratedVideo({videoPath:join(root,"assets",attempt.result_asset_path),
  keyframePath:join(root,"assets",keyframe.result_asset_path),instruction:attempt.prompt});
const passed=videoReviewPassed(review.verdict),now=Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES(?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,review.costUsd,now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?,'shot',?,'qc',?,0,?)`)
    .run(randomUUID(),projectId,shotId,
      `Draft ${attemptId} automated review: ${passed?"passed":"FAILED"} (confidence ${review.verdict.confidence}): ${review.verdict.reason}`,now);
  db.exec("COMMIT");
} catch(error) { db.exec("ROLLBACK"); throw error; }
const receipt={kind:"isolated_meyah_mark4_recovered_ltx_draft_qc",projectId,shotId,attemptId,
  passed,verdict:review.verdict,costUsd:review.costUsd,producerDecision:"pending",liveDatabaseOpened:false};
writeFileSync(join(root,"review","meyah-mark4-shot029-recovered-draft-qc-20261026.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt,null,2));
