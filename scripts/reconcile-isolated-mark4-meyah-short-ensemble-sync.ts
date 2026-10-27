/** Complete one missing Kling picture frame and restore the approved cast audio.
 * Keeps the charged raw task, adds a zero-cost held local candidate, and
 * never submits another provider request. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../src/db/client.js";
import { assertEditionInputsCurrent, readLanguageEditionPlan } from "../src/pipeline/language-edition.js";
import { bindAttemptRevision, productionAuthorization } from "../src/pipeline/creative-direction/crew-store.js";
import { resolveSpeechRunCastAudio } from "../src/pipeline/voice-lipsync/speech-run-audio.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rootRel=relative(checkout,root);
if(rootRel===".."||rootRel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Only the isolated Meyah project may be edited.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const shotId=process.argv[2];
if(!shotId||!/^[a-f0-9-]{36}$/.test(shotId))
  throw new Error("Usage: reconcile-isolated-mark4-meyah-short-ensemble-sync <target-shot-id>");
const hash=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const asset=(path:string)=>{
  const absolute=resolve(root,"assets",path),rel=relative(resolve(root,"assets"),absolute);
  if(rel===".."||rel.startsWith(`..${sep}`)||!existsSync(absolute))throw new Error("A pinned isolated asset is missing.");
  return absolute;
};
const pendingPath=join(root,"review",`meyah-mark4-face-sync-pending-${shotId}.json`);
const pending=JSON.parse(readFileSync(pendingPath,"utf8")) as {
  kind:string;projectId:string;shotId:string;baseAttemptId:string;selectedFaceId:string;audioSha256:string;
  status:string;taskId:string;reservationId:string;
};
if(pending.kind!=="isolated_meyah_mark4_ensemble_face_sync"||pending.projectId!==projectId||pending.shotId!==shotId||
  pending.status!=="short_output_held_for_reconciliation"||!pending.taskId)
  throw new Error("The exact retained Kling task is not held for short-output reconciliation.");
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(plan?.hash!=="1c31f3ea3013eef2cccba36c4bf46ec353b2afb421d03afdbb7704560fdd293f")
  throw new Error("Reviewed edition correspondence changed.");
assertEditionInputsCurrent(db,root,projectId);
const raw=db.prepare(`SELECT ga.id,ga.result_asset_path,ga.status,ga.cost_usd FROM generation_attempts ga
  JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
  WHERE ga.shot_id=? AND sc.project_id=? AND ga.operation='lip_sync' AND ga.provider='kling' AND ga.model='lip-sync-audio2video'
  ORDER BY ga.created_at DESC LIMIT 1`).get(shotId,projectId) as
  {id:string;result_asset_path:string;status:string;cost_usd:number}|undefined;
if(raw?.status!=="hold_for_review"||!raw.result_asset_path)
  throw new Error("The charged original Kling candidate is unavailable or changed.");
if(db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND provider='local_timing_repair' AND operation='lip_sync'").get(shotId))
  throw new Error("A local repair already exists; inspect it rather than repeat it.");
const rawPath=asset(raw.result_asset_path);
const evidence=JSON.parse(readFileSync(`${rawPath}.json`,"utf8")) as {
  projectId:string;shotId:string;taskId:string;outputPath:string;outputSha256:string;shortfallMs:number;
  baseAttemptId:string;selectedFaceId:string;sourceStartMs:number;sourceEndMs:number;
  audio:{path:string;startMs:number;endMs:number;sha256:string};estimatedUsd:number;
};
if(evidence.projectId!==projectId||evidence.shotId!==shotId||evidence.taskId!==pending.taskId||
  evidence.outputPath!==raw.result_asset_path||evidence.outputSha256!==hash(rawPath)||evidence.shortfallMs!==33||
  evidence.baseAttemptId!==pending.baseAttemptId||evidence.selectedFaceId!==pending.selectedFaceId||
  evidence.audio.sha256!==pending.audioSha256||Math.abs(evidence.estimatedUsd-raw.cost_usd)>0.000001)
  throw new Error("The retained task bytes, selected face, audio or charge changed.");
const shot=db.prepare("SELECT dialogue_character_id FROM shots WHERE id=? AND needs_lip_sync=1").get(shotId) as
  {dialogue_character_id:string}|undefined;
const binding=db.prepare("SELECT character_version_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
  .get(shotId) as {character_version_id:string;source_start_ms:number;source_end_ms:number}|undefined;
if(!shot||!binding||binding.source_start_ms!==evidence.sourceStartMs||binding.source_end_ms!==evidence.sourceEndMs)
  throw new Error("The reviewed speaker or source window changed.");
const speaker=db.prepare("SELECT name FROM characters WHERE id=?").get(shot.dialogue_character_id) as {name:string}|undefined;
if(!speaker||!speaker.name.trim())throw new Error("The reviewed speaker identity is unavailable.");
const audio=resolveSpeechRunCastAudio(db,shotId,binding.character_version_id);
if(!audio||audio.path!==evidence.audio.path||audio.startMs!==evidence.audio.startMs||audio.endMs!==evidence.audio.endMs||
  hash(asset(audio.path))!==evidence.audio.sha256)
  throw new Error("The approved Meyah cast performance changed.");
const durationMs=binding.source_end_ms-binding.source_start_ms;
if(durationMs!==5000||audio.endMs-audio.startMs!==durationMs)
  throw new Error("This bounded one-frame repair currently requires an exact five-second speaker window.");
const probe=(path:string)=>JSON.parse(execFileSync("ffprobe",["-v","error",
  "-show_entries","stream=codec_type,duration,nb_frames,r_frame_rate:format=duration","-of","json",path],{encoding:"utf8"})) as
  {streams:Array<{codec_type:string;duration?:string;nb_frames?:string;r_frame_rate?:string}>;format:{duration:string}};
const before=probe(rawPath),video=before.streams.find(s=>s.codec_type==="video"),rawAudio=before.streams.find(s=>s.codec_type==="audio");
if(video?.r_frame_rate!=="30/1"||video.nb_frames!=="149"||Math.abs(Number(video.duration)-149/30)>0.002||
  !rawAudio||Number(rawAudio.duration)<4.8||Number(rawAudio.duration)>4.98)
  throw new Error("The retained output is not the known one-frame/short-audio case.");
const backup=join(root,"review",`heartword.before-short-sync-repair-${shotId}.sqlite`);
if(!existsSync(backup))throw new Error("Create and quick-check an isolated database backup before repair.");
const outputRel=`generated/lipsync-face/repair-${pending.taskId}.mp4`,output=join(root,"assets",...outputRel.split("/"));
if(existsSync(output))throw new Error("A completed local file already exists; reconcile that exact output.");
const start=(audio.startMs/1000).toFixed(3),end=(audio.endMs/1000).toFixed(3);
const filter=`[0:v]tpad=stop_mode=clone:stop=1,trim=duration=5,fps=30,setpts=PTS-STARTPTS[v];[1:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a]`;
execFileSync("ffmpeg",["-v","error","-n","-i",rawPath,"-i",asset(audio.path),"-filter_complex",filter,
  "-map","[v]","-map","[a]","-frames:v","150","-t","5","-c:v","libx264","-preset","medium","-crf","18",
  "-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart",output],
  {stdio:["ignore","ignore","pipe"]});
const after=probe(output),fixedVideo=after.streams.find(s=>s.codec_type==="video"),fixedAudio=after.streams.find(s=>s.codec_type==="audio");
if(fixedVideo?.r_frame_rate!=="30/1"||fixedVideo.nb_frames!=="150"||Math.abs(Number(fixedVideo.duration)-5)>0.002||
  !fixedAudio||Number(fixedAudio.duration)<4.99)
  throw new Error("Local completion did not restore 150 video frames and all approved audio; hold the file.");
const authorization=productionAuthorization(db,root,projectId),attemptId=randomUUID(),noteId=randomUUID(),now=Date.now();
const outputSha256=hash(output);
const provenance={kind:"isolated_meyah_mark4_one_frame_face_sync_completion",projectId,shotId,
  planHash:plan.hash,rawAttemptId:raw.id,rawTaskId:pending.taskId,selectedFaceId:pending.selectedFaceId,
  rawPath:raw.result_asset_path,
  rawSha256:evidence.outputSha256,rawVideoFrames:149,rawAudioDurationMs:Math.round(Number(rawAudio.duration)*1000),
  castPath:audio.path,castSha256:evidence.audio.sha256,castStartMs:audio.startMs,castEndMs:audio.endMs,
  sourceStartMs:binding.source_start_ms,sourceEndMs:binding.source_end_ms,filter,
  outputPath:outputRel,outputSha256,outputVideoFrames:150,outputVideoDurationMs:5000,
  providerCostUsd:raw.cost_usd,localDirectCostUsd:0,
  productionRevision:{runId:authorization.runId,briefHash:authorization.briefHash},
  backup:relative(root,backup).replaceAll("\\","/"),status:"held_for_review",liveDatabaseOpened:false};
writeFileSync(`${output}.json`,JSON.stringify(provenance,null,2)+"\n",{flag:"wx"});
authorization.assertCurrent();
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare(`INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)
    VALUES (?,?,'local_timing_repair','one_frame_audio_completion','lip_sync',?,'hold_for_review',?,0,?)`)
    .run(attemptId,shotId,`Exact local correction of charged Kling task ${pending.taskId}: clone the missing final picture frame and restore the approved ${audio.startMs}-${audio.endMs} ms Meyah ${speaker.name} audio; raw attempt ${raw.id} retained.`,outputRel,now);
  bindAttemptRevision(db,projectId,attemptId,authorization);
  db.prepare("INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(),projectId,attemptId,0,now);
  db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
    VALUES (?,?,'shot',?,'qc',?,0,?)`)
    .run(noteId,projectId,shotId,`Kling task ${pending.taskId} produced 149/150 frames and ${Math.round(Number(rawAudio.duration)*1000)}/5000 ms audio. The raw charged take ${raw.id} remains. Local candidate ${attemptId} clones one final picture frame and restores the approved full audio; inspect lip movement, other faces and exact audio before selection. SHA256 ${outputSha256}.`,now);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    VALUES (?,?,?,'repair_short_face_sync',?,?,?)`)
    .run(randomUUID(),projectId,sequence,JSON.stringify({rawAttemptId:raw.id,repairedAttemptId:attemptId,noteId,
      taskId:pending.taskId,rawSha256:evidence.outputSha256,outputSha256,castSha256:evidence.audio.sha256,filter}),
      `meyah-mark4-face-sync-repair:${pending.taskId}`,now);
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
writeFileSync(pendingPath,JSON.stringify({...pending,status:"locally_reconciled_held",repairedAttemptId:attemptId,
  repairedSha256:outputSha256},null,2)+"\n");
console.log(JSON.stringify({rawAttemptId:raw.id,repairedAttemptId:attemptId,outputPath:outputRel,outputSha256,
  noteId,quickCheck:db.prepare("PRAGMA quick_check").get()},null,2));
