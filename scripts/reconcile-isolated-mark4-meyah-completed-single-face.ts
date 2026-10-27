/** Register an exact saved Kling Avatar result after a local SQLite commit collision.
 * This never makes a provider request or accepts the returned picture. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { editionSpeakingDonorKeyframe, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision } from "../src/pipeline/creative-direction/crew-store.js";
import { settleAvatarSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=join(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah chapter may be reconciled.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId=process.argv[2];
if(!shotId||!/^[a-f0-9-]{36}$/.test(shotId))throw new Error("Usage: reconcile-isolated-mark4-meyah-completed-single-face <shot-id>");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Approved source-clock map changed.");
const outstanding=db.prepare(`SELECT json_extract(r.payload,'$.reservationId') id,
    json_extract(r.payload,'$.upperBoundUsd') upper_bound
  FROM edit_commands r WHERE r.project_id=? AND r.command_type='reserve_avatar_spend'
    AND json_extract(r.payload,'$.shotId')=? AND NOT EXISTS (
      SELECT 1 FROM edit_commands s WHERE s.project_id=r.project_id
        AND s.command_type='settle_avatar_spend'
        AND json_extract(s.payload,'$.reservationId')=json_extract(r.payload,'$.reservationId'))`).all(projectId,shotId) as
  Array<{id:string;upper_bound:number}>;
if(outstanding.length!==1)throw new Error("Need one exact outstanding Avatar reservation.");
const requestId=outstanding[0]!.id;
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'").get(shotId))
  throw new Error("A lip-sync attempt is already registered.");
const dir=join(root,"assets","generated","lipsync");
const found=readdirSync(dir).filter(name=>name.endsWith(".mp4.json")).flatMap(name=>{
  const path=join(dir,name),saved=JSON.parse(readFileSync(path,"utf8")) as {requestId:string};
  return saved.requestId===requestId?[{path,saved}]:[];
});
if(found.length!==1)throw new Error("Exact returned Kling task sidecar is absent or ambiguous; do not resubmit.");
const sidecar=found[0]!.saved as {
  taskId:string;requestId:string;image:{sha256:string;path:string};
  audio:{submittedSha256:string;submittedPath:string};
  productionRevision:{runId:string;briefHash:string};estimatedUsd:number;
};
const sidecarPath=found[0]!.path,video=sidecarPath.slice(0,-5),videoRel=relative(join(root,"assets"),video);
if(!existsSync(video)||videoRel===".."||videoRel.startsWith(`..${sep}`)||!/^\d+\.mp4$/.test(video.split(/[\\/]/).at(-1)!))
  throw new Error("The exact returned video is missing or outside isolated assets.");
if(!Number.isFinite(sidecar.estimatedUsd)||sidecar.estimatedUsd<=0||sidecar.estimatedUsd>outstanding[0]!.upper_bound)
  throw new Error("Returned provider cost exceeds the reserved maximum.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const donor=editionSpeakingDonorKeyframe(db,root,projectId,shotId);
if(!donor||donor.sha256!==sidecar.image.sha256)
  throw new Error("Submitted original keyframe changed.");
const submitted=resolve(root,"assets",sidecar.audio.submittedPath),audioRel=relative(join(root,"assets"),submitted);
if(audioRel===".."||audioRel.startsWith(`..${sep}`)||!existsSync(submitted)||hash(submitted)!==sidecar.audio.submittedSha256)
  throw new Error("Submitted approved cast audio changed.");
const binding=db.prepare("SELECT source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shotId) as {source_start_ms:number;source_end_ms:number}|undefined;
if(!binding)throw new Error("Reviewed speech binding is missing.");
const durationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","stream=duration","-select_streams","v:0","-of","csv=p=0",video],{encoding:"utf8"}).trim())*1000);
if(durationMs<binding.source_end_ms-binding.source_start_ms)
  throw new Error("Saved returned picture cannot cover the approved speech window.");
const backup=join(root,"review",`heartword.before-single-face-reconciliation-${shotId}.sqlite`);
if(!existsSync(backup))throw new Error("Create and quick-check a fresh isolated database backup first.");
const outputSha256=hash(video),attemptId=randomUUID(),now=Date.now();
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'kling','avatar-image2video','lip_sync',?,'hold_for_review',?,?,?)`)
    .run(attemptId,shotId,`Recovered exact completed Kling Avatar task ${sidecar.taskId}; request ${requestId}; local SQLite collision after returned file.`,
      videoRel.replaceAll("\\","/"),sidecar.estimatedUsd,now);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,sidecar.estimatedUsd,now);
  bindAttemptRevision(db,projectId,attemptId,sidecar.productionRevision);
  settleAvatarSpend(db,projectId,requestId,attemptId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,shotId,`Recovered exact completed Kling Avatar candidate ${attemptId} from task ${sidecar.taskId} and reservation ${requestId}, without a new provider call. Returned picture SHA256 ${outputSha256}; submitted audio SHA256 ${sidecar.audio.submittedSha256}. Picture, lips, words and timing still require review before clip selection.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
console.log(JSON.stringify({attemptId,shotId,taskId:sidecar.taskId,requestId,videoRel:videoRel.replaceAll("\\","/"),
  outputSha256,durationMs,costUsd:sidecar.estimatedUsd,heldForReview:true,newProviderRequests:0,
  quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
