/** Guarded silent Kling base for a speaking ensemble shot in the isolated edition. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionOrigin, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, requireCurrentPlan, productionAuthorization } from "../src/pipeline/creative-direction/crew-store.js";
import { checkFilmSpend, reserveAvatarSpend, settleAvatarSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";
import { resolveSpeechRunCastAudio } from "../src/pipeline/voice-lipsync/speech-run-audio.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rootRel=relative(checkout,root);
if(rootRel===".."||rootRel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const [shotId,mode]=process.argv.slice(2);
if(!shotId||!/^[a-f0-9-]{36}$/.test(shotId)||![undefined,"--check"].includes(mode))throw new Error("Usage: run-isolated-mark4-meyah-ensemble-base <target-shot-id> [--check]");
const assetPath=(path:string)=>{const full=resolve(root,"assets",path),rel=relative(resolve(root,"assets"),full);if(rel===".."||rel.startsWith(`..${sep}`)||!existsSync(full))throw new Error("A pinned isolated asset is missing or outside this project.");return full;};
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId),origin=readLanguageEditionOrigin(db,projectId);
if(plan?.hash!==planHash||!plan.revision||!origin)throw new Error("The approved language-edition plan or origin changed.");
assertEditionInputsCurrent(db,root,projectId);
const mapped=JSON.parse(String((db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}).payload)) as
  {planHash:string;shots:Array<{targetShotId:string|null;donorShotId:string;treatment:string}>};
const placementIndex=mapped.shots.findIndex(item=>item.targetShotId===shotId);
const match=mapped.shots[placementIndex],reviewed=plan.revision.correspondence[placementIndex];
if(mapped.planHash!==planHash||!match||!reviewed||match.treatment!=="replace_avatar"||
  reviewed.donorShotId!==match.donorShotId||reviewed.treatment!=="replace_avatar")
  throw new Error("Shot is not an approved speaking picture replacement.");
const shot=db.prepare("SELECT sh.verse_ref,sh.action,sh.needs_lip_sync,sh.dialogue_character_id,sc.project_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?")
  .get(shotId) as {verse_ref:string;action:string;needs_lip_sync:number;dialogue_character_id:string;project_id:string}|undefined;
if(shot?.project_id!==projectId||shot.needs_lip_sync!==1||!shot.dialogue_character_id)throw new Error("Target is not a speaker-bound Meyah shot.");
const cast=db.prepare("SELECT c.id,c.name FROM shot_characters sc JOIN characters c ON c.id=sc.character_id WHERE sc.shot_id=?")
  .all(shotId) as Array<{id:string;name:string}>;
if(cast.length<2||!cast.some(person=>person.id===shot.dialogue_character_id))throw new Error("Face-targeted treatment requires the bound speaker within a reviewed ensemble.");
const binding=db.prepare("SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shotId) as {character_version_id:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!binding||binding.source_end_ms<=binding.source_start_ms)throw new Error("Reviewed target speech binding is unavailable.");
const audio=resolveSpeechRunCastAudio(db,shotId,binding.character_version_id);
if(!audio||!existsSync(assetPath(audio.path)))throw new Error("Approved target-language cast audio is unavailable.");
const speaker=cast.find(person=>person.id===shot.dialogue_character_id)!;
const acceptedTarget=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted' ORDER BY created_at DESC LIMIT 1")
  .get(shotId) as {result_asset_path:string}|undefined;
const donorRefs=origin.preflight.pictureEvidence.filter(item=>item.shotId===match.donorShotId);
const donorFrames=new Set(donorRefs.map(item=>`${item.keyframePath}|${item.keyframeSha256}`));
if(donorFrames.size!==1)throw new Error("Donor has no single pinned scene keyframe; resolve picture choice before paid generation.");
const donor=donorRefs[0]!;
const keyframePath=acceptedTarget?.result_asset_path??donor.keyframePath;
const keyframeSha256=hash(assetPath(keyframePath));
if(!acceptedTarget&&keyframeSha256!==donor.keyframeSha256)throw new Error("Pinned donor keyframe changed.");
if(acceptedTarget){
  const sidecar=JSON.parse(readFileSync(assetPath(keyframePath).replace(/\.png$/,".json"),"utf8")) as {resultPath:string;resultHash:string;provider:string};
  if(sidecar.resultPath!==keyframePath||sidecar.resultHash!==keyframeSha256||sidecar.provider!=="codex_imagegen")throw new Error("Approved target keyframe provenance changed.");
}
const durationMs=binding.source_end_ms-binding.source_start_ms,baseSeconds=durationMs>5000?10:5;
const existing=db.prepare("SELECT id,operation FROM generation_attempts WHERE shot_id=? AND operation IN ('avatar_base','lip_sync') LIMIT 1").get(shotId) as {id:string;operation:string}|undefined;
if(existing)throw new Error(`Retained ${existing.operation} attempt ${existing.id} already exists; reconcile rather than resubmit.`);
const pendingPath=join(root,"review",`meyah-mark4-face-base-pending-${shotId}.json`);
if(existsSync(pendingPath))throw new Error("A durable Kling submission record already exists; recover its task rather than resubmit.");
const run=requireCurrentPlan(db,root,projectId);
const crew=JSON.parse(run.result_json!) as {contributions:{production_director?:{directions:Array<{shotId:string;instruction:string;scriptureBasis:string}>}}};
const direction=crew.contributions.production_director?.directions.find(item=>item.shotId===shotId);
if(!direction?.instruction?.trim()||!direction.scriptureBasis?.trim())throw new Error("Approved Director shot direction is missing.");
const prompt=`Animate this exact approved scene keyframe as a silent base for a later face-targeted ${speaker.name} lip-sync. Approved Director direction: ${direction.instruction} Scripture basis: ${direction.scriptureBasis}. Preserve every visible person's Papuan face, hair, clothing, position and identity. Keep the background and camera angle continuous. Use restrained natural body motion only. No new person, dialogue, visible talking, music, generated speech, camera cut or invented event. The exact approved Meyah speaker audio will be synced separately to only the identified ${speaker.name} face.`;
const preview={projectId,shotId,verseRef:shot.verse_ref,speaker:speaker.name,cast:cast.map(person=>person.name),donorShotId:match.donorShotId,
  keyframePath,keyframeSha256,audio:{...audio,sha256:hash(assetPath(audio.path))},sourceStartMs:binding.source_start_ms,sourceEndMs:binding.source_end_ms,
  durationMs,baseSeconds,planHash,prompt,estimatedBaseUsd:1.2};
if(mode==="--check"){console.log(JSON.stringify(preview,null,2));process.exit(0);}
const backup=join(root,"review",`heartword.before-face-base-${shotId}.sqlite`);
if(!existsSync(backup))throw new Error("Create an isolated, quick-checked SQLite backup before Kling submission.");
const authorization=productionAuthorization(db,root,projectId);
checkFilmSpend(db,projectId,2);
const pending:{kind:string;preview:typeof preview;reservationId?:string;taskId?:string;status:string;startedAt:string}={
  kind:"isolated_meyah_mark4_ensemble_face_base",preview,status:"preparing",startedAt:new Date().toISOString()};
const save=()=>writeFileSync(pendingPath,JSON.stringify(pending,null,2)+"\n");
save();
const reservationId=reserveAvatarSpend(db,projectId,shotId,2);pending.reservationId=reservationId;pending.status="reserved";save();
authorization.assertCurrent();
const base=await new KlingFaceLipSyncProvider().generateSceneVideo({path:keyframePath},prompt,baseSeconds,taskId=>{
  pending.taskId=taskId;pending.status="submitted";save();
});
if(!pending.taskId||pending.taskId!==base.taskId)throw new Error("Kling base task was not retained; recover without resubmitting.");
const response=await fetch(base.videoUrl);
if(!response.ok)throw new Error(`Kling base task ${base.taskId} download failed with HTTP ${response.status}.`);
const outputRel=`generated/video/meyah-mark4-face-base-${shotId}-${base.taskId}.mp4`;
const output=join(root,"assets",outputRel);mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,Buffer.from(await response.arrayBuffer()),{flag:"wx"});
const outputDurationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output],{encoding:"utf8"}).trim())*1000);
if(outputDurationMs<durationMs)throw new Error(`Kling base task ${base.taskId} is shorter than its approved source-bound shot.`);
const attemptId=randomUUID(),now=Date.now(),outputSha256=hash(output);
const provenance={...preview,taskId:base.taskId,videoUrl:base.videoUrl,outputRel,outputSha256,outputDurationMs,
  provider:"kling",model:"kling-v2-6-pro",mode:"face-targeted-base",estimatedUsd:1.2,reservationId,
  productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash},
  backup:relative(root,backup).replaceAll("\\","/"),status:"held_for_face_review",liveDatabaseOpened:false};
writeFileSync(`${output}.json`,JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'kling','kling-v2-6-pro','avatar_base','720p',?,'hold_for_review',?,?,?)")
    .run(attemptId,shotId,prompt,outputRel,1.2,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,1.2,now);
  settleAvatarSpend(db,projectId,reservationId,attemptId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,shotId,`Ensemble face-targeted Kling base ${attemptId} for ${speaker.name}; inspect exact picture, identify real provider face thumbnails, and review source-bound ${durationMs} ms before paid face-sync. Task ${base.taskId}; SHA256 ${outputSha256}.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
pending.status="base_candidate_recorded";save();
console.log(JSON.stringify({attemptId,taskId:base.taskId,outputRel,outputDurationMs,estimatedUsd:1.2,heldForReview:true,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
