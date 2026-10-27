/** Choose a retained Meyah LTX motion draft after explicit visual review. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { chooseShotDraft } from "../src/pipeline/media-generation/draft-room.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",decisionArg=process.argv[2];
if(!decisionArg)throw new Error("Usage: select-isolated-mark4-meyah-reviewed-draft <absolute-decision-json>");
const decisionPath=resolve(decisionArg),decisionRel=relative(root,decisionPath);
if(decisionRel===".."||decisionRel.startsWith(`..${sep}`)||!decisionRel.startsWith(`review${sep}`)||!existsSync(decisionPath))
  throw new Error("The editorial decision must be saved inside isolated review evidence.");
const decisionBytes=readFileSync(decisionPath),decision=JSON.parse(decisionBytes.toString("utf8")) as {
  kind:string;projectId:string;shotId:string;placement:number;attemptId:string;outputSha256:string;
  contactPath:string;contactSha256:string;backupPath:string;automatedConfidence:number;
  pictureEvidence:string;audioEvidence:string;decision:string;
};
if(decision.kind!=="isolated_meyah_mark4_ltx_draft_editorial_selection"||decision.projectId!==projectId||
  !Number.isInteger(decision.placement)||!Number.isInteger(decision.automatedConfidence)||
  !decision.pictureEvidence?.trim()||!decision.audioEvidence?.trim()||!decision.decision?.trim())
  throw new Error("The draft needs a complete recorded picture and audio decision.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const evidenceFile=(value:string,sha?:string)=>{
  const full=resolve(root,value),relativePath=relative(root,full);
  if(relativePath===".."||relativePath.startsWith(`..${sep}`)||!relativePath.startsWith(`review${sep}`)||!existsSync(full)||
    (sha&&hash(full)!==sha))throw new Error("A retained review file is missing or changed.");
  return full;
};
evidenceFile(decision.contactPath,decision.contactSha256);
evidenceFile(decision.backupPath);
const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
  {items:Array<{placement:number;targetShotId:string;treatment:string;durationMs:number}>};
if(!worklist.items.some(item=>item.placement===decision.placement&&item.targetShotId===decision.shotId&&
  item.treatment==="needs_coverage"&&item.durationMs>0))throw new Error("The reviewed silent placement changed.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Approved edition correspondence changed.");
assertEditionInputsCurrent(db,root,projectId);
const attempt=db.prepare(`SELECT ga.shot_id,ga.status,ga.result_asset_path FROM generation_attempts ga
  JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  WHERE ga.id=? AND ga.operation='generate_draft' AND ga.provider='ltx_local' AND sh.needs_lip_sync=0 AND sc.project_id=?`)
  .get(decision.attemptId,projectId) as {shot_id:string;status:string;result_asset_path:string}|undefined;
if(attempt?.shot_id!==decision.shotId||attempt.status!=="hold_for_review")throw new Error("The held local draft changed.");
const output=resolve(root,"assets",attempt.result_asset_path),outputRel=relative(join(root,"assets"),output);
if(outputRel===".."||outputRel.startsWith(`..${sep}`)||!existsSync(output)||hash(output)!==decision.outputSha256)
  throw new Error("The reviewed silent draft bytes changed.");
const qc=db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND source='qc' AND note LIKE ? ORDER BY created_at DESC LIMIT 1")
  .get(projectId,decision.shotId,`%draft ${decision.attemptId}%`) as {note:string}|undefined;
if(!qc||!qc.note.includes(`confidence ${decision.automatedConfidence}`))
  throw new Error("The retained automated draft verdict changed.");
const now=Date.now(),noteId=randomUUID();
db.exec("BEGIN IMMEDIATE");
let selected;
try{
  selected=chooseShotDraft(db,projectId,decision.attemptId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
    .run(noteId,projectId,decision.shotId,
      `Codex editorial QC chose LTX draft ${decision.attemptId} for placement ${decision.placement} under Dan's delegated routine visual review. ${decision.pictureEvidence} ${decision.audioEvidence} ${decision.decision}. Automatic confidence ${decision.automatedConfidence} remains separate. Decision SHA256 ${createHash("sha256").update(decisionBytes).digest("hex")}. Final render and final clip require separate review.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({selected,noteId,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
