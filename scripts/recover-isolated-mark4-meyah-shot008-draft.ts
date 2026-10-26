/** Register the one completed Mac LTX take whose SCP download failed.
 * Never submits generation; exact bytes and the approved revision are pinned. */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024");
const rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not the isolated data root");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId="ae96ed8d-d4e7-457e-b309-3390d2a3b362";
const attemptId="9f063998-520d-49c4-b595-94e987632267";
const generationId="33aa85f9-586a-469c-a83b-aa448a0ff398";
const prefix=`${shotId}-draft-${attemptId}-ltx-${generationId}.mp4`;
const metadataPath=join(root,"assets","generated","video",`${prefix}.json`);
const raw=join(root,"review","shot008-recovered-transfer.mp4");
const output=join(root,"assets","generated","video",prefix);
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const expectedRawSha="ce380d12ccc0d7abbfcbf475883aa32d8acaeacb462045e269caa366b8d5b619";
const rawSha=sha(raw);
if(rawSha!==expectedRawSha)throw Error("Recovered transfer differs from the Mac SHA256");
const metadataBytes=readFileSync(metadataPath);
const metadata=JSON.parse(metadataBytes.toString("utf8")) as {
  generationId:string;shotId:string;status:string;error:string;prompt:string;model:string;resolution:string;
  sourceKeyframe:string;sourceKeyframeSha256:string;remoteOutputPath:string;localOutputPath:string;
  productionRevision:{runId:string;briefHash:string};request:{audio:boolean};
};
if(metadata.generationId!==generationId||metadata.shotId!==`${shotId}-draft-${attemptId}`||
  metadata.status!=="failed"||!metadata.error.startsWith("LTX SCP transfer failed")||
  metadata.remoteOutputPath!=="/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/ltx2_video_20261026_133933_286dbcb9.mp4"||
  resolve(metadata.localOutputPath)!==output||metadata.request.audio!==false||
  sha(join(root,"assets",metadata.sourceKeyframe))!==metadata.sourceKeyframeSha256)
  throw Error("Completed LTX metadata/source differs from the reconciled take");
if(existsSync(output))throw Error("Recovered output already exists; inspect before continuing");
const [{getDb},{productionAuthorization,bindAttemptRevision},{prepareLtxVideoOutput}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/providers/ltx/output.js")]);
const db=getDb();
const auth=productionAuthorization(db,root,projectId);
auth.assertCurrent();
if(auth.runId!==metadata.productionRevision.runId||auth.briefHash!==metadata.productionRevision.briefHash)
  throw Error("The completed preview belongs to a different production revision");
if(db.prepare("SELECT id FROM generation_attempts WHERE id=?").get(attemptId))throw Error("Draft already registered");
const properties=await prepareLtxVideoOutput(raw,output,{audioMode:"none"});
if(!properties.audioRemoved||properties.width!==1280||properties.height!==704||properties.frames!==121)
  throw Error("Recovered video did not match the expected silent 720p five-second take");
const outputSha=sha(output), now=Date.now();
db.exec("BEGIN IMMEDIATE");
try{
  auth.assertCurrent();
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES(?,?,? ,?,'generate_draft',?,?,'hold_for_review',?,0,?)`)
    .run(attemptId,shotId,"ltx_local",metadata.model,metadata.resolution,metadata.prompt,
      relative(join(root,"assets"),output).replaceAll("\\","/"),now);
  bindAttemptRevision(db,projectId,attemptId,auth);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES(?,?,?,0,?)")
    .run(randomUUID(),projectId,attemptId,now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?, 'shot',?,'qc',?,0,?)`)
    .run(randomUUID(),projectId,shotId,
      `Recovered completed LTX draft ${attemptId} after SCP failure. Mac and local raw SHA256 ${rawSha}; silent output SHA256 ${outputSha}. Review before choosing.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const receipt={kind:"isolated_meyah_mark4_completed_ltx_draft_recovery",projectId,shotId,attemptId,generationId,
  status:"held_for_review",macOutput:metadata.remoteOutputPath,rawSha256:rawSha,outputSha256:outputSha,
  originalMetadataSha256:createHash("sha256").update(metadataBytes).digest("hex"),outputProperties:properties,
  productionRevision:metadata.productionRevision,providerPostRepeated:false,liveDatabaseOpened:false};
writeFileSync(join(root,"review","meyah-mark4-shot008-ltx-draft-recovery-20261026.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt,null,2));
