/** Sync only a visually identified speaker face in one retained ensemble base. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, productionAuthorization } from "../src/pipeline/creative-direction/crew-store.js";
import { checkFilmSpend, reserveAvatarSpend, settleAvatarSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";
import { resolveSpeechRunCastAudio } from "../src/pipeline/voice-lipsync/speech-run-audio.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const shotId=process.argv[2];
if(!shotId||!/^[a-f0-9-]{36}$/.test(shotId))throw new Error("Usage: run-isolated-mark4-meyah-ensemble-face-sync <target-shot-id>");
const assetPath=(path:string)=>{const full=resolve(root,"assets",path),rel=relative(resolve(root,"assets"),full);if(rel===".."||rel.startsWith(`..${sep}`)||!existsSync(full))throw new Error("A pinned isolated asset is missing or outside this project.");return full;};
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const manifestPath=join(root,"review",`meyah-mark4-face-review-${shotId}`,"manifest.json");
const pendingPath=join(root,"review",`meyah-mark4-face-sync-pending-${shotId}.json`);
const backup=join(root,"review",`heartword.before-face-sync-${shotId}.sqlite`);
if(!existsSync(backup)||existsSync(pendingPath))throw new Error("A fresh isolated backup and no prior face-sync request are required.");
const manifest=JSON.parse(readFileSync(manifestPath,"utf8").replace(/^\uFEFF/,"")) as {
  projectId:string;shotId:string;baseAttemptId:string;taskId:string;videoSha256:string;selectedFaceId:string|null;reviewStatus:string;reviewRationale?:string;
  faceCandidates:Array<{faceId:string;thumbnailPath:string;thumbnailSha256:string;startTime:number;endTime:number}>;
};
if(manifest.projectId!==projectId||manifest.shotId!==shotId||manifest.reviewStatus!=="codex_visual_selection"||
  !manifest.selectedFaceId||!manifest.reviewRationale?.trim())throw new Error("The actual Kling speaker face needs a recorded visual selection.");
const chosen=manifest.faceCandidates.find(face=>face.faceId===manifest.selectedFaceId);
if(!chosen||hash(join(root,chosen.thumbnailPath))!==chosen.thumbnailSha256)throw new Error("The visually reviewed face thumbnail changed.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved source-clock correspondence changed.");
assertEditionInputsCurrent(db,root,projectId);
const shot=db.prepare("SELECT sh.needs_lip_sync,sh.dialogue_character_id,sc.project_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?")
  .get(shotId) as {needs_lip_sync:number;dialogue_character_id:string;project_id:string}|undefined;
if(shot?.project_id!==projectId||shot.needs_lip_sync!==1||!shot.dialogue_character_id)throw new Error("The target speaker changed.");
const speaker=db.prepare("SELECT name FROM characters WHERE id=?").get(shot.dialogue_character_id) as {name:string}|undefined;
if(!speaker||!manifest.reviewRationale.includes(speaker.name))throw new Error("Face selection rationale must identify the bound speaker.");
const base=db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='avatar_base' AND provider='kling'")
  .get(manifest.baseAttemptId,shotId) as {result_asset_path:string;status:string}|undefined;
if(!base||base.status!=="hold_for_review"||hash(assetPath(base.result_asset_path))!==manifest.videoSha256)throw new Error("The retained ensemble base changed.");
const provenance=JSON.parse(readFileSync(`${assetPath(base.result_asset_path)}.json`,"utf8")) as {
  taskId:string;videoUrl:string;outputSha256:string;outputDurationMs:number;sourceStartMs:number;sourceEndMs:number;
  audio:{path:string;startMs:number;endMs:number;sha256:string};
};
if(provenance.taskId!==manifest.taskId||provenance.outputSha256!==manifest.videoSha256||!provenance.videoUrl||
  provenance.outputDurationMs<provenance.sourceEndMs-provenance.sourceStartMs||chosen.startTime>0||chosen.endTime<provenance.sourceEndMs-provenance.sourceStartMs)
  throw new Error("Kling base, identified face tracking, or source coverage changed.");
const binding=db.prepare("SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shotId) as {character_version_id:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!binding||binding.source_start_ms!==provenance.sourceStartMs||binding.source_end_ms!==provenance.sourceEndMs)
  throw new Error("Reviewed source-bound speaker timing changed.");
const audio=resolveSpeechRunCastAudio(db,shotId,binding.character_version_id);
if(!audio||audio.path!==provenance.audio.path||audio.startMs!==provenance.audio.startMs||audio.endMs!==provenance.audio.endMs||
  hash(assetPath(audio.path))!==provenance.audio.sha256)throw new Error("Approved Meyah cast audio changed.");
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shotId))throw new Error("A lip-sync attempt already exists; reconcile instead of resubmitting.");
const authorization=productionAuthorization(db,root,projectId);
checkFilmSpend(db,projectId,1);
const pending:{kind:string;projectId:string;shotId:string;baseAttemptId:string;selectedFaceId:string;audioSha256:string;
  status:string;startedAt:string;reservationId?:string;taskId?:string}={kind:"isolated_meyah_mark4_ensemble_face_sync",projectId,shotId,
  baseAttemptId:manifest.baseAttemptId,selectedFaceId:manifest.selectedFaceId,audioSha256:provenance.audio.sha256,
  status:"preparing",startedAt:new Date().toISOString()};
const save=()=>writeFileSync(pendingPath,JSON.stringify(pending,null,2)+"\n");
save();
const reservationId=reserveAvatarSpend(db,projectId,shotId,1);pending.reservationId=reservationId;pending.status="reserved";save();
authorization.assertCurrent();
const result=await new KlingFaceLipSyncProvider().syncFace(provenance.videoUrl,manifest.selectedFaceId,audio,0,taskId=>{
  pending.taskId=taskId;pending.status="submitted";save();
});
if(!pending.taskId||!result.media||!existsSync(assetPath(result.media.path)))throw new Error("Kling result or submitted task is missing; recover exact task without resubmitting.");
const output=assetPath(result.media.path);
const durationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output],{encoding:"utf8"}).trim())*1000);
if(!Number.isFinite(durationMs)||durationMs<=0)throw new Error(`Face-sync result ${pending.taskId} has no measurable picture; recover its saved task.`);
const shortfallMs=Math.max(0,provenance.sourceEndMs-provenance.sourceStartMs-durationMs);
const outputSha256=hash(output),attemptId=randomUUID(),now=Date.now();
const evidence={kind:pending.kind,projectId,shotId,planHash,baseAttemptId:manifest.baseAttemptId,baseTaskId:manifest.taskId,
  baseSha256:manifest.videoSha256,faceManifest:relative(root,manifestPath).replaceAll("\\","/"),
  selectedFaceId:manifest.selectedFaceId,faceThumbSha256:chosen.thumbnailSha256,faceReview:manifest.reviewRationale,
  audio:{...audio,sha256:provenance.audio.sha256},sourceStartMs:provenance.sourceStartMs,sourceEndMs:provenance.sourceEndMs,
  taskId:pending.taskId,outputPath:result.media.path,outputSha256,durationMs,shortfallMs,estimatedUsd:result.cost.usd,reservationId,
  productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash},backup:relative(root,backup).replaceAll("\\","/"),
  status:shortfallMs>0?"short_output_held_for_reconciliation":"hold_for_review",liveDatabaseOpened:false};
writeFileSync(`${output}.json`,JSON.stringify(evidence,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,'lip_sync',?,'hold_for_review',?,?,?)")
    .run(attemptId,shotId,result.provenance.provider,result.provenance.model,
      `Meyah ${speaker.name} source ${provenance.sourceStartMs}-${provenance.sourceEndMs} ms; visually selected Kling face ${manifest.selectedFaceId}; base ${manifest.baseAttemptId}; task ${pending.taskId}.`,
      result.media.path,result.cost.usd,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,result.cost.usd,now);
  settleAvatarSpend(db,projectId,reservationId,attemptId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,shotId,shortfallMs>0
      ?`Ensemble ${speaker.name} face-targeted Meyah Kling task ${pending.taskId} is ${shortfallMs} ms short. Raw candidate ${attemptId} and provider charge are retained. Reconcile its exact saved bytes and approved audio before picture review or selection. SHA256 ${outputSha256}.`
      :`Ensemble ${speaker.name} face-targeted Meyah lip-sync candidate ${attemptId}; inspect lips, other faces, exact audio and source-bound picture before selection. Task ${pending.taskId}; SHA256 ${outputSha256}.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
pending.status=shortfallMs>0?"short_output_held_for_reconciliation":"held_for_picture_audio_review";save();
console.log(JSON.stringify({attemptId,taskId:pending.taskId,outputPath:result.media.path,outputSha256,durationMs,shortfallMs,
  heldForReview:true,usableForSelection:shortfallMs===0,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
