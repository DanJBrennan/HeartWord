/** Scoped producer-delegated correction for the isolated Meyah 4:26 LTX take.
 * Retains the first completed render and never opens the live data root. */
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024");
const rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId="23e06237-a507-4b8a-b941-75b5c37cbac3";
const oldAttemptId="2eb83ce9-5944-4e44-a330-878ed05fde8a";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const backup=join(root,"review","heartword.before-shot093-retained-sowing-selection-20261027.sqlite");
const receiptPath=join(root,"review","meyah-mark4-shot093-motion-correction-20261027.json");
if(!existsSync(backup)||existsSync(receiptPath))throw new Error("An isolated backup and unused receipt are required.");
const [{getDb},{readLanguageEditionPlan},{requireCurrentPlan,directionsFromRun}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition.js"),import("../src/pipeline/creative-direction/crew-store.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved source-clock map changed.");
const run=requireCurrentPlan(db,root,projectId);
const oldDirection=directionsFromRun(run,shotId);
if(!oldDirection.includes("seeds settling"))throw new Error("The conflicting old motion direction changed; reconsider this correction.");
const shot=db.prepare("SELECT sh.action,sh.verse_ref,sh.needs_lip_sync,sc.project_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?").get(shotId) as {action:string;verse_ref:string;needs_lip_sync:number;project_id:string}|undefined;
if(shot?.project_id!==projectId||shot.verse_ref!=="Mark 4:26"||shot.needs_lip_sync!==0||!shot.action.includes("farmer continues scattering seed"))throw new Error("Reviewed story action changed.");
const old=db.prepare("SELECT status,result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'").get(oldAttemptId,shotId) as {status:string;result_asset_path:string}|undefined;
if(old?.status!=="hold_for_review"||!old.result_asset_path||db.prepare("SELECT id FROM clips WHERE shot_id=?").get(shotId))throw new Error("First take is no longer held, or a picture is already selected.");
const direction="Hold the existing field framing and same farmer. In the first two seconds, his right hand comes out of the satchel holding a small pinch of seed, moves outward over the nearest open furrow, and releases visible small grains into the soil. He takes one natural step and repeats one gentle broadcast. Keep the motion continuous and understated; no cut, new people, readable mouth movement, or seed settling insert.";
const reason="The approved 4:26 action requires visible sowing. The first local LTX take left the farmer's hand in the satchel throughout. The retained donor already fills the preceding 0–8 seconds in two approved placements, so repeating its opening here would visibly replay the action. The whole-chapter Director direction for this added beat instead describes a static seed-settling insert, which belongs to the next shot. This scoped correction keeps the approved source-clock map and cast and uses new local coverage for the next sowing moment.";
const noteId=randomUUID(),commandId=randomUUID(),now=Date.now();
const note=`Approved local LTX motion correction: ${direction}\nReason: ${reason}`;
const receipt={kind:"isolated_meyah_mark4_shot093_local_motion_correction",projectId,shotId,oldAttemptId,oldDirection,direction,reason,reviewNoteId:noteId,planHash,crewRunId:run.id,backup:relative(root,backup).replaceAll("\\","/"),providerCalled:false,liveDatabaseOpened:false};
db.exec("BEGIN IMMEDIATE");
try{
  const changed=db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=? AND shot_id=? AND status='hold_for_review'").run(oldAttemptId,shotId);
  if(Number(changed.changes)!==1)throw new Error("First take changed before correction.");
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'shot',?,'qc',?,1,?)").run(noteId,projectId,shotId,note,now);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,'review_local_motion_correction',?,?,?)")
    .run(commandId,projectId,sequence,JSON.stringify(receipt),`meyah-mark4-shot093-local-motion:${noteId}`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({reviewNoteId:noteId,direction,receiptPath,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
