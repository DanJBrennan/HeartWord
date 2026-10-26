/** Register the exact completed Mac LTX final whose local DB progress write
 * failed mid-inference. This never makes another video-generation request. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShotRequest, VideoGenerationOptions, VideoProvider } from "../src/providers/types.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"), rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not the isolated data root");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="ae96ed8d-d4e7-457e-b309-3390d2a3b362";
const generationId="a7dffcac-6048-4dc5-a311-023d847b89f9", oldJobId="cf0736d1-a6f8-4bac-8419-cf75cfafc8ce";
const base=join(root,"assets","generated","video",`${shotId}-ltx-${generationId}`),raw=`${base}.raw.mp4`,output=`${base}.mp4`;
const audio=`${output}.ambience.wav`,metadataPath=`${output}.json`,temp=`${output}.recover.part`;
const receiptPath=join(root,"review","meyah-mark4-shot008-final-ltx-recovery-20261026.json");
const macOutput="/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/ltx2_video_20261026_145004_66af18a7.mp4";
const expectedRawSha="caedcbb14ca55d87339c16b6cb036ac3dd92bbe04032861619bfdf3c8423b87d";
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
if(!existsSync(raw)||sha(raw)!==expectedRawSha)throw Error("Completed Mac transfer hash does not match");
const metadataBytes=readFileSync(metadataPath),metadata=JSON.parse(metadataBytes.toString("utf8")) as {
  generationId:string;shotId:string;status:string;error:string;prompt:string;requestedPrompt:string;model:string;
  resolution:string;durationSeconds:number;fps:number;sourceKeyframe:string;sourceKeyframeSha256:string;
  localOutputPath:string;audioMode:string;productionRevision:{runId:string;briefHash:string};
};
if(metadata.generationId!==generationId||metadata.shotId!==shotId||metadata.status!=="submission_uncertain"||
  metadata.error!=="database is locked"||resolve(metadata.localOutputPath)!==output||
  metadata.audioMode!=="ambient"||metadata.resolution!=="720p"||metadata.durationSeconds!==8||metadata.fps!==24||
  sha(join(root,"assets",metadata.sourceKeyframe))!==metadata.sourceKeyframeSha256)
  throw Error("LTX final metadata or accepted source differs from the reconciled Mac take");
const [{getDb},{productionAuthorization},{prepareLtxVideoOutput},{createVideoProviders},{generateNonSpeakingVideoCandidate}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/providers/ltx/output.js"),import("../src/providers/video-selection.js"),
  import("../src/pipeline/media-generation/final-video.js")]);
const db=getDb(),auth=productionAuthorization(db,root,projectId);auth.assertCurrent();
if(auth.runId!==metadata.productionRevision.runId||auth.briefHash!==metadata.productionRevision.briefHash)
  throw Error("The completed render belongs to a different production revision");
const oldJob=db.prepare("SELECT status FROM video_generation_jobs WHERE id=? AND shot_id=?").get(oldJobId,shotId) as {status:string}|undefined;
if(oldJob?.status!=="active")throw Error("The original progress job is no longer the exact abandoned active job");
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video'").get(shotId))
  throw Error("A final attempt is already registered; do not create another");
if(existsSync(output)||existsSync(audio)||existsSync(temp)||existsSync(receiptPath))throw Error("Recovery outputs already exist; inspect before continuing");
copyFileSync(raw,temp);
const properties=await prepareLtxVideoOutput(temp,output,{audioMode:"ambient",ambientOutput:audio});
if(!properties.backendAudioIncluded||!properties.audio||properties.width!==1280||properties.height!==704||
  properties.frames!==193||!properties.durationSeconds||Math.abs(properties.durationSeconds-8.041667)>0.01)
  throw Error("Recovered Mac video did not match the eight-second final take");
const receipt={kind:"isolated_meyah_mark4_completed_ltx_final_recovery",projectId,shotId,generationId,
  originalJobId:oldJobId,macProgressId:"7fa90ff5",macOutput,macRawSha256:expectedRawSha,
  localRawSha256:sha(raw),localOutputSha256:sha(output),ambientWavSha256:sha(audio),
  originalMetadataSha256:createHash("sha256").update(metadataBytes).digest("hex"),outputProperties:properties,
  productionRevision:metadata.productionRevision,providerPostRepeated:false,liveDatabaseOpened:false};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("UPDATE video_generation_jobs SET status='error',metadata_json=?,updated_at=? WHERE id=? AND status='active'")
    .run(JSON.stringify({reconciled:true,originalError:metadata.error,completedMacOutput:macOutput,recoveryReceipt:relative(root,receiptPath).replaceAll("\\","/")}),Date.now(),oldJobId);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES(?,?, 'shot',?,'qc',?,1,?)`).run(randomUUID(),projectId,shotId,
      `The original LTX job lost a DB progress write during inference. Mac generation 7fa90ff5 completed once; its exact output SHA256 ${expectedRawSha} was transferred and retained. Recovery receipt ${relative(root,receiptPath)}. No provider POST repeated.`,Date.now());
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const relAsset=(path:string)=>relative(join(root,"assets"),path).replaceAll("\\","/");
const recovered:VideoProvider={async generateFinal(request:ShotRequest,opts:VideoGenerationOptions={}){
  request.authorizeSubmission?.();
  if(request.shotId!==shotId||request.prompt!==metadata.requestedPrompt||
    request.productionRevision?.runId!==metadata.productionRevision.runId||
    request.productionRevision?.briefHash!==metadata.productionRevision.briefHash||
    opts.startFrame?.path!==metadata.sourceKeyframe||opts.durationSeconds!==8||opts.resolution!=="720p")
    throw Error("Current final-video request does not match the one completed on the Mac");
  opts.onProgress?.({phase:"recovered_completed_mac_output",percentage:100,currentStep:8,totalSteps:8});
  return {status:"accepted",media:{path:relAsset(output)},ambientAudio:{path:relAsset(audio)},cost:{usd:0},
    provenance:{provider:"ltx_local",model:metadata.model,prompt:metadata.prompt},
    metadata:{...metadata,status:"completed_recovered",remoteOutputPath:macOutput,metadataPath,
      recoveryReceipt:relative(root,receiptPath).replaceAll("\\","/"),rawSha256:expectedRawSha,
      outputSha256:sha(output),ambientWavSha256:sha(audio),...properties}};
}};
const providers=createVideoProviders("ltx");providers.ltx=recovered;
const registered=await generateNonSpeakingVideoCandidate(db,projectId,shotId,providers,{durationSeconds:8});
console.log(JSON.stringify({receipt,registered},null,2));
