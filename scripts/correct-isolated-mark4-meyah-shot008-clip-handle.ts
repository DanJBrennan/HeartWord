/** Narrow correction: shot 8's accepted raw take must use its approved 4.094s placement. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not isolated");
process.env.HEARTWORD_DATA_DIR=root;
const [{getDb},{readLanguageEditionPlan}]=await Promise.all([import("../src/db/client.js"),import("../src/pipeline/language-edition.js")]);
const db=getDb();
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="ae96ed8d-d4e7-457e-b309-3390d2a3b362";
const clipId="5db78fc3-031c-483b-b347-4e3e6193d1a6",attemptId="02b92e91-e936-42f3-b0e3-a68e47d0932a";
const plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")throw Error("Approved plan changed");
const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
  {items:Array<{targetShotId:string;durationMs:number;treatment:string}>};
const planned=worklist.items.find(x=>x.targetShotId===shotId&&x.treatment==="needs_coverage");
if(planned?.durationMs!==4094)throw Error("Approved shot 8 duration changed");
const old=db.prepare(`SELECT c.timeline_start_ms startMs,c.timeline_end_ms endMs,ga.status,ga.result_asset_path path
  FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
  WHERE c.id=? AND c.shot_id=? AND ga.id=? AND ga.operation='generate_final_video' AND ga.provider='ltx_local'`)
  .get(clipId,shotId,attemptId) as {startMs:number;endMs:number;status:string;path:string}|undefined;
if(!old||old.startMs!==0||old.endMs!==8042||old.status!=="accepted")throw Error("Shot 8 clip no longer matches reviewed 8-second take");
const media=resolve(root,"assets",old.path),mediaRel=relative(resolve(root,"assets"),media);
if(mediaRel.startsWith("..")||!existsSync(media))throw Error("Accepted clip media missing");
const mediaSha256=createHash("sha256").update(readFileSync(media)).digest("hex");
const backupPath=join(root,"review","heartword.before-shot008-handle-correction-20261026.sqlite");
const receiptPath=join(root,"review","meyah-mark4-shot008-clip-handle-correction-20261026.json");
if(existsSync(receiptPath))throw Error("Prior correction receipt exists; reconcile before retrying");
if(existsSync(backupPath)){
  const saved=new DatabaseSync(backupPath,{readOnly:true});
  try{
    const savedRow=saved.prepare("SELECT timeline_start_ms startMs,timeline_end_ms endMs FROM clips WHERE id=?")
      .get(clipId) as {startMs:number;endMs:number}|undefined;
    if(savedRow?.startMs!==0||savedRow.endMs!==8042)throw Error("Existing backup does not preserve the prior clip handle");
  }finally{saved.close();}
}else await backup(db,backupPath);
const backupSha256=createHash("sha256").update(readFileSync(backupPath)).digest("hex");
const now=Date.now(),commandId=randomUUID(),reviewId=randomUUID();
db.exec("BEGIN IMMEDIATE");
try{
  const n=db.prepare("UPDATE clips SET timeline_end_ms=? WHERE id=? AND timeline_start_ms=0 AND timeline_end_ms=8042")
    .run(planned.durationMs,clipId).changes;
  if(n!==1)throw Error("Clip changed before correction");
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?")
    .get(projectId) as {n:number}).n);
  db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    VALUES(?,?,?,'correct_edition_clip_handle',?,?,?)`)
    .run(commandId,projectId,sequence,JSON.stringify({planHash:plan.hash,shotId,clipId,attemptId,
      oldDurationMs:8042,approvedPlacementDurationMs:planned.durationMs,mediaSha256,
      reason:"Trim accepted eight-second local take to Dan's approved source-clock 4.094-second picture placement; preserve raw media and original acceptance."}),
      "meyah-mark4-shot008-placement-4094-20261026",now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?,'shot',?,'qc',?,1,?)`)
    .run(reviewId,projectId,shotId,"Codex corrected the selected shot 8 clip handle from 8042 ms to the approved 4094 ms placement. Raw LTX take and initial acceptance remain retained.",now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const check=db.prepare("PRAGMA quick_check").get() as {quick_check:string};
if(check.quick_check!=="ok")throw Error("SQLite quick_check failed after correction");
const receipt={kind:"isolated_meyah_mark4_shot008_clip_handle_correction",projectId,planHash:plan.hash,
  shotId,clipId,attemptId,oldDurationMs:8042,approvedPlacementDurationMs:planned.durationMs,mediaSha256,
  backupPath,backupSha256,commandId,quickCheck:check.quick_check,liveDatabaseOpened:false,providerRequests:0};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt,null,2));
