/** Selects the visually checked Mark 3:5 clips without changing source audio bindings. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { acceptFinalVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const reactionId="a5fea0f8-2e9d-420e-bb31-0e22455b5e96";
const leadId="e0cf6a9a-17e0-457b-ae40-2b974d875fcc";
const commandId="03501e06-4d6d-49f8-bd8a-1c4e4ad61ae3";
const healingId="91afa1de-a013-4266-81e8-7e6be3199c7e";
const db=getDb(),root=join(getDataDir(),"assets");
const reviewRoot=join("generated","video","review");
const leadRel=join(reviewRoot,"mark3-scene1-verse5-ots-leadin-4769ms-r1.mp4");
const commandRel=join(reviewRoot,"mark3-scene1-verse5-command-hand-hold-1241ms-r1.mp4");
const preview=join(root,reviewRoot,"mark3-scene1-shot4-through-verse5-healing-review-r2.mp4");
for(const rel of [leadRel,commandRel])if(!existsSync(join(root,rel)))throw new Error(`Missing reviewed derivative ${rel}`);
if(!existsSync(preview))throw new Error("Continuous-audio review cut is missing.");
const binding=db.prepare("SELECT id,source_audio_segment_id,source_start_ms,source_end_ms,approved_by FROM shot_utterance_bindings WHERE shot_id=?")
  .get(commandId) as {id:string;source_audio_segment_id:string;source_start_ms:number;source_end_ms:number;approved_by:string}|undefined;
if(binding?.id!=="0d02aaa7-e7aa-424d-8df8-e99e65caf42d"||binding.source_start_ms!==70759||binding.source_end_ms!==72000||binding.approved_by!=="Dan")
  throw new Error("Producer-approved Jesus command binding changed.");
const cast=db.prepare("SELECT a.source_path FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id WHERE m.original_segment_id=?")
  .get(binding.source_audio_segment_id) as {source_path:string}|undefined;
if(!cast||!existsSync(join(root,cast.source_path)))throw new Error("Approved command cast audio missing.");

const editKey="mark3-scene1-verse5-command-hand-cutaway-v1";
if(!db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId,editKey)){
  const prior=db.prepare("SELECT action,framing,coverage_notes,continuity_notes,spatial_view FROM shots WHERE id=?").get(commandId);
  const now=Date.now(),sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  const rationale="The approved OTS lead-in reaches Jesus's line with his small side-profile mouth still visible. Dan's delegated lip-sync guidance favors covering that command with the man's still-contracted left hand; the hand does not open until the next shot. Jesus's exact approved original interval, cast-master mapping, and speaker binding remain unchanged. The original approved OTS keyframe and paid full-render candidates remain in history.";
  db.exec("BEGIN IMMEDIATE");try{
    db.prepare("UPDATE shots SET action=?,framing='close_up',coverage_notes=?,continuity_notes=?,spatial_view=? WHERE id=?")
      .run("Tight insert on the Man with Withered Hand's still-contracted anatomical left hand while offscreen Jesus commands him to stretch it out; the hand does not yet heal.",
        "70.759–72.000 s approved Jesus cast command. Mouth-hidden hand cutaway, followed by the same hand beginning to extend in the next shot; no dialogue boundary change.",
        "Use the first frame of the approved healing-hand take, held contracted through the command. Same anatomical left hand, sleeve, room and light as the following insert.",
        "Tight hand insert from the same camera angle as the following healing shot.",commandId);
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)")
      .run(randomUUID(),projectId,sequence,"revise_command_picture_coverage",JSON.stringify({shotId:commandId,prior,rationale,selectedPicture:commandRel,sourceBindingId:binding.id}),editKey,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(),projectId,commandId,rationale,now);
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}

const leadMarker="mark3-scene1-verse5-ots-leadin-4769ms-r1";
let leadAttempt=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_final_video' AND prompt LIKE ? LIMIT 1")
  .get(leadId,`${leadMarker}%`) as {id:string}|undefined;
if(!leadAttempt){
  leadAttempt={id:randomUUID()};
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_ffmpeg','reviewed-Kling-trim','generate_final_video','720p',?,'hold_for_review',?,0,?)")
    .run(leadAttempt.id,leadId,`${leadMarker}: first 4.769 s of stable three-person Kling retry 85b81130-e3dc-4b5a-8c76-31d75aa5c28f. No extra man; no audio.`,leadRel,Date.now());
}
const selections=[
  {shotId:reactionId,attemptId:"e12363bf-5c59-4ce5-a80b-923528df6547",durationMs:8000},
  {shotId:leadId,attemptId:leadAttempt.id,durationMs:4769},
  {shotId:healingId,attemptId:"a368dcb6-2bb8-4f97-af0a-b792921eb6d6",durationMs:6779}
];
for(const item of selections){
  const got=acceptFinalVideoCandidate(db,projectId,item.attemptId,item.durationMs);
  const existing=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' LIMIT 1").get(item.shotId);
  const assembled=existing?"already assembled":assembleSingleShot(db,item.shotId).assembledVideoPath;
  console.log(JSON.stringify({...item,clipId:got.clipId,assembled}));
}

const commandMarker="mark3-scene1-verse5-command-hand-hold-1241ms-r1";
let commandAttempt=db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND prompt LIKE ? LIMIT 1")
  .get(commandId,`${commandMarker}%`) as {id:string}|undefined;
if(!commandAttempt){
  commandAttempt={id:randomUUID()};const now=Date.now();
  db.exec("BEGIN IMMEDIATE");try{
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_ffmpeg','approved-hand-frame-hold','generate_coverage_base','720p',?,'accepted',?,0,?)")
      .run(commandAttempt.id,commandId,`${commandMarker}: first frame of approved healing take, held through offscreen Jesus command; original OTS approval remains historical.`,commandRel,now);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,1241,?)")
      .run(randomUUID(),commandId,commandAttempt.id,now);
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}
const assembledCommand=join(root,"generated","assembled",`${commandId}.mp4`);
if(!db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' LIMIT 1").get(commandId)){
  execFileSync("ffmpeg",["-v","error","-y","-i",join(root,commandRel),"-i",join(root,cast.source_path),
    "-filter_complex","[1:a]atrim=start=0:end=1.241,asetpts=PTS-STARTPTS[a]","-map","0:v:0","-map","[a]","-frames:v","30","-c:v","libx264","-preset","medium","-crf","18","-c:a","aac","-b:a","192k",assembledCommand],{stdio:"pipe"});
  const id=randomUUID(),now=Date.now(),rel=join("generated","assembled",`${commandId}.mp4`);
  db.exec("BEGIN IMMEDIATE");try{
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','ffmpeg-assemble-bound-command','assemble_shot','1280x720',?,'accepted',?,0,?)")
      .run(id,commandId,`Picture from ${commandAttempt.id}; exact approved Jesus cast audio mapped through original segment ${binding.source_audio_segment_id}, first 1.241 s.`,rel,now);
    db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,1241,?)")
      .run(randomUUID(),commandId,id,now);
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}
console.log(JSON.stringify({commandShotId:commandId,commandAttemptId:commandAttempt.id,assembledCommand}));
