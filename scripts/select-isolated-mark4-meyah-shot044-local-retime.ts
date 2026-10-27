/** Select an exact, reviewed silent editorial hold from retained local LTX frames. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="cb4aff40-0cf8-47b1-a8e7-13781d00654a";
const sourceAttemptId="8ef63689-713a-49fc-a161-78b50c89631a";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const source=join(root,"assets","generated","video","cb4aff40-0cf8-47b1-a8e7-13781d00654a-ltx-e48f2cc4-9e92-450b-8b6c-d2e25fe83bf9.mp4");
const local=join(root,"review","shot044-clean-opening-20261027","retimed-interpolated-v2.mp4");
const qcPath=join(root,"review","shot044-clean-opening-20261027","retimed-interpolated-v2.qc.json");
const backup=join(root,"review","heartword.before-shot044-local-retime-20261027.sqlite");
const receiptPath=join(root,"review","meyah-mark4-shot044-local-retime-selection-20261027.json");
const relativeOutput=`generated/video/${shotId}-ltx-local-retime-${sourceAttemptId}.mp4`;
const output=join(root,"assets",relativeOutput),sidecar=`${output}.json`;
if(![source,local,qcPath,backup].every(existsSync)||[output,sidecar,receiptPath].some(existsSync))throw new Error("Exact source, QC, backup and unused output paths are required.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const qc=JSON.parse(readFileSync(qcPath,"utf8")) as {kind:string;sourceAttemptId:string;originalSha256:string;retimedSha256:string;approvedWindowMs:number;retimedDurationMs:number;retainedSourceWindowMs:number;retimeFactor:number;reviewPassed:boolean;verdict:{pass:boolean;confidence:number;reason:string};costUsd:number};
if(qc.kind!=="isolated_meyah_mark4_shot044_retime_qc"||qc.sourceAttemptId!==sourceAttemptId||qc.originalSha256!==hash(source)||
  qc.retimedSha256!==hash(local)||qc.approvedWindowMs!==2343||qc.retimedDurationMs!==2375||qc.retainedSourceWindowMs!==500||qc.retimeFactor!==5.6||
  qc.verdict.pass!==true||qc.verdict.confidence!==72||qc.reviewPassed!==false||!qc.verdict.reason.includes("without visible speech")||!Number.isFinite(qc.costUsd))
  throw new Error("The separately reviewed retime or confidence evidence changed.");
const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_type,nb_frames,r_frame_rate,duration","-of","json",local],{encoding:"utf8"})) as {streams:Array<{codec_type:string;nb_frames?:string;r_frame_rate?:string;duration?:string}>};
if(probe.streams.length!==1||probe.streams[0]?.codec_type!=="video"||probe.streams[0]?.nb_frames!=="57"||probe.streams[0]?.r_frame_rate!=="24/1"||Math.abs(Number(probe.streams[0]?.duration)-2.375)>0.002)
  throw new Error("The local hold lost its verified 57 silent picture frames.");
const [{getDb},{readLanguageEditionPlan},{productionAuthorization,bindAttemptRevision,recordMediaAcceptance},{acceptFinalVideoCandidate}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition.js"),import("../src/pipeline/creative-direction/crew-store.js"),import("../src/pipeline/media-generation/final-video.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved target picture correspondence changed.");
const prior=db.prepare("SELECT status,result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video' AND provider='ltx_local'").get(sourceAttemptId,shotId) as {status:string;result_asset_path:string}|undefined;
if(prior?.status!=="hold_for_review"||join(root,"assets",prior.result_asset_path)!==source||db.prepare("SELECT id FROM clips WHERE shot_id=?").get(shotId))
  throw new Error("The retained source take changed or a picture is already selected.");
const authorization=productionAuthorization(db,root,projectId);authorization.assertCurrent();
copyFileSync(local,output);
const attemptId=randomUUID(),reviewNoteId=randomUUID(),now=Date.now();
const reason="John visibly speaks in both full LTX takes, but the first 0.5 seconds of the audio-off retry shows the approved three-person quiet reaction with closed lips. A local 5.6x temporal retime with optical-flow interpolation provides the exact 2.343-second picture beat without new dialogue, action or people. Independent short-clip QC found no visible speech or temporal artifacts, pass=true/confidence=72; the below-threshold confidence is explicitly overridden by frame-by-frame editorial review of the approved window.";
const provenance={kind:"reviewed_local_retime_of_ltx",projectId,shotId,sourceAttemptId,sourcePath:relative(root,source).replaceAll("\\","/"),sourceSha256:qc.originalSha256,sourceWindowMs:[0,500],ffmpegFilter:"trim=start=0:end=0.5,setpts=5.6*(PTS-STARTPTS),minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",outputPath:relativeOutput,outputSha256:hash(output),outputFrames:57,outputDurationMs:2375,approvedPlacementMs:2343,independentReviewPath:relative(root,qcPath).replaceAll("\\","/"),reviewVerdict:qc.verdict,editorialReason:reason,crewRunId:authorization.runId,crewBriefHash:authorization.briefHash,backup:relative(root,backup).replaceAll("\\","/"),liveDatabaseOpened:false};
writeFileSync(sidecar,JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  const changed=db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=? AND shot_id=? AND status='hold_for_review'").run(sourceAttemptId,shotId);
  if(Number(changed.changes)!==1)throw new Error("The second failed full take changed before selection.");
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,'ltx_local','ltx-2.5-fast/local-editorial-retime','generate_final_video','720p',?,'hold_for_review',?,0,?)")
    .run(attemptId,shotId,`Reviewed local temporal retime of ${sourceAttemptId}. ${reason}`,relativeOutput,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES(?,?,?,?,?)").run(randomUUID(),projectId,attemptId,qc.costUsd,now);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'shot',?,'qc',?,1,?)")
    .run(reviewNoteId,projectId,shotId,`Producer-delegated editorial selection for local LTX retime ${attemptId}. ${reason} Output SHA256 ${provenance.outputSha256}. Exact source and filter are in ${relative(root,sidecar)}.`,now);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,'review_local_retime',?,?,?)")
    .run(randomUUID(),projectId,sequence,JSON.stringify({attemptId,reviewNoteId,...provenance}),`meyah-mark4-shot044-local-retime:${attemptId}`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const accepted=acceptFinalVideoCandidate(db,projectId,attemptId,2343);
recordMediaAcceptance(db,projectId,attemptId,reviewNoteId);
writeFileSync(receiptPath,JSON.stringify({attemptId,reviewNoteId,clipId:accepted.clipId,...provenance},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({attemptId,clipId:accepted.clipId,outputPath:output,outputSha256:provenance.outputSha256,receiptPath,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
