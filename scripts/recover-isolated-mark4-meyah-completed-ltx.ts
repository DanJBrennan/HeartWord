/** Re-register one completed local LTX take after its final DB write lost a lock. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { productionAuthorization } from "../src/pipeline/creative-direction/crew-store.js";
import { generateNonSpeakingVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { createVideoProviders } from "../src/providers/video-selection.js";
import type { ShotRequest, VideoGenerationOptions, VideoProvider } from "../src/providers/types.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah project may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",[shotId,generationId]=process.argv.slice(2);
if(!shotId||!generationId||!/^[a-f0-9-]{36}$/.test(shotId)||!/^[a-f0-9-]{36}$/.test(generationId))
  throw new Error("Usage: recover-isolated-mark4-meyah-completed-ltx <target-shot-id> <generation-id>");
const assets=join(root,"assets"),outputRel=join("generated","video",`${shotId}-ltx-${generationId}.mp4`),output=join(assets,outputRel);
const audioRel=`${outputRel}.ambience.wav`,audio=join(assets,audioRel),metadataPath=`${output}.json`;
const receiptPath=join(root,"review",`meyah-mark4-ltx-completed-recovery-${generationId}.json`);
const backup=join(root,"review",`heartword.before-ltx-recovery-${generationId}.sqlite`);
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
if(!existsSync(backup)||!existsSync(output)||!existsSync(audio)||!existsSync(metadataPath))
  throw new Error("An isolated backup, completed LTX video, ambience and provider sidecar are required.");
const metadataBytes=readFileSync(metadataPath),metadata=JSON.parse(metadataBytes.toString("utf8")) as {
  generationId:string;shotId:string;provider:string;model:string;status:string;prompt:string;requestedPrompt:string;
  resolution:string;durationSeconds:number;fps:number;sourceKeyframe:string;sourceKeyframeSha256:string;
  localOutputPath:string;audioMode:string;remoteOutputPath:string;productionRevision:{runId:string;briefHash:string};
  output:{width:number;height:number;frames:number;durationSeconds:number;frameRate:string};
  ambientAudio:{path:string;status:string};
};
if(metadata.generationId!==generationId||metadata.shotId!==shotId||metadata.provider!=="ltx_local"||metadata.model!=="ltx-2.5-fast"||
  metadata.status!=="complete"||metadata.resolution!=="720p"||metadata.durationSeconds!==8||metadata.fps!==24||
  metadata.audioMode!=="ambient"||resolve(metadata.localOutputPath)!==output||metadata.ambientAudio.path.replaceAll("\\","/")!==audioRel.replaceAll("\\","/")||
  metadata.output.frames!==193||metadata.output.width!==1280||metadata.output.height!==704||
  Math.abs(metadata.output.durationSeconds-8.041667)>0.01)
  throw new Error("Completed local LTX metadata differs from the exact expected take.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")throw new Error("Approved picture plan changed.");
const frame=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shotId) as {result_asset_path:string}|undefined;
if(frame?.result_asset_path!==metadata.sourceKeyframe||hash(join(assets,metadata.sourceKeyframe))!==metadata.sourceKeyframeSha256)
  throw new Error("The accepted scene start frame changed.");
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' LIMIT 1").get(shotId))
  throw new Error("A final-video attempt already exists; inspect it before recovery.");
const videoProbe=JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=nb_frames,r_frame_rate,duration","-of","json",output],{encoding:"utf8"})) as
  {streams:Array<{nb_frames:string;r_frame_rate:string;duration:string}>};
if(videoProbe.streams[0]?.nb_frames!=="193"||videoProbe.streams[0].r_frame_rate!=="24/1"||
  Math.abs(Number(videoProbe.streams[0].duration)-8.041667)>0.01)throw new Error("Retained local video fails frame and duration checks.");
const authorization=productionAuthorization(db,root,projectId);
if(authorization.runId!==metadata.productionRevision.runId||authorization.briefHash!==metadata.productionRevision.briefHash)
  throw new Error("Completed LTX work belongs to a different crew revision.");
const job=db.prepare("SELECT id,status,progress_json FROM video_generation_jobs WHERE project_id=? AND shot_id=? AND backend='ltx' ORDER BY updated_at DESC LIMIT 1")
  .get(projectId,shotId) as {id:string;status:string;progress_json:string}|undefined;
if(!job)throw new Error("The original local job is missing.");
const progress=JSON.parse(job.progress_json) as {phase:string;status:string};
if(progress.phase!=="complete"||progress.status!=="complete"||!(["active","error"].includes(job.status)))
  throw new Error("The exact job is not a completed abandoned local request.");
const outputSha256=hash(output),ambienceSha256=hash(audio),metadataSha256=createHash("sha256").update(metadataBytes).digest("hex");
const receipt={kind:"isolated_meyah_mark4_completed_ltx_final_recovery",projectId,shotId,generationId,oldJobId:job.id,
  outputRel,outputSha256,ambienceRel:audioRel,ambienceSha256,metadataSha256,
  productionRevision:metadata.productionRevision,remoteOutputPath:metadata.remoteOutputPath,
  backup:relative(root,backup).replaceAll("\\","/"),providerPostRepeated:false,liveDatabaseOpened:false};
if(!existsSync(receiptPath)){
  if(job.status!=="active")throw new Error("An error job without its recovery receipt must be reconciled manually.");
  writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
  db.prepare("UPDATE video_generation_jobs SET status='error',metadata_json=?,updated_at=? WHERE id=? AND status='active'")
    .run(JSON.stringify({reconciled:true,completedLocalOutput:outputRel,recoveryReceipt:relative(root,receiptPath).replaceAll("\\","/")}),Date.now(),job.id);
}else{
  const prior=JSON.parse(readFileSync(receiptPath,"utf8"));
  if(job.status!=="error"||JSON.stringify(prior)!==JSON.stringify(receipt))throw new Error("Recovery receipt or job status changed.");
}
const recovered:VideoProvider={async generateFinal(request:ShotRequest,opts?:VideoGenerationOptions){
  request.authorizeSubmission?.();
  if(request.shotId!==shotId||request.prompt!==metadata.requestedPrompt||
    request.productionRevision?.runId!==metadata.productionRevision.runId||
    request.productionRevision?.briefHash!==metadata.productionRevision.briefHash||
    opts?.startFrame?.path!==metadata.sourceKeyframe||opts.durationSeconds!==8||opts.resolution!=="720p")
    throw new Error("Current final-video request differs from the completed LTX request; no provider call is allowed.");
  opts.onProgress?.({phase:"recovered_completed_local_output",percentage:100,currentStep:8,totalSteps:8});
  return {status:"accepted",media:{path:outputRel},ambientAudio:{path:audioRel},cost:{usd:0},
    provenance:{provider:"ltx_local",model:metadata.model,prompt:metadata.prompt},
    metadata:{...metadata,status:"completed_recovered",recoveryReceipt:relative(root,receiptPath).replaceAll("\\","/"),
      outputSha256,ambienceSha256,metadataSha256}};
}};
const providers=createVideoProviders("ltx");providers.ltx=recovered;
const result=await generateNonSpeakingVideoCandidate(db,projectId,shotId,providers,{durationSeconds:8});
console.log(JSON.stringify({receipt,result,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
