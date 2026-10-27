/** Production control for one reviewed Meyah Mark 4 silent coverage shot.
 * Keeps the donor/live database outside this process and preserves every take. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Meyah coverage must stay inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [command,shotId,attemptId]=process.argv.slice(2);
if(!command||!shotId)throw new Error("Usage: run-isolated-mark4-meyah-coverage <status|draft|choose|final|accept> <target-shot-id> [attempt-id|--after-desktop-restart|--after-reconnected-tunnel]");
const [{getDb},{readLanguageEditionPlan},{requireCurrentPlan},{generateShotDraft,chooseShotDraft},{generateNonSpeakingVideoCandidate,acceptFinalVideoCandidate},{createVideoProviders}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/pipeline/media-generation/draft-room.js"),import("../src/pipeline/media-generation/final-video.js"),
  import("../src/providers/video-selection.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Producer-approved shot map changed");
requireCurrentPlan(db,root,projectId);
const mapped=JSON.parse(String((db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1")
  .get(projectId) as {payload:string}).payload)) as {planHash:string;shots:Array<{targetShotId:string|null;treatment:string}>};
if(mapped.planHash!==plan.hash||!mapped.shots.some(row=>row.targetShotId===shotId&&row.treatment==="needs_coverage"))
  throw new Error("Shot is outside approved Meyah silent coverage");
const shot=db.prepare("SELECT needs_lip_sync FROM shots WHERE id=?").get(shotId) as {needs_lip_sync:number}|undefined;
if(shot?.needs_lip_sync!==0)throw new Error("This control is only for silent coverage");
if(command==="status"){
  const attempts=db.prepare("SELECT id,operation,provider,status,result_asset_path,created_at FROM generation_attempts WHERE shot_id=? AND operation IN ('generate','generate_draft','generate_final_video') ORDER BY created_at,id").all(shotId);
  console.log(JSON.stringify({shotId,attempts},null,2));
}else if(command==="draft"){
  const hold=db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND resolved=0 AND note LIKE 'Meyah Mark 4 shot 8 local LTX transport hold%'")
    .get(projectId,shotId) as {id:string}|undefined;
  if(hold&&attemptId!=="--after-desktop-restart"&&attemptId!=="--after-reconnected-tunnel")throw new Error("LTX transport hold: use one bounded recovery preview only after Desktop restart or an exact idle reconciliation of the latest attempt.");
  if(hold&&attemptId==="--after-reconnected-tunnel"){
    const receipt=JSON.parse(readFileSync(join(root,"review","meyah-mark4-shot008-fifth-ltx-reconciliation-20261026.json"),"utf8")) as
      {shotId:string;generationId:string;metadataPath:string;metadataSha256:string;result:string;macProgress:{status:string}};
    const metadataPath=resolve(root,receipt.metadataPath),metadataRel=relative(root,metadataPath);
    if(metadataRel===".."||metadataRel.startsWith(`..${sep}`)||!metadataRel.startsWith(`assets${sep}generated${sep}video${sep}`))
      throw new Error("LTX reconciliation metadata is outside isolated video assets.");
    const metadata=readFileSync(metadataPath);
    const videoDir=join(root,"assets","generated","video");
    const priorDrafts=readdirSync(videoDir)
      .filter(name=>name.startsWith(`${shotId}-draft-`)&&name.endsWith(".mp4.json"));
    const diagnosticFiles=readdirSync(videoDir).filter(name=>name.startsWith("diagnostic-target-prompt-")&&name.endsWith(".mp4.json"));
    const diagnostic=diagnosticFiles.length===1?JSON.parse(readFileSync(join(videoDir,diagnosticFiles[0]!),"utf8")) as
      {status:string;prompt:string;seed:number;sourceKeyframeSha256:string;localOutputPath:string}:null;
    const diagnosticPath=diagnostic?resolve(diagnostic.localOutputPath):null;
    const diagnosticRel=diagnosticPath?relative(videoDir,diagnosticPath):"";
    const failed=JSON.parse(metadata.toString("utf8")) as {prompt:string;seed:number;sourceKeyframeSha256:string};
    if(shotId!=="ae96ed8d-d4e7-457e-b309-3390d2a3b362"||receipt.shotId!==shotId||
      receipt.generationId!=="887fd1db-b164-4fed-aa87-6772b907d4a2"||receipt.result!=="no_target_video"||priorDrafts.length!==5||
      receipt.macProgress.status!=="complete"||createHash("sha256").update(metadata).digest("hex")!==receipt.metadataSha256||
      diagnostic?.status!=="complete"||diagnostic.prompt!==failed.prompt||diagnostic.seed!==failed.seed||
      diagnostic.sourceKeyframeSha256!==failed.sourceKeyframeSha256||!diagnosticPath||!diagnosticRel||
      diagnosticRel===".."||diagnosticRel.startsWith(`..${sep}`)||!diagnosticRel.endsWith(".mp4")||!existsSync(diagnosticPath))
      throw new Error("The reconciled target LTX attempt changed; inspect it before another draft.");
  }
  const providers=createVideoProviders("ltx");
  const result=await generateShotDraft(db,projectId,shotId,providers.draft);
  if(result.status==="draft"&&hold)db.prepare("UPDATE review_notes SET resolved=1 WHERE id=? AND resolved=0").run(hold.id);
  console.log(JSON.stringify(result,null,2));
}else if(command==="choose"){
  if(!attemptId)throw new Error("Choose needs a reviewed draft attempt ID");
  console.log(JSON.stringify(chooseShotDraft(db,projectId,attemptId),null,2));
}else if(command==="final"){
  const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
    {items:Array<{targetShotId:string;durationMs:number;treatment:string}>};
  const item=worklist.items.find(row=>row.targetShotId===shotId&&row.treatment==="needs_coverage");
  if(!item)throw new Error("Reviewed picture duration is missing");
  // A reviewed short placement can use Desktop's five-second final preset.
  // Keep 100 ms of encode headroom and leave longer placements at 8/10 s.
  const duration=item.durationMs<=4900?5:item.durationMs>8000?10:8;
  const correctionSpecs=new Map([
    ["23e06237-a507-4b8a-b941-75b5c37cbac3",{file:"meyah-mark4-shot093-motion-correction-20261027.json",kind:"isolated_meyah_mark4_shot093_local_motion_correction"}],
    ["cb4aff40-0cf8-47b1-a8e7-13781d00654a",{file:"meyah-mark4-shot044-silent-motion-correction-20261027.json",kind:"isolated_meyah_mark4_shot044_silent_motion_correction"}]
  ]);
  const spec=correctionSpecs.get(shotId);
  const correction=spec?JSON.parse(readFileSync(join(root,"review",spec.file),"utf8")) as
    {kind:string;shotId:string;reviewNoteId:string;direction:string;planHash:string;audioMode?:"none"}:null;
  if(correction&&(correction.kind!==spec?.kind||correction.shotId!==shotId||correction.planHash!==plan.hash||
    (shotId==="cb4aff40-0cf8-47b1-a8e7-13781d00654a"&&correction.audioMode!=="none")))
    throw new Error("Shot-specific motion correction does not match the approved plan.");
  console.log(JSON.stringify(await generateNonSpeakingVideoCandidate(db,projectId,shotId,createVideoProviders("ltx"),{
    durationSeconds:duration,...(correction?{localMotionCorrection:{reviewNoteId:correction.reviewNoteId,direction:correction.direction,
      ...(correction.audioMode==="none"?{audioMode:"none" as const}:{})}}:{})}),null,2));
}else if(command==="accept"){
  if(!attemptId)throw new Error("Accept needs a reviewed final-video attempt ID");
  const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261026","worklist.json"),"utf8")) as
    {items:Array<{targetShotId:string;durationMs:number;treatment:string}>};
  const item=worklist.items.find(row=>row.targetShotId===shotId&&row.treatment==="needs_coverage");
  if(!item || !Number.isInteger(item.durationMs) || item.durationMs<1)throw new Error("Approved picture placement duration is missing");
  const attempt=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'")
    .get(attemptId,shotId) as {result_asset_path:string}|undefined;
  if(!attempt?.result_asset_path)throw new Error("Final candidate missing");
  const seconds=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",join(root,"assets",attempt.result_asset_path)],{encoding:"utf8"}).trim());
  if(!Number.isFinite(seconds)||seconds*1000+50<item.durationMs)throw new Error("Final take cannot cover its approved picture placement");
  console.log(JSON.stringify(acceptFinalVideoCandidate(db,projectId,attemptId,item.durationMs),null,2));
}else throw new Error("Unknown command");
