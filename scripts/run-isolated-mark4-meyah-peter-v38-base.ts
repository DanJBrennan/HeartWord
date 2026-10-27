/** One bounded Kling scene base for reviewed Peter 4:38 face-targeted sync. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, productionAuthorization } from "../src/pipeline/creative-direction/crew-store.js";
import { checkFilmSpend, reserveAvatarSpend, settleAvatarSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";
import { resolveSpeechRunCastAudio } from "../src/pipeline/voice-lipsync/speech-run-audio.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="5b3d1b76-e839-45c6-8067-676a5002d623";
const planHash="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f";
const keyframePath="generated/keyframes/codex/meyah-mark4-peter-v38/peter-facing-sleeping-jesus-candidate-v3.png";
const keyframeSha256="ee56dec53b628c287956f1737883de4a0da5b06afaa5cdbef56b074af0a607cd";
const backup=join(root,"review","heartword.before-peter-v38-base-20261027.sqlite");
const pendingPath=join(root,"review","meyah-mark4-peter-v38-base-pending-20261027.json");
if(!existsSync(backup)||existsSync(pendingPath))throw new Error("An isolated backup and no prior Peter base request are required.");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!==planHash)throw new Error("Approved shot correspondence changed.");
assertEditionInputsCurrent(db,root,projectId);
const shot=db.prepare("SELECT sh.verse_ref,sh.needs_lip_sync,sh.dialogue_character_id,sc.project_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=?").get(shotId) as {verse_ref:string;needs_lip_sync:number;dialogue_character_id:string;project_id:string}|undefined;
if(shot?.project_id!==projectId||shot.verse_ref!=="Mark 4:38"||shot.needs_lip_sync!==1||!shot.dialogue_character_id)throw new Error("Target Peter 4:38 speaking shot changed.");
const speaker=db.prepare("SELECT name FROM characters WHERE id=?").get(shot.dialogue_character_id) as {name:string}|undefined;
if(speaker?.name!=="Peter")throw new Error("The approved speaker is no longer Peter.");
const key=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate' AND provider='codex_imagegen' AND status='accepted' ORDER BY created_at DESC LIMIT 1").get(shotId) as {id:string;result_asset_path:string}|undefined;
if(key?.result_asset_path!==keyframePath||hash(join(root,"assets",keyframePath))!==keyframeSha256)throw new Error("Approved Peter version-3 keyframe changed.");
const binding=db.prepare("SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?").get(shotId) as {character_version_id:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!binding||binding.source_start_ms!==746695||binding.source_end_ms!==754976)throw new Error("Reviewed Peter quote boundary changed.");
const audio=resolveSpeechRunCastAudio(db,shotId,binding.character_version_id);
if(!audio||audio.endMs-audio.startMs!==8266)throw new Error("Exact approved Meyah Peter cast audio is unavailable.");
const audioSha256=hash(join(root,"assets",audio.path));
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation IN ('avatar_base','lip_sync') LIMIT 1").get(shotId))throw new Error("Peter already has a retained base or lip-sync attempt; reconcile it rather than submit twice.");
const authorization=productionAuthorization(db,root,projectId);
checkFilmSpend(db,projectId,2);
const prompt="Preserve the approved storm keyframe exactly: the same wet, terrified older Papuan Peter in his dark terracotta mantle leans toward the sleeping Jesus on the boat, extending one hand in alarm. Keep Peter close to camera with his face visible, looking at Jesus; maintain the rain, crashing sea, rope, mast and night light. Jesus remains asleep with eyes closed throughout. Only natural boat sway, rain, Peter's distressed breath and slight arm motion. Keep the two existing faces and clothing unchanged. No new person, new action, camera cut, speech, music or generated audio. Peter's exact Meyah words will be face-synced separately.";
const pending:{kind:string;projectId:string;shotId:string;planHash:string;keyframePath:string;keyframeSha256:string;audio:{path:string;startMs:number;endMs:number;sha256:string};reservationId?:string;taskId?:string;status:string;startedAt:string}={
  kind:"isolated_meyah_mark4_peter_v38_face_sync_base",projectId,shotId,planHash,keyframePath,keyframeSha256,
  audio:{...audio,sha256:audioSha256},status:"preparing",startedAt:new Date().toISOString()};
const save=()=>writeFileSync(pendingPath,JSON.stringify(pending,null,2)+"\n");
save();
const reservationId=reserveAvatarSpend(db,projectId,shotId,2);pending.reservationId=reservationId;pending.status="reserved";save();
authorization.assertCurrent();
const provider=new KlingFaceLipSyncProvider();
const base=await provider.generateSceneVideo({path:keyframePath},prompt,10,taskId=>{pending.taskId=taskId;pending.status="submitted";save();});
if(!pending.taskId||pending.taskId!==base.taskId)throw new Error("The exact submitted Kling base task was not retained.");
const response=await fetch(base.videoUrl);
if(!response.ok)throw new Error(`Kling base download failed: ${response.status}; recover task ${base.taskId} without resubmitting.`);
const outputRel=`generated/video/meyah-mark4-peter-v38-base-${base.taskId}.mp4`;
const output=join(root,"assets",outputRel);mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,Buffer.from(await response.arrayBuffer()),{flag:"wx"});
const durationMs=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",output],{encoding:"utf8"}).trim())*1000);
if(durationMs<8281)throw new Error(`Kling base ${base.taskId} is shorter than the approved picture placement; retain it for review.`);
const attemptId=randomUUID(),now=Date.now();
const provenance={kind:pending.kind,projectId,shotId,planHash,keyframePath,keyframeSha256,audio:pending.audio,
  prompt,taskId:base.taskId,videoUrl:base.videoUrl,outputRel,outputSha256:hash(output),durationMs,
  provider:"kling",model:"kling-v2-6-pro",mode:"face-targeted-base",estimatedUsd:1.2,
  reservationId,productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash},
  backup:relative(root,backup).replaceAll("\\","/"),status:"held_for_face_review",liveDatabaseOpened:false};
writeFileSync(`${output}.json`,JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'kling','kling-v2-6-pro','avatar_base','720p',?,'hold_for_review',?,?,?)")
    .run(attemptId,shotId,prompt,outputRel,1.2,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),projectId,attemptId,1.2,now);
  settleAvatarSpend(db,projectId,reservationId,attemptId);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(randomUUID(),projectId,shotId,`Peter 4:38 Kling base candidate ${attemptId}; identify the exact Peter face and inspect Jesus sleeping, identity, storm and 8.281-second coverage before paid face sync. Task ${base.taskId}; output SHA256 ${provenance.outputSha256}. No lip-sync take selected.`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
pending.status="base_candidate_recorded";save();
console.log(JSON.stringify({attemptId,taskId:base.taskId,outputRel,durationMs,estimatedUsd:1.2,heldForReview:true,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
