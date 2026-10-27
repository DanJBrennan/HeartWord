/** Retain Kling's short Jesus 4:11 result and a local exact-window repair. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, productionAuthorization } from "../src/pipeline/creative-direction/crew-store.js";
import { settleAvatarSpend } from "../src/pipeline/voice-lipsync/performance-direction.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw new Error("Only the isolated Meyah data copy may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",shotId="26c5ab86-d51a-450d-a929-677180ccf91a";
const baseAttemptId="eeb18138-f973-4631-8f6a-afde5430940e",taskId="943922550726344427";
const rawRel=join("generated","lipsync-face",`${taskId}.mp4`);
const raw=join(root,"assets",rawRel),rawSha256="c9bc53bd9a9fdf09641ca93059fe93fe1289d76006b774582b8d6d0b4a5ed439";
const castRel="generated\\meyah\\mark-4\\composite_cast_master\\16a50369-5ced-4b5c-a02c-b40acb511886-a2da3548-4f8b-4d90-9ef3-ae0dc58d92fd-elevenlabs.mp3";
const cast=join(root,"assets",castRel),castSha256="31fcd39414ff1fdb174c0821317cff4f0a2e49688bc795e954239a271356613b";
const outputRel=join("generated","lipsync-face",`meyah-mark4-shot030-local-completion-${taskId}.mp4`),output=join(root,"assets",outputRel);
const pendingPath=join(root,"review",`meyah-mark4-face-sync-pending-${shotId}.json`);
const backup=join(root,"review","heartword.before-shot030-short-sync-reconciliation-20261027.sqlite");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
if(!existsSync(backup)||!existsSync(raw)||!existsSync(cast)||hash(raw)!==rawSha256||hash(cast)!==castSha256)
  throw new Error("The isolated backup, exact Kling task bytes or approved cast audio are missing/changed.");
const pending=JSON.parse(readFileSync(pendingPath,"utf8")) as {status:string;taskId:string;reservationId:string;baseAttemptId:string;selectedFaceId:string;audioSha256:string};
if(pending.status!=="submitted"||pending.taskId!==taskId||pending.baseAttemptId!==baseAttemptId||pending.selectedFaceId!=="0"||pending.audioSha256!==castSha256||!pending.reservationId)
  throw new Error("The exact submitted Kling face task is not waiting for reconciliation.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")throw new Error("Approved source-clock plan changed.");
assertEditionInputsCurrent(db,root,projectId);
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' LIMIT 1").get(shotId))throw new Error("A lip-sync result already exists; reconcile it rather than duplicate.");
const binding=db.prepare("SELECT source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?").get(shotId) as {source_start_ms:number;source_end_ms:number}|undefined;
if(binding?.source_start_ms!==178666||binding.source_end_ms!==183666)throw new Error("Approved Jesus 4:11 speech window changed.");
const probe=(path:string)=>JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_type,duration,nb_frames,r_frame_rate:format=duration","-of","json",path],{encoding:"utf8"})) as
  {streams:Array<{codec_type:string;duration?:string;nb_frames?:string;r_frame_rate?:string}>;format:{duration:string}};
const input=probe(raw),rawVideo=input.streams.find(s=>s.codec_type==="video"),rawAudio=input.streams.find(s=>s.codec_type==="audio");
if(rawVideo?.r_frame_rate!=="30/1"||rawVideo.nb_frames!=="149"||Math.abs(Number(rawVideo.duration)-4.966667)>0.002||
  !rawAudio||Math.abs(Number(rawAudio.duration)-4.899002)>0.003)throw new Error("The one-frame-short Kling result changed.");
const filter="[0:v]tpad=stop_mode=clone:stop=1,trim=duration=5,fps=30,setpts=PTS-STARTPTS[v];[1:a]atrim=start=0:end=5,asetpts=PTS-STARTPTS[a]";
if(existsSync(output))throw new Error("A locally completed candidate already exists; inspect it rather than overwrite.");
execFileSync("ffmpeg",["-v","error","-n","-i",raw,"-i",cast,"-filter_complex",filter,"-map","[v]","-map","[a]",
  "-frames:v","150","-t","5","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p",
  "-c:a","aac","-b:a","192k","-movflags","+faststart",output],{stdio:["ignore","ignore","pipe"]});
const repaired=probe(output),video=repaired.streams.find(s=>s.codec_type==="video"),audio=repaired.streams.find(s=>s.codec_type==="audio");
if(video?.r_frame_rate!=="30/1"||video.nb_frames!=="150"||Math.abs(Number(video.duration)-5)>0.002||!audio||Number(audio.duration)<4.99)
  throw new Error("Local completion did not produce an exact 150-frame video with full approved audio; hold bytes for review.");
const outputSha256=hash(output),authorization=productionAuthorization(db,root,projectId),now=Date.now();
const rawAttemptId=randomUUID(),repairedAttemptId=randomUUID(),noteId=randomUUID();
const provenance={kind:"isolated_meyah_mark4_one_frame_face_sync_completion",projectId,shotId,planHash:plan.hash,
  baseAttemptId,taskId,selectedFaceId:"0",rawPath:rawRel,rawSha256,rawVideoFrames:149,rawVideoDurationMs:4967,rawAudioDurationMs:4899,
  castPath:castRel,castSha256,castStartMs:0,castEndMs:5000,sourceStartMs:178666,sourceEndMs:183666,
  filter,outputRel,outputSha256,outputVideoFrames:150,outputVideoDurationMs:5000,
  rawAttemptId,repairedAttemptId,providerEstimatedUsd:0.5,localDirectCostUsd:0,
  productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash},
  backup:relative(root,backup).replaceAll("\\","/"),status:"held_for_review",liveDatabaseOpened:false};
writeFileSync(`${output}.json`,JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (? ,?,'kling','lip-sync-audio2video','lip_sync',?,'hold_for_review',?,0.5,?)")
    .run(rawAttemptId,shotId,`Exact Kling task ${taskId}; face 0 Jesus; result 149/150 picture frames and 4.899/5.000 seconds audio, held short.`,rawRel,now);
  bindAttemptRevision(db,projectId,rawAttemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,rawAttemptId,0.5,now);
  settleAvatarSpend(db,projectId,pending.reservationId,rawAttemptId);
  db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (? ,?,'local_timing_repair','one_frame_audio_completion','lip_sync',?,'hold_for_review',?,0,?)")
    .run(repairedAttemptId,shotId,`Local exact-window correction of Kling task ${taskId}: clone only the missing 150th video frame and restore full approved 0-5.000 s Meyah cast audio; raw attempt ${rawAttemptId} retained.`,outputRel,now+1);
  bindAttemptRevision(db,projectId,repairedAttemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,repairedAttemptId,0,now+1);
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
    .run(noteId,projectId,shotId,`Kling Jesus 4:11 task ${taskId} returned one video frame short and cut off 101 ms of approved speech. Raw attempt ${rawAttemptId} and its $0.50 estimate remain. Local repaired attempt ${repairedAttemptId} adds only the missing final picture frame and restores the exact approved five-second Meyah audio. Inspect full picture and audio before selection. Output SHA256 ${outputSha256}.`,now+1);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES (?,?,?,'repair_short_face_sync',?,?,?)")
    .run(randomUUID(),projectId,sequence,JSON.stringify({rawAttemptId,repairedAttemptId,noteId,taskId,rawSha256,outputSha256,castSha256,filter}),`meyah-mark4-shot030-face-sync-repair:${taskId}`,now+1);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
pending.status="locally_reconciled_held";
writeFileSync(pendingPath,JSON.stringify({...pending,rawAttemptId,repairedAttemptId,outputSha256},null,2)+"\n");
console.log(JSON.stringify({rawAttemptId,repairedAttemptId,outputRel,outputSha256,noteId,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
