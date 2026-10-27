/** Producer-delegated correction for one isolated Mark 4:13 silent listener take. */
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId="cb4aff40-0cf8-47b1-a8e7-13781d00654a";
const oldAttemptId="c96e00b4-f1d3-4ed2-8e63-f226f9e802a3";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const backup=join(root,"review","heartword.before-shot044-silent-motion-correction-20261027.sqlite");
const receiptPath=join(root,"review","meyah-mark4-shot044-silent-motion-correction-20261027.json");
if(!existsSync(backup)||existsSync(receiptPath))throw new Error("An isolated backup and unused receipt are required.");
const [{getDb},{readLanguageEditionPlan},{requireCurrentPlan,directionsFromRun}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition.js"),import("../src/pipeline/creative-direction/crew-store.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved source-clock map changed.");
const run=requireCurrentPlan(db,root,projectId),oldDirection=directionsFromRun(run,shotId);
if(!oldDirection.includes("Peter and John absorbing the sower explanation"))throw new Error("The retained crew direction changed; reconsider this correction.");
const shot=db.prepare("SELECT sh.action,sh.verse_ref,sh.needs_lip_sync,sc.project_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?").get(shotId) as {action:string;verse_ref:string;needs_lip_sync:number;project_id:string}|undefined;
if(shot?.project_id!==projectId||shot.verse_ref!=="Mark 4:13"||shot.needs_lip_sync!==0||!shot.action.includes("Peter and John listen"))throw new Error("Reviewed silent action changed.");
const old=db.prepare("SELECT status,result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'").get(oldAttemptId,shotId) as {status:string;result_asset_path:string}|undefined;
if(old?.status!=="hold_for_review"||!old.result_asset_path||db.prepare("SELECT id FROM clips WHERE shot_id=?").get(shotId))throw new Error("First take is no longer held, or a picture is already selected.");
const direction="Preserve the exact three-person lakeside composition and approved clothes. The central teacher remains back-to-camera and gestures softly as he begins explaining the sower. John and Peter listen in silence, with closed lips throughout. John may shift his eyes toward the teacher but must not move his lips or make a speaking gesture. Peter makes only a slight attentive head movement. No other motion, no cut, no new person or object.";
const reason="The first local take made John visibly speak from 0.75 to 2.25 seconds during a silent listening beat; its native audio also hallucinated human speech and was separately held. This retry keeps the approved scene, source timing, cast and keyframe while disabling model-generated audio and correcting only the motion. HeartWord supplies the actual Meyah narration in assembly.";
const noteId=randomUUID(),commandId=randomUUID(),now=Date.now();
const note=`Approved local LTX motion correction: ${direction}\naudioMode=none\nReason: ${reason}`;
const receipt={kind:"isolated_meyah_mark4_shot044_silent_motion_correction",projectId,shotId,oldAttemptId,oldDirection,direction,audioMode:"none",reason,reviewNoteId:noteId,planHash,crewRunId:run.id,backup:relative(root,backup).replaceAll("\\","/"),providerCalled:false,liveDatabaseOpened:false};
db.exec("BEGIN IMMEDIATE");
try{
  const changed=db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=? AND shot_id=? AND status='hold_for_review'").run(oldAttemptId,shotId);
  if(Number(changed.changes)!==1)throw new Error("First take changed before correction.");
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'shot',?,'qc',?,1,?)").run(noteId,projectId,shotId,note,now);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,'review_local_motion_correction',?,?,?)")
    .run(commandId,projectId,sequence,JSON.stringify(receipt),`meyah-mark4-shot044-local-motion:${noteId}`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({reviewNoteId:noteId,direction,receiptPath,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
