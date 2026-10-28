/** Restore the producer-approved 1.549s use of the retained Mark 4:41 reaction. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backup } from "node:sqlite";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not isolated");
process.env.HEARTWORD_DATA_DIR=root;
const [{getDb},{readLanguageEditionPlan}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition.js")]);
const db=getDb();
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId="1dc77fd9-7b6b-4f7e-94db-e327b64afc69";
const donorShotId="0a8f900e-14c3-4490-b27b-f78ef2429292";
const clipId="dae035d7-0d4c-4ee2-8314-2f5c8447112e";
const attemptId="d1f3e62d-cb17-4edf-9447-a03682f22a7c";
const plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw Error("Approved plan changed");
const proposalPath=join(root,"assets","review","meyah-mark4-storm-shot-review-20261025","assembly-ready-proposal.json");
const proposalBytes=readFileSync(proposalPath);
const proposal=JSON.parse(proposalBytes.toString("utf8")) as {rows:Array<{placement:number;donorShotId:string;
  pipelineTreatment:string;targetStartMs:number;targetEndMs:number;durationMs:number}>};
const approved=proposal.rows.find(row=>row.placement===20);
if(approved?.donorShotId!==donorShotId||approved.pipelineTreatment!=="reuse_picture"||
  approved.targetStartMs!==788136||approved.targetEndMs!==789685||approved.durationMs!==1549)
  throw Error("The approved 4:41 reaction placement changed");
const mapped=JSON.parse(String((db.prepare(`SELECT payload FROM edit_commands WHERE project_id=?
  AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1`)
  .get(projectId) as {payload:string}).payload)) as {planHash:string;shots:Array<{donorShotId:string;targetShotId:string|null;treatment:string}>};
if(mapped.planHash!==plan.hash||mapped.shots[143]?.donorShotId!==donorShotId||
  mapped.shots[143]?.targetShotId!==shotId||mapped.shots[143]?.treatment!=="reuse_picture")
  throw Error("The saved target correspondence differs from the reviewed storm map");
const old=db.prepare(`SELECT c.timeline_start_ms startMs,c.timeline_end_ms endMs,ga.status,ga.result_asset_path path
  FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
  WHERE c.id=? AND c.shot_id=? AND ga.id=? AND ga.operation='generate_final_video'
    AND ga.provider='retained_edition_picture'`).get(clipId,shotId,attemptId) as
  {startMs:number;endMs:number;status:string;path:string}|undefined;
if(!old||old.startMs!==0||old.endMs!==8000||old.status!=="accepted")
  throw Error("Retained reaction clip no longer matches its original eight-second handle");
const media=resolve(root,"assets",old.path),mediaRel=relative(resolve(root,"assets"),media);
if(mediaRel.startsWith("..")||!existsSync(media))throw Error("Retained clip media missing");
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const mediaSha256=sha(readFileSync(media));
const backupPath=join(root,"review","heartword.before-shot144-handle-correction-20261027.sqlite");
const receiptPath=join(root,"review","meyah-mark4-shot144-clip-handle-correction-20261027.json");
if(existsSync(backupPath)||existsSync(receiptPath))throw Error("Prior correction evidence exists; inspect before retrying");
await backup(db,backupPath);
const backupSha256=sha(readFileSync(backupPath));
const now=Date.now(),commandId=randomUUID(),reviewId=randomUUID();
db.exec("BEGIN IMMEDIATE");
try{
  const n=db.prepare("UPDATE clips SET timeline_end_ms=? WHERE id=? AND timeline_start_ms=0 AND timeline_end_ms=8000")
    .run(approved.durationMs,clipId).changes;
  if(n!==1)throw Error("Clip changed before correction");
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?")
    .get(projectId) as {n:number}).n);
  db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    VALUES(?,?,?,'correct_edition_clip_handle',?,?,?)`).run(commandId,projectId,sequence,
      JSON.stringify({planHash:plan.hash,shotId,donorShotId,clipId,attemptId,oldDurationMs:8000,
        approvedPlacementDurationMs:approved.durationMs,approvedSourceStartMs:approved.targetStartMs,
        approvedSourceEndMs:approved.targetEndMs,proposalSha256:sha(proposalBytes),mediaSha256,
        reason:"Use only the reviewed 1.549-second group reaction before the unchanged final night sea; retain the original eight-second donor bytes."}),
      "meyah-mark4-shot144-placement-1549-20261027",now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?,'shot',?,'qc',?,1,?)`).run(reviewId,projectId,shotId,
      "Codex corrected placement 144's retained clip handle from 8000 ms to the producer-approved 1549 ms. The donor picture bytes and original acceptance remain in history.",now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const check=db.prepare("PRAGMA quick_check").get() as {quick_check:string};
if(check.quick_check!=="ok")throw Error("SQLite quick_check failed after correction");
const receipt={kind:"isolated_meyah_mark4_shot144_clip_handle_correction",projectId,planHash:plan.hash,
  shotId,clipId,attemptId,oldDurationMs:8000,approvedPlacementDurationMs:approved.durationMs,
  proposalSha256:sha(proposalBytes),mediaSha256,backupPath,backupSha256,commandId,
  quickCheck:check.quick_check,liveDatabaseOpened:false,providerRequests:0};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt,null,2));
