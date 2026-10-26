/** Production control for one reviewed Meyah Mark 4 silent coverage shot.
 * Keeps the donor/live database outside this process and preserves every take. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Meyah coverage must stay inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [command,shotId,attemptId]=process.argv.slice(2);
if(!command||!shotId)throw new Error("Usage: run-isolated-mark4-meyah-coverage <status|draft|choose|final|accept> <target-shot-id> [attempt-id|--after-desktop-restart]");
const [{getDb},{readLanguageEditionPlan},{requireCurrentPlan},{generateShotDraft,chooseShotDraft},{generateNonSpeakingVideoCandidate,acceptFinalVideoCandidate},{createVideoProviders}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/pipeline/media-generation/draft-room.js"),import("../src/pipeline/media-generation/final-video.js"),
  import("../src/providers/video-selection.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="34bdfedd82b4b7dead32019850877115e69a7935c578b42b988ec90d17c696e7")
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
  if(hold&&attemptId!=="--after-desktop-restart")throw new Error("Two LTX requests closed before inference. Restart Desktop and pass --after-desktop-restart for one bounded recovery preview.");
  const providers=createVideoProviders("ltx");
  const result=await generateShotDraft(db,projectId,shotId,providers.draft);
  if(result.status==="draft"&&hold)db.prepare("UPDATE review_notes SET resolved=1 WHERE id=? AND resolved=0").run(hold.id);
  console.log(JSON.stringify(result,null,2));
}else if(command==="choose"){
  if(!attemptId)throw new Error("Choose needs a reviewed draft attempt ID");
  console.log(JSON.stringify(chooseShotDraft(db,projectId,attemptId),null,2));
}else if(command==="final"){
  const worklist=JSON.parse(readFileSync(join(root,"assets","review","meyah-mark4-media-worklist-20261025","worklist.json"),"utf8")) as
    {items:Array<{targetShotId:string;durationMs:number;treatment:string}>};
  const item=worklist.items.find(row=>row.targetShotId===shotId&&row.treatment==="needs_coverage");
  if(!item)throw new Error("Reviewed picture duration is missing");
  const duration=item.durationMs>8000?10:8;
  console.log(JSON.stringify(await generateNonSpeakingVideoCandidate(db,projectId,shotId,createVideoProviders("ltx"),{durationSeconds:duration}),null,2));
}else if(command==="accept"){
  if(!attemptId)throw new Error("Accept needs a reviewed final-video attempt ID");
  const attempt=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'")
    .get(attemptId,shotId) as {result_asset_path:string}|undefined;
  if(!attempt?.result_asset_path)throw new Error("Final candidate missing");
  const seconds=Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",join(root,"assets",attempt.result_asset_path)],{encoding:"utf8"}).trim());
  if(!Number.isFinite(seconds)||seconds<=0)throw new Error("Final duration probe failed");
  console.log(JSON.stringify(acceptFinalVideoCandidate(db,projectId,attemptId,Math.round(seconds*1000)),null,2));
}else throw new Error("Unknown command");
