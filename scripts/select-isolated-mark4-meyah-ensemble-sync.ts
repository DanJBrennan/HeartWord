/** Select one reviewed, source-bound ensemble face-sync take. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { acceptLipSyncCandidate } from "../src/pipeline/voice-lipsync/candidate-selection.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah project may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId=process.argv[2],reviewPath=process.argv[3];
if(!shotId||!/^[a-f0-9-]{36}$/.test(shotId)||!reviewPath)throw new Error("Usage: select-isolated-mark4-meyah-ensemble-sync <target-shot-id> <absolute-review-json>");
const reviewAbs=resolve(reviewPath),reviewRel=relative(root,reviewAbs);
if(reviewRel===".."||reviewRel.startsWith(`..${sep}`)||!reviewRel.startsWith(`review${sep}`)||!existsSync(reviewAbs))
  throw new Error("The decision must be saved inside the isolated review directory.");
const reviewBytes=readFileSync(reviewAbs),review=JSON.parse(reviewBytes.toString("utf8")) as {
  kind:string;projectId:string;shotId:string;attemptId:string;outputSha256:string;faceId:string;speaker:string;
  sourceStartMs:number;sourceEndMs:number;castSha256:string;audioLagMs:number;audioCorrelation:number;
  contactPath:string;pictureEvidence:string;audioEvidence:string;backupPath:string;
};
if(review.kind!=="isolated_meyah_mark4_ensemble_sync_editorial_selection"||review.projectId!==projectId||review.shotId!==shotId||
  !review.pictureEvidence?.trim()||!review.audioEvidence?.trim()||!Number.isFinite(review.audioLagMs)||Math.abs(review.audioLagMs)>10||
  !Number.isFinite(review.audioCorrelation)||review.audioCorrelation<0.98)
  throw new Error("A named, evidence-backed picture and audio decision is required.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const contact=resolve(root,review.contactPath),contactRel=relative(root,contact),backup=resolve(root,review.backupPath),backupRel=relative(root,backup);
if(contactRel===".."||contactRel.startsWith(`..${sep}`)||!contactRel.startsWith(`review${sep}`)||!existsSync(contact)||
  backupRel===".."||backupRel.startsWith(`..${sep}`)||!backupRel.startsWith(`review${sep}`)||!existsSync(backup))
  throw new Error("The inspected contact and preselection backup must remain in the isolated root.");
const manifestPath=join(root,"review",`meyah-mark4-face-review-${shotId}`,"manifest.json");
const manifest=JSON.parse(readFileSync(manifestPath,"utf8").replace(/^\uFEFF/,"")) as {
  selectedFaceId:string;reviewStatus:string;reviewRationale:string;faceCandidates:Array<{faceId:string;thumbnailPath:string;thumbnailSha256:string}>;
};
const face=manifest.faceCandidates.find(item=>item.faceId===review.faceId);
if(manifest.selectedFaceId!==review.faceId||manifest.reviewStatus!=="codex_visual_selection"||
  !manifest.reviewRationale.includes(review.speaker)||!face||hash(resolve(root,face.thumbnailPath))!==face.thumbnailSha256)
  throw new Error("The visually identified speaker face changed.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")throw new Error("Approved edition plan changed.");
const row=db.prepare(`SELECT ga.shot_id,ga.status,ga.result_asset_path,sh.dialogue_character_id,ub.source_start_ms,ub.source_end_ms,
  c.name speaker_name FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  JOIN shot_utterance_bindings ub ON ub.shot_id=sh.id JOIN characters c ON c.id=sh.dialogue_character_id
  WHERE ga.id=? AND ga.operation='lip_sync' AND sc.project_id=? AND sh.id=?`)
  .get(review.attemptId,projectId,shotId) as {shot_id:string;status:string;result_asset_path:string;speaker_name:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!row||row.status!=="hold_for_review"||row.speaker_name!==review.speaker||row.source_start_ms!==review.sourceStartMs||row.source_end_ms!==review.sourceEndMs)
  throw new Error("The held candidate, speaker or exact source window changed.");
const output=resolve(root,"assets",row.result_asset_path),outputRel=relative(resolve(root,"assets"),output);
if(outputRel===".."||outputRel.startsWith(`..${sep}`)||!existsSync(output)||hash(output)!==review.outputSha256)throw new Error("Reviewed candidate bytes changed.");
const provenance=JSON.parse(readFileSync(`${output}.json`,"utf8")) as {
  sourceStartMs:number;sourceEndMs:number;castSha256?:string;audio?:{sha256:string};selectedFaceId:string;outputSha256:string;
};
if(provenance.sourceStartMs!==review.sourceStartMs||provenance.sourceEndMs!==review.sourceEndMs||
  (provenance.castSha256??provenance.audio?.sha256)!==review.castSha256||provenance.selectedFaceId!==review.faceId||
  provenance.outputSha256!==review.outputSha256)throw new Error("Candidate audio/face lineage changed.");
const durationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","stream=duration","-select_streams","v:0","-of","csv=p=0",output],{encoding:"utf8"}).trim())*1000);
if(durationMs<review.sourceEndMs-review.sourceStartMs)throw new Error("Reviewed picture is shorter than exact source speech.");
const selected=acceptLipSyncCandidate(db,projectId,review.attemptId,{reviewer:"Codex editorial QC",evidence:
  `Dan delegated routine visual selections. ${review.pictureEvidence} ${review.audioEvidence} Audio lag ${review.audioLagMs} ms; normalized correlation ${review.audioCorrelation}. Selected provider face ${review.faceId} is ${review.speaker}. Contact ${review.contactPath}. Retained review SHA256 ${createHash("sha256").update(reviewBytes).digest("hex")}. The clip is limited to source ${review.sourceStartMs}-${review.sourceEndMs} ms.`});
console.log(JSON.stringify({attemptId:review.attemptId,selected,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
