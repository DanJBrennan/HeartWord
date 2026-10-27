/** Register one already-completed local LTX take after its DB insert was locked.
 * This script never submits a Mac generation request. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShotRequest, VideoGenerationOptions, VideoProvider } from "../src/providers/types.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not the isolated data root");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="23e06237-a507-4b8a-b941-75b5c37cbac3";
const jobId="c14c4885-7cfb-43da-b9b6-0bd06a4ed92d",generationId="4794200e-3ebf-45b9-85aa-fbce31f1ba3d";
const output=join(root,"assets","generated","video",`${shotId}-ltx-${generationId}.mp4`),metadataPath=`${output}.json`;
const audio=`${output}.ambience.wav`,receiptPath=join(root,"review","meyah-mark4-shot093-final-ltx-recovery-20261027.json");
const remote="/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/ltx2_video_20261026_210126_fb3a031a.mp4";
const expectedSha="1091a2411e049d04f2902e7e42476d074a86bae3f3bb986fdc431bbd0c97075d";
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const metadataBytes=readFileSync(metadataPath),metadata=JSON.parse(metadataBytes.toString("utf8")) as {
  generationId:string;shotId:string;status:string;prompt:string;requestedPrompt:string;model:string;
  resolution:string;durationSeconds:number;fps:number;sourceKeyframe:string;sourceKeyframeSha256:string;
  localOutputPath:string;audioMode:string;remoteOutputPath:string;productionRevision:{runId:string;briefHash:string};
  output:{width:number;height:number;frames:number;durationSeconds:number;backendAudioIncluded:boolean};
};
if(metadata.generationId!==generationId||metadata.shotId!==shotId||metadata.status!=="complete"||
  metadata.remoteOutputPath!==remote||resolve(metadata.localOutputPath)!==output||
  metadata.audioMode!=="ambient"||metadata.resolution!=="720p"||metadata.durationSeconds!==8||metadata.fps!==24||
  metadata.output.width!==1280||metadata.output.height!==704||metadata.output.frames!==193||
  Math.abs(metadata.output.durationSeconds-8.041667)>0.01||!metadata.output.backendAudioIncluded||
  sha(join(root,"assets",metadata.sourceKeyframe))!==metadata.sourceKeyframeSha256||
  !existsSync(audio)||sha(output)!==expectedSha||existsSync(receiptPath))
  throw Error("Completed local take, source, or recovery state differs from the verified receipt");
const remoteHash=execFileSync("ssh",["-o","BatchMode=yes","-o","ConnectTimeout=10","danieljbrennan@192.168.77.2",
  `shasum -a 256 '${remote}'`],{encoding:"utf8",timeout:20000}).trim().split(/\s+/)[0];
if(remoteHash!==expectedSha)throw Error("Mac output does not match the downloaded local picture");
const [{getDb},{productionAuthorization},{createVideoProviders},{generateNonSpeakingVideoCandidate}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/providers/video-selection.js"),import("../src/pipeline/media-generation/final-video.js")]);
const db=getDb(),auth=productionAuthorization(db,root,projectId);auth.assertCurrent();
if(auth.runId!==metadata.productionRevision.runId||auth.briefHash!==metadata.productionRevision.briefHash)
  throw Error("The completed render belongs to a different production revision");
const job=db.prepare("SELECT status FROM video_generation_jobs WHERE id=? AND shot_id=?").get(jobId,shotId) as {status:string}|undefined;
if(job?.status!=="active"||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video'").get(shotId))
  throw Error("The exact abandoned job is unavailable or a final attempt is already registered");
const receipt={kind:"isolated_meyah_mark4_completed_ltx_final_recovery",projectId,shotId,generationId,jobId,
  macOutput:remote,macSha256:expectedSha,localOutputSha256:sha(output),ambientWavSha256:sha(audio),
  metadataSha256:createHash("sha256").update(metadataBytes).digest("hex"),sourceKeyframeSha256:metadata.sourceKeyframeSha256,
  productionRevision:metadata.productionRevision,providerPostRepeated:false,liveDatabaseOpened:false};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("UPDATE video_generation_jobs SET status='error',metadata_json=?,updated_at=? WHERE id=? AND status='active'")
    .run(JSON.stringify({reconciled:true,originalError:"database is locked",completedMacOutput:remote,
      recoveryReceipt:relative(root,receiptPath).replaceAll("\\","/")}),Date.now(),jobId);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?,'shot',?,'qc',?,1,?)`).run(randomUUID(),projectId,shotId,
      `The original LTX request completed once, then its final-attempt DB insert was locked. Exact Mac and local SHA256 ${expectedSha} match. Recovery receipt ${relative(root,receiptPath)}; no generation POST repeated.`,Date.now());
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const relAsset=(path:string)=>relative(join(root,"assets"),path).replaceAll("\\","/");
const recovered:VideoProvider={async generateFinal(request:ShotRequest,opts:VideoGenerationOptions={}){
  request.authorizeSubmission?.();
  if(request.shotId!==shotId||request.prompt!==metadata.requestedPrompt||
    request.productionRevision?.runId!==metadata.productionRevision.runId||
    request.productionRevision?.briefHash!==metadata.productionRevision.briefHash||
    opts.startFrame?.path!==metadata.sourceKeyframe||opts.durationSeconds!==8||opts.resolution!=="720p")
    throw Error("Current final-video request differs from the one completed on the Mac");
  opts.onProgress?.({phase:"recovered_completed_mac_output",percentage:100,currentStep:8,totalSteps:8});
  return {status:"accepted",media:{path:relAsset(output)},ambientAudio:{path:relAsset(audio)},cost:{usd:0},
    provenance:{provider:"ltx_local",model:metadata.model,prompt:metadata.prompt},
    metadata:{...metadata,status:"completed_recovered",recoveryReceipt:relative(root,receiptPath).replaceAll("\\","/"),
      outputSha256:expectedSha,ambientWavSha256:sha(audio)}};
}};
const providers=createVideoProviders("ltx");providers.ltx=recovered;
const registered=await generateNonSpeakingVideoCandidate(db,projectId,shotId,providers,{durationSeconds:8});
console.log(JSON.stringify({receipt,registered},null,2));
