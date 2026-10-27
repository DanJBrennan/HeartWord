/** Select a source-clock silent LTX take only with a retained editorial review. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { recordMediaAcceptance } from "../src/pipeline/creative-direction/crew-store.js";
import { acceptFinalVideoCandidate } from "../src/pipeline/media-generation/final-video.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah project may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",reviewPath=process.argv[2];
if(!reviewPath)throw new Error("Usage: select-isolated-mark4-meyah-reviewed-ltx <absolute-review-json>");
const reviewAbs=resolve(reviewPath),reviewRel=relative(root,reviewAbs);
if(reviewRel===".."||reviewRel.startsWith(`..${sep}`)||!reviewRel.startsWith(`review${sep}`)||!existsSync(reviewAbs))
  throw new Error("The decision must be saved inside the isolated review directory.");
const reviewBytes=readFileSync(reviewAbs),review=JSON.parse(reviewBytes.toString("utf8")) as {
  kind:string;projectId:string;shotId:string;placement:number;attemptId:string;outputSha256:string;durationMs:number;
  contactPath:string;pictureEvidence:string;ambienceEvidence:string;backupPath:string;automatedConfidence:number;
};
if(review.kind!=="isolated_meyah_mark4_silent_ltx_editorial_selection"||review.projectId!==projectId||
  !/^[a-f0-9-]{36}$/.test(review.shotId)||!Number.isInteger(review.placement)||!Number.isInteger(review.durationMs)||
  !review.pictureEvidence?.trim()||!review.ambienceEvidence?.trim()||!Number.isInteger(review.automatedConfidence))
  throw new Error("A complete, evidence-backed silent-picture decision is required.");
const contact=resolve(root,review.contactPath),contactRel=relative(root,contact),backup=resolve(root,review.backupPath),backupRel=relative(root,backup);
if(contactRel===".."||contactRel.startsWith(`..${sep}`)||!contactRel.startsWith(`review${sep}`)||!existsSync(contact)||
  backupRel===".."||backupRel.startsWith(`..${sep}`)||!backupRel.startsWith(`review${sep}`)||!existsSync(backup))
  throw new Error("Inspected frames and preselection backup must remain inside the isolated project.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")throw new Error("Approved shot map changed.");
const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
  {items:Array<{placement:number;targetShotId:string;durationMs:number;treatment:string}>};
if(!worklist.items.some(item=>item.placement===review.placement&&item.targetShotId===review.shotId&&
  item.durationMs===review.durationMs&&item.treatment==="needs_coverage"))throw new Error("Exact approved silent placement changed.");
const attempt=db.prepare(`SELECT ga.shot_id,ga.status,ga.result_asset_path FROM generation_attempts ga
  JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  WHERE ga.id=? AND ga.operation='generate_final_video' AND ga.provider='ltx_local' AND sh.needs_lip_sync=0 AND sc.project_id=?`)
  .get(review.attemptId,projectId) as {shot_id:string;status:string;result_asset_path:string}|undefined;
if(attempt?.shot_id!==review.shotId||attempt.status!=="hold_for_review")throw new Error("The exact local candidate is no longer held.");
const output=resolve(root,"assets",attempt.result_asset_path),outputRel=relative(resolve(root,"assets"),output);
if(outputRel===".."||outputRel.startsWith(`..${sep}`)||!existsSync(output)||
  createHash("sha256").update(readFileSync(output)).digest("hex")!==review.outputSha256)
  throw new Error("Reviewed local take changed.");
const seconds=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output],{encoding:"utf8"}).trim());
if(!Number.isFinite(seconds)||seconds*1000+50<review.durationMs)throw new Error("Take is shorter than approved picture placement.");
const qc=db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='qc' AND note LIKE ? ORDER BY created_at DESC LIMIT 1")
  .get(projectId,review.shotId,`Final-video candidate ${review.attemptId}.%`) as {note:string}|undefined;
if(!qc||!qc.note.includes(`confidence ${review.automatedConfidence}`))throw new Error("Retained automatic picture verdict changed.");
const noteId=randomUUID(),now=Date.now();
const note=`Codex editorial QC selected placement ${review.placement}, local LTX attempt ${review.attemptId}, over the exact ${review.durationMs} ms source-clock window. ${review.pictureEvidence} ${review.ambienceEvidence} Automatic picture confidence ${review.automatedConfidence} is retained separately; this is Codex's explicit decision under Dan's delegated routine visual review. Output SHA256 ${review.outputSha256}. Contact ${review.contactPath}. Review SHA256 ${createHash("sha256").update(reviewBytes).digest("hex")}.`;
db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
  .run(noteId,projectId,review.shotId,note,now);
const selected=acceptFinalVideoCandidate(db,projectId,review.attemptId,review.durationMs);
recordMediaAcceptance(db,projectId,review.attemptId,noteId);
console.log(JSON.stringify({attemptId:review.attemptId,noteId,selected,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
