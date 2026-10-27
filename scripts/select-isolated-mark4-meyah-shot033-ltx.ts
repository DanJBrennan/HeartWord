/** One reviewed, source-clock selection of the isolated 4:11-12 listening take. */
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
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="cfcbe0a5-63a8-4b55-9a47-add402817305";
const attemptId="4a2af9b5-cc0b-4bdb-897e-8f4e87afc1c9",durationMs=7100;
const outputRel="generated/video/cfcbe0a5-63a8-4b55-9a47-add402817305-ltx-8a2e6c92-d59b-47c5-a8a2-9e3584e50c88.mp4";
const outputSha="f0809cac2d47444abac976a5e2dd82fc88186965a0a382ae85425d57190b3613";
const backup=join(root,"review","heartword.before-shot033-ltx-selection-20261027.sqlite");
const contact=join(root,"review","ltx-contacts",attemptId,"contact.jpg");
if(!existsSync(backup)||!existsSync(contact))throw new Error("An isolated backup and the reviewed exact-window contact are required.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")throw new Error("Approved shot map changed.");
const mapped=JSON.parse(String((db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}).payload)) as
  {planHash:string;shots:Array<{targetShotId:string|null;treatment:string}>};
if(mapped.planHash!==plan.hash||!mapped.shots.some(item=>item.targetShotId===shotId&&item.treatment==="needs_coverage"))throw new Error("Shot no longer belongs to approved silent coverage.");
const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
  {items:Array<{placement:number;targetShotId:string;durationMs:number;treatment:string}>};
if(!worklist.items.some(item=>item.placement===33&&item.targetShotId===shotId&&item.durationMs===durationMs&&item.treatment==="needs_coverage"))
  throw new Error("Approved source-clock placement changed.");
const attempt=db.prepare("SELECT status,result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video' AND provider='ltx_local'")
  .get(attemptId,shotId) as {status:string;result_asset_path:string}|undefined;
if(attempt?.status!=="hold_for_review"||attempt.result_asset_path!==outputRel)throw new Error("The exact candidate is no longer held.");
const output=join(root,"assets",outputRel);
if(createHash("sha256").update(readFileSync(output)).digest("hex")!==outputSha)throw new Error("Reviewed local LTX bytes changed.");
const seconds=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output],{encoding:"utf8"}).trim());
if(!Number.isFinite(seconds)||seconds*1000+50<durationMs)throw new Error("The returned video cannot cover placement 33.");
const reviewNoteId=randomUUID(),now=Date.now();
const note=`Codex editorial QC selected shot 33 local LTX take ${attemptId} after inspecting the 0-7.100 s contact. John remains clean-shaven in his cream/teal robe, Peter remains the older rust-clad follower, and Jesus stays an unreadable foreground profile. All three remain separate and seated by the lake; they exchange quiet listening looks without speaking or unsupported gestures. The picture is 8.041667 s, with 7.100 s selected. Automated picture confidence 72 was below the 80 automatic threshold but named no actual flaw, so this is an explicit delegated editorial selection. The separate native ambience review found natural outdoor sound and no speech (confidence 95); continuous Meyah source speech remains authoritative. Output SHA256 ${outputSha}. Contact: review/ltx-contacts/${attemptId}/contact.jpg.`;
db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
  .run(reviewNoteId,projectId,shotId,note,now);
const selected=acceptFinalVideoCandidate(db,projectId,attemptId,durationMs);
recordMediaAcceptance(db,projectId,attemptId,reviewNoteId);
console.log(JSON.stringify({attemptId,reviewNoteId,selected,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
