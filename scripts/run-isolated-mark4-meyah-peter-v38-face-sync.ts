/** One guarded face-targeted Meyah Peter 4:38 take, held for picture and audio review. */
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
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="5b3d1b76-e839-45c6-8067-676a5002d623";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const baseAttemptId="e54a8e1d-31e5-479c-b088-0067b1f63fe1";
const baseSha256="965c34bc6281b438d5f52cc7a2b103c09440d9e89c4821c131e5db85a1cffd6e";
const faceThumbSha256="27b8d0097227aa292c0e911a8c512a886cd6b741b8e2356507b868d5279ee23b";
const sourceStartMs=746695,sourceEndMs=754976,castEndMs=8266;
const reviewDir=join(root,"review");
const faceManifestPath=join(reviewDir,"meyah-mark4-peter-v38-face-review-20261027","manifest.json");
const pendingPath=join(reviewDir,"meyah-mark4-peter-v38-sync-pending-20261027.json");
const backupPath=join(reviewDir,"heartword.before-peter-v38-sync-20261027.sqlite");
if(!existsSync(backupPath)||existsSync(pendingPath))throw new Error("A fresh isolated backup and no prior Peter sync request are required.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const faceManifest=JSON.parse(readFileSync(faceManifestPath,"utf8").replace(/^\uFEFF/,"")) as {
  shotId:string;baseAttemptId:string;videoSha256:string;selectedFaceId:string|null;reviewStatus:string;
  faceCandidates:Array<{faceId:string;thumbnailPath:string;thumbnailSha256:string}>;
};
if(faceManifest.shotId!==shotId||faceManifest.baseAttemptId!==baseAttemptId||faceManifest.videoSha256!==baseSha256||
  faceManifest.selectedFaceId!=="0"||faceManifest.reviewStatus!=="codex_visual_selection")throw new Error("The reviewed Peter base and face selection changed.");
const peterFace=faceManifest.faceCandidates.find(face=>face.faceId==="0");
if(!peterFace||peterFace.thumbnailSha256!==faceThumbSha256||hash(join(root,peterFace.thumbnailPath))!==faceThumbSha256)throw new Error("Peter's visually checked Kling face thumbnail changed.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved source-clock shot correspondence changed.");
assertEditionInputsCurrent(db,root,projectId);
const base=db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=? AND operation='avatar_base' AND provider='kling'")
  .get(baseAttemptId,shotId) as {result_asset_path:string;status:string}|undefined;
if(!base||base.status!=="hold_for_review"||hash(join(root,"assets",base.result_asset_path))!==baseSha256)throw new Error("The held Peter base video changed.");
const sidecar=JSON.parse(readFileSync(join(root,"assets",`${base.result_asset_path}.json`),"utf8")) as {
  taskId:string;videoUrl:string;outputSha256:string;durationMs:number;audio:{path:string;startMs:number;endMs:number;sha256:string};
};
if(sidecar.taskId!=="943912530055934563"||sidecar.outputSha256!==baseSha256||sidecar.durationMs<sourceEndMs-sourceStartMs||!sidecar.videoUrl)throw new Error("Retained Kling base provenance changed.");
const binding=db.prepare("SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shotId) as {character_version_id:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!binding||binding.source_start_ms!==sourceStartMs||binding.source_end_ms!==sourceEndMs)throw new Error("Producer-reviewed Peter speech window changed.");
const cast=resolveSpeechRunCastAudio(db,shotId,binding.character_version_id);
if(!cast||cast.path!==sidecar.audio.path||cast.startMs!==0||cast.endMs!==castEndMs||
  sidecar.audio.sha256!==hash(join(root,"assets",cast.path)))throw new Error("Approved Meyah Peter voice audio changed.");
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shotId))throw new Error("A Peter lip-sync attempt already exists; reconcile it before retrying.");
const authorization=productionAuthorization(db,root,projectId);
checkFilmSpend(db,projectId,1);
const pending:{kind:string;projectId:string;shotId:string;baseAttemptId:string;selectedFaceId:string;audioPath:string;
  audioSha256:string;sourceStartMs:number;sourceEndMs:number;castEndMs:number;status:string;startedAt:string;reservationId?:string;taskId?:string}={
  kind:"isolated_meyah_mark4_peter_v38_face_sync",projectId,shotId,baseAttemptId,selectedFaceId:"0",audioPath:cast.path,
  audioSha256:sidecar.audio.sha256,sourceStartMs,sourceEndMs,castEndMs,status:"preparing",startedAt:new Date().toISOString()};
const save=()=>writeFileSync(pendingPath,JSON.stringify(pending,null,2)+"\n");
save();
const reservationId=reserveAvatarSpend(db,projectId,shotId,1);pending.reservationId=reservationId;pending.status="reserved";save();
authorization.assertCurrent();
const result=await new KlingFaceLipSyncProvider().syncFace(sidecar.videoUrl,"0",cast,0,taskId=>{
  pending.taskId=taskId;pending.status="submitted";save();
});
if(!pending.taskId||!result.media||!existsSync(join(root,"assets",result.media.path)))throw new Error("Kling result or submitted task missing; recover the exact task without resubmitting.");
const output=join(root,"assets",result.media.path);
const durationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output],{encoding:"utf8"}).trim())*1000);
if(durationMs<sourceEndMs-sourceStartMs)throw new Error(`Kling face-sync result ${pending.taskId} is too short; retain it for review.`);
const outputSha256=hash(output),attemptId=randomUUID(),now=Date.now();
const evidence={kind:pending.kind,projectId,shotId,planHash,baseAttemptId,baseSha256,baseTaskId:sidecar.taskId,
  faceManifest:relative(root,faceManifestPath).replaceAll("\\","/"),selectedFaceId:"0",faceThumbSha256,
  audio:{path:cast.path,startMs:cast.startMs,endMs:cast.endMs,sha256:sidecar.audio.sha256},sourceStartMs,sourceEndMs,
  taskId:pending.taskId,outputPath:result.media.path,outputSha256,durationMs,estimatedUsd:result.cost.usd,
  reservationId,productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash},
  backup:relative(root,backupPath).replaceAll("\\","/"),status:"hold_for_review",liveDatabaseOpened:false};
writeFileSync(`${output}.json`,JSON.stringify(evidence,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,? ,?,'lip_sync',?,'hold_for_review',?,?,?)")
    .run(attemptId,shotId,result.provenance.provider,result.provenance.model,
      `Mark 4:38 Meyah Peter, source ${sourceStartMs}-${sourceEndMs} ms; visually confirmed face 0; approved mapped voice ${cast.startMs}-${cast.endMs} ms; Kling base ${baseAttemptId}; task ${pending.taskId}.`,
      result.media.path,result.cost.usd,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,result.cost.usd,now);
  settleAvatarSpend(db,projectId,reservationId,attemptId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,shotId,`Peter 4:38 Meyah face-targeted lip-sync candidate ${attemptId}; review lips, sleeping Jesus, original Meyah words and exact 8.281-second placement before selection. Task ${pending.taskId}; output SHA256 ${outputSha256}.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
pending.status="held_for_picture_audio_review";save();
console.log(JSON.stringify({attemptId,taskId:pending.taskId,outputPath:result.media.path,outputSha256,durationMs,heldForReview:true,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
