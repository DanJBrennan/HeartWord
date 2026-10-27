/** Register one completed LTX draft after a failed output transfer. Never generates video. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { productionAuthorization, bindAttemptRevision } from "../src/pipeline/creative-direction/crew-store.js";
import { prepareLtxVideoOutput } from "../src/providers/ltx/output.js";
import { sharedLtxTransport } from "../src/providers/ltx/transport.js";
import { reviewGeneratedVideo, videoReviewPassed } from "../src/pipeline/qc/video-review.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rootRel=relative(checkout,root);
if(rootRel===".."||rootRel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Draft recovery is limited to the isolated Meyah worktree.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [shotId,attemptId,generationId]=process.argv.slice(2) as [string,string,string];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(![shotId,attemptId,generationId].every(value=>value&&uuid.test(value)))
  throw new Error("Usage: recover-isolated-mark4-meyah-completed-draft <shot-id> <draft-attempt-id> <ltx-generation-id>");
const prefix=`${shotId}-draft-${attemptId}-ltx-${generationId}`;
const videoDir=join(root,"assets","generated","video");
const raw=join(videoDir,`${prefix}.raw.mp4`),output=join(videoDir,`${prefix}.mp4`),metadataPath=`${output}.json`;
const backup=join(root,"review",`heartword.before-ltx-draft-recovery-${generationId}.sqlite`);
const receiptPath=join(root,"review",`meyah-mark4-ltx-draft-recovery-${generationId}.json`);
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
if(!existsSync(raw)||!existsSync(metadataPath)||!existsSync(backup)||existsSync(output)||existsSync(receiptPath))
  throw new Error("The retained raw draft, failed provider sidecar and fresh backup must exist without a prior recovery.");
const metadataBytes=readFileSync(metadataPath),metadata=JSON.parse(metadataBytes.toString("utf8")) as {
  generationId:string;shotId:string;status:string;error:string;prompt:string;model:string;resolution:string;
  durationSeconds:number;fps:number;audioMode:string;sourceKeyframe:string;sourceKeyframeSha256:string;
  remoteOutputPath:string;localOutputPath:string;productionRevision:{runId:string;briefHash:string};
  request:{audio:boolean;duration:number;fps:number};
};
if(metadata.generationId!==generationId||metadata.shotId!==`${shotId}-draft-${attemptId}`||
  metadata.status!=="failed"||!metadata.error.startsWith("LTX SCP transfer failed")||
  metadata.model!=="ltx-2.5-fast"||metadata.resolution!=="720p"||metadata.durationSeconds!==5||metadata.fps!==24||
  metadata.audioMode!=="none"||metadata.request.audio!==false||metadata.request.duration!==5||metadata.request.fps!==24||
  resolve(metadata.localOutputPath)!==output||!metadata.remoteOutputPath.startsWith("/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/ltx2_video_"))
  throw new Error("The retained failed draft does not match a completed five-second local LTX request.");
const assets=join(root,"assets"),keyframe=resolve(assets,metadata.sourceKeyframe),keyframeRel=relative(assets,keyframe);
if(keyframeRel===".."||keyframeRel.startsWith(`..${sep}`)||!existsSync(keyframe)||hash(keyframe)!==metadata.sourceKeyframeSha256)
  throw new Error("The approved start frame changed.");
const remoteHashLine=await sharedLtxTransport().remote(`shasum -a 256 '${metadata.remoteOutputPath.replaceAll("'","'\\''")}'`);
const remoteHash=remoteHashLine.match(/^[0-9a-f]{64}/i)?.[0]?.toLowerCase();
const rawHash=hash(raw);
if(!remoteHash||remoteHash!==rawHash)throw new Error("The transferred draft differs from the exact completed Mac output.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("The approved edition correspondence changed.");
assertEditionInputsCurrent(db,root,projectId);
const shot=db.prepare("SELECT sh.id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=? AND sh.needs_lip_sync=0")
  .get(shotId,projectId) as {id:string}|undefined;
const acceptedFrame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shotId) as {result_asset_path:string}|undefined;
if(!shot||acceptedFrame?.result_asset_path!==metadata.sourceKeyframe||db.prepare("SELECT id FROM generation_attempts WHERE id=?").get(attemptId))
  throw new Error("The isolated target, accepted frame or draft-attempt slot changed.");
const authorization=productionAuthorization(db,root,projectId);
authorization.assertCurrent();
if(authorization.runId!==metadata.productionRevision.runId||authorization.briefHash!==metadata.productionRevision.briefHash)
  throw new Error("The completed draft belongs to a different approved crew revision.");
const properties=await prepareLtxVideoOutput(raw,output,{audioMode:"none"});
if(!properties.audioRemoved||properties.width!==1280||properties.height!==704||properties.frameRate!=="24/1"||
  properties.frames!==121||Math.abs((properties.durationSeconds??0)-5.041667)>0.01)
  throw new Error("The recovered draft is not the expected silent 121-frame preview; retain all bytes for diagnosis.");
const outputHash=hash(output);
let reviewNote:string,reviewCost=0;
try{
  const review=await reviewGeneratedVideo({videoPath:output,keyframePath:keyframe,instruction:metadata.prompt});
  reviewNote=`${videoReviewPassed(review.verdict)?"passed":"FAILED"} automated review (confidence ${review.verdict.confidence}): ${review.verdict.reason}`;
  reviewCost=review.costUsd;
}catch(error){reviewNote=`automated review could not run: ${(error as Error).message}`;}
const now=Date.now(),noteId=randomUUID(),assetRel=relative(assets,output).replaceAll("\\","/");
db.exec("BEGIN IMMEDIATE");
try{
  authorization.assertCurrent();
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES(?,?, 'ltx_local',?,'generate_draft',?,?,'hold_for_review',?,0,?)`)
    .run(attemptId,shotId,metadata.model,metadata.resolution,metadata.prompt,assetRel,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,0,?)")
    .run(randomUUID(),projectId,attemptId,now);
  if(reviewCost>0)db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,reviewCost,now);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(noteId,projectId,shotId,`Recovered completed LTX draft ${attemptId} after one SCP failure. Exact Mac/raw SHA256 ${rawHash}; silent output SHA256 ${outputHash}. Draft ${reviewNote}. Review picture before choosing; no provider generation repeated.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const receipt={kind:"isolated_meyah_mark4_completed_ltx_draft_recovery",projectId,shotId,attemptId,generationId,
  macOutput:metadata.remoteOutputPath,rawSha256:rawHash,silentOutputSha256:outputHash,
  originalMetadataSha256:createHash("sha256").update(metadataBytes).digest("hex"),properties,reviewNote,reviewCost,
  productionRevision:metadata.productionRevision,backup:relative(root,backup).replaceAll("\\","/"),noteId,
  providerPostRepeated:false,liveDatabaseOpened:false};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({receipt,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
