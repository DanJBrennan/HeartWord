/** Register the exact completed shot-29 Mac draft after SCP failed.
 * This does no generation and never reads the live HeartWord data root. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"), rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not the isolated Meyah root");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId="632e9a87-93d3-49cc-a3a0-394e0f8ee121";
const attemptId="0a71d833-7655-4ad9-9b6c-44bfac6c73ae";
const generationId="43829cc9-bb6f-461d-925c-d7d09f6d58de";
const prefix=`${shotId}-draft-${attemptId}-ltx-${generationId}.mp4`;
const videoDir=join(root,"assets","generated","video");
const raw=join(videoDir,`${prefix.slice(0,-4)}.raw.mp4`);
const output=join(videoDir,prefix);
const metadataPath=`${output}.json`;
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const expectedRawSha="cea6f3838d5af6c023c12fb3ec9a7266f2800a200ee560dd73db37b0264d3abb";
if(sha(raw)!==expectedRawSha)throw Error("Recovered raw bytes differ from completed Mac output");
const metadataBytes=readFileSync(metadataPath);
const metadata=JSON.parse(metadataBytes.toString("utf8")) as {
  generationId:string;shotId:string;status:string;error:string;prompt:string;model:string;resolution:string;
  sourceKeyframe:string;sourceKeyframeSha256:string;remoteOutputPath:string;localOutputPath:string;
  productionRevision:{runId:string;briefHash:string};request:{audio:boolean};
};
if(metadata.generationId!==generationId||metadata.shotId!==`${shotId}-draft-${attemptId}`||
  metadata.status!=="failed"||!metadata.error.startsWith("LTX SCP transfer failed")||
  metadata.remoteOutputPath!=="/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/ltx2_video_20261026_164127_c973e5d1.mp4"||
  resolve(metadata.localOutputPath)!==output||metadata.request.audio!==false||
  sha(join(root,"assets",metadata.sourceKeyframe))!==metadata.sourceKeyframeSha256||
  metadata.sourceKeyframeSha256!=="c4566f142d31e98dda58adc8924d5eb55d3b1f3d5eb73d8f6fe58c09a80efe0e")
  throw Error("Completed LTX metadata/source differs from reconciled draft");
if(existsSync(output))throw Error("Recovery output exists; inspect before replay");
const [{getDb},{productionAuthorization,bindAttemptRevision},{prepareLtxVideoOutput}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/providers/ltx/output.js")]);
const db=getDb(),auth=productionAuthorization(db,root,projectId);
auth.assertCurrent();
if(auth.runId!==metadata.productionRevision.runId||auth.briefHash!==metadata.productionRevision.briefHash)
  throw Error("Completed preview belongs to another production revision");
if(db.prepare("SELECT id FROM generation_attempts WHERE id=?").get(attemptId))throw Error("Draft already registered");
const properties=await prepareLtxVideoOutput(raw,output,{audioMode:"none"});
if(!properties.audioRemoved||properties.width!==1280||properties.height!==704||properties.frames!==121)
  throw Error("Recovered output is not the expected silent five-second 720p take");
const outputSha=sha(output),now=Date.now();
db.exec("BEGIN IMMEDIATE");
try {
  auth.assertCurrent();
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES(?,?,?,?,'generate_draft',?,?,'hold_for_review',?,0,?)`)
    .run(attemptId,shotId,"ltx_local",metadata.model,metadata.resolution,metadata.prompt,
      relative(join(root,"assets"),output).replaceAll("\\","/"),now);
  bindAttemptRevision(db,projectId,attemptId,auth);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES(?,?,?,0,?)")
    .run(randomUUID(),projectId,attemptId,now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?,'shot',?,'qc',?,0,?)`)
    .run(randomUUID(),projectId,shotId,
      `Recovered completed LTX draft ${attemptId} after SCP failure. Mac/local raw SHA256 ${expectedRawSha}; silent output SHA256 ${outputSha}. Review before choosing.`,now);
  db.exec("COMMIT");
} catch(error) { db.exec("ROLLBACK"); throw error; }
const receipt={kind:"isolated_meyah_mark4_completed_ltx_draft_recovery",projectId,shotId,attemptId,generationId,
  status:"held_for_review",macOutput:metadata.remoteOutputPath,rawSha256:expectedRawSha,outputSha256:outputSha,
  originalMetadataSha256:createHash("sha256").update(metadataBytes).digest("hex"),outputProperties:properties,
  productionRevision:metadata.productionRevision,providerPostRepeated:false,liveDatabaseOpened:false};
writeFileSync(join(root,"review","meyah-mark4-shot029-ltx-draft-recovery-20261026.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt,null,2));
