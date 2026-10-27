/** Select the reviewed 4:9 group image only in the isolated Meyah edition. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, requireCurrentPlan } from "../src/pipeline/creative-direction/crew-store.js";
import { readLandscapePng } from "../src/pipeline/media-generation/external-keyframes.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=join(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah edition may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="ab57063e-c0f5-46d1-bf16-7f2f415598e6";
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const candidateRel="review/meyah-mark4-shot023-keyframe-candidates/shot023-v3.png";
const candidate=join(root,candidateRel),bytes=readFileSync(candidate),sha256=hash(bytes);
if(sha256!=="bf0b5f4a68a583d5d2ad20a661c4979342c0bbbf587ba0b38e5708cf630ed50f")throw new Error("Reviewed version 3 changed.");
const dimensions=readLandscapePng(bytes);
const reports=["meyah-mark4-shot023-candidate-picture-checks-20261027.json",
  "meyah-mark4-shot023-v2-picture-checks-20261027.json","meyah-mark4-shot023-v3-picture-checks-20261027.json"]
  .map(name=>({name,raw:readFileSync(join(root,"review",name))}));
let reviewCost=0;
for(const report of reports){
  const value=JSON.parse(report.raw.toString("utf8")) as {projectId:string;shotId:string;costUsd:number;checks:Array<{status:string}>};
  if(value.projectId!==projectId||value.shotId!==shotId||value.checks.some(item=>item.status!=="complete"))
    throw new Error("A pinned visual review is incomplete or changed.");
  reviewCost+=value.costUsd;
}
const finalReport=JSON.parse(reports[2]!.raw.toString("utf8")) as {candidateSha256:string;checks:Array<{name:string;result:{score:number;instanceCount:number}}>;
  scene:{settingScore:number;crowdDensityMatch:boolean;actionMatch:boolean;continuityViolation:boolean}};
if(finalReport.candidateSha256!==sha256||finalReport.scene.settingScore<90||!finalReport.scene.crowdDensityMatch||
  !finalReport.scene.actionMatch||finalReport.scene.continuityViolation||finalReport.checks.some(item=>item.result.instanceCount!==1))
  throw new Error("Reviewed 4:9 hard picture checks did not pass.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Approved picture plan changed.");
assertEditionInputsCurrent(db,root,projectId);
const run=requireCurrentPlan(db,root,projectId);
const binding=db.prepare("SELECT source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shotId) as {source_start_ms:number;source_end_ms:number}|undefined;
const cast=db.prepare("SELECT COUNT(*) n FROM shot_characters WHERE shot_id=?").get(shotId) as {n:number};
if(binding?.source_start_ms!==142703||binding.source_end_ms!==149707||cast.n!==5)
  throw new Error("Reviewed group speech or cast changed.");
const existing=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted'")
  .get(shotId);
if(existing)throw new Error("Target already has an accepted 4:9 keyframe.");
const backup=join(root,"review","heartword.before-shot023-keyframe-selection-20261027.sqlite");
if(!existsSync(backup))throw new Error("Create and check an isolated preselection SQLite backup first.");
const attemptId=randomUUID(),resultRel=`generated/keyframes/codex/${shotId}/${attemptId}.png`;
const saved=join(root,"assets",...resultRel.split("/"));
mkdirSync(dirname(saved),{recursive:true});copyFileSync(candidate,saved);
const prompt="Localized 16:9 Jesus 4:9 group frame: approved Papuan Jesus speaking close in the boat; Peter, clean-shaven John, the grey-bearded elder and young witness listen silently on the Galilean shore. Preserve the approved source picture, identity and simple first-century costume.";
const review="Codex selected version 3 after examining all three retained candidates and the approved Jesus film frame. Jesus likeness improved 48 to 58 to 68 in uncalibrated checks; the remaining garment-detail mismatch is visible but the plain blue-trim robe is consistent with the selected film character. All five named figures appear once, John is clean-shaven, Jesus alone visibly speaks, and the scene/action hard checks pass. Further image iterations would delay the chapter with uncertain gain; this is the best acceptable reviewed composition under the delegated routine visual decision.";
const provenance={kind:"isolated_meyah_mark4_reviewed_codex_keyframe",provider:"codex_imagegen",model:"not_reported",
  resultPath:resultRel,resultHash:sha256,dimensions,status:"accepted",prompt,review,
  exactImagePrompt:"Localized edit of version 2 using the approved Jesus finished-film frame and portrait to correct his face and simple blue-trimmed cream robe, preserving the four listeners, boat, shore and close speaking composition.",
  sourceCandidate:candidateRel,sourceCandidateSha256:sha256,
  referencePaths:["review/meyah-mark4-shot023-keyframe-candidates/shot023-v2.png",
    "review/ensemble-contacts/c7a2943c-f128-4402-9417-0adb483c31df/sync/31042b6b-f9ac-4cf4-9199-b5b8591bacd1/fullsize-0p28.jpg",
    "assets/characters/jesus/lip_sync_closeup/close-up-neutral-v3.png"],
  reviewReports:reports.map(item=>({path:`review/${item.name}`,sha256:hash(item.raw)})),
  imageBilling:"Codex built-in image tool does not report per-call billing; attempt cost_usd=0 is a schema placeholder.",
  meteredReviewCostUsd:reviewCost};
writeFileSync(saved.replace(/\.png$/,".json"),JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});
const now=Date.now();
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'codex_imagegen','not_reported','generate',?,?,'accepted',?,0,?)`)
    .run(attemptId,shotId,`${dimensions.width}x${dimensions.height}`,prompt,resultRel,now);
  bindAttemptRevision(db,projectId,attemptId,{runId:run.id,briefHash:run.brief_hash});
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,reviewCost,now);
  db.prepare("UPDATE shots SET status='keyframe_approved' WHERE id=?").run(shotId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
    .run(randomUUID(),projectId,shotId,`${review} Image SHA256 ${sha256}. Review checks and costs are pinned in ${resultRel.replace(/\.png$/,".json")}.`,now);
  const sequence=(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n;
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'accept_edition_speaking_keyframe',?,?,?)")
    .run(randomUUID(),projectId,sequence,JSON.stringify({attemptId,shotId,resultPath:resultRel,sha256,review,
      sourceStartMs:binding.source_start_ms,sourceEndMs:binding.source_end_ms,noVideoRequest:true}),
      "meyah-mark4-shot023-reviewed-keyframe-v3",now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({attemptId,shotId,resultRel,sha256,reviewCost,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
