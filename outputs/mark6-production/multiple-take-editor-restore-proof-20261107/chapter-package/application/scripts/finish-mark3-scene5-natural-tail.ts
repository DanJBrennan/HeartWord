/** Keep the approved last utterance intact, then hold on recorded chapter silence. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const db=getDb(),root=join(getDataDir(),"assets"),project="0b386bfc-7919-4f40-91af-e198508a8267";
const editKey="mark3-scene5-recorded-natural-silence-tail-v1";
const existing=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(project,editKey) as {payload:string}|undefined;
if(existing){console.log(existing.payload);process.exit(0);}
const prior=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key='mark3-scene5-complete-source-picture-coverage-r1' AND undone=0").get(project) as {payload:string}|undefined;
if(!prior)throw new Error("Reviewed Scene 5 must be selected first.");
const selection=JSON.parse(prior.payload) as {selected:Array<{shotId:string;start:number;end:number;path:string}>};
if(selection.selected.length!==10 || selection.selected.at(-1)!.end!==429852)throw new Error("Scene 5 closing shot changed.");
const last=selection.selected.at(-1)!;
const source=db.prepare("SELECT source_path FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=427645").get(project) as {source_path:string}|undefined;
if(!source)throw new Error("Original final spoken source missing.");
const input=join(root,"generated/video/review/mark3-scene5-full-source-review-r1.mp4"),stillSource=join(root,last.path),original=join(root,source.source_path);
for(const path of [input,stillSource,original])if(!existsSync(path))throw new Error(`Missing selected source ${path}`);
const frame="generated/keyframes/review/mark3-scene5-natural-postroll-frame-r1.png";
const hold="generated/video/coverage/mark3-scene5-natural-postroll-500ms-r1.mp4";
const silent="generated/video/review/mark3-scene5-postroll-silent-r1.mp4";
const audioMix="generated/video/review/mark3-scene5-natural-tail-mix-r1.wav";
const output="generated/video/review/mark3-scene5-full-source-review-r2.mp4";
for(const path of [frame,hold,silent,audioMix,output])mkdirSync(dirname(join(root,path)),{recursive:true});
const run=(args:string[])=>execFileSync("ffmpeg",["-v","error","-y",...args],{stdio:["ignore","ignore","pipe"],timeout:180000});
run(["-sseof","-0.10","-i",stillSource,"-frames:v","1",join(root,frame)]);
if(!existsSync(join(root,frame)))throw new Error("Could not extract the reviewed last frame.");
run(["-loop","1","-framerate","24","-i",join(root,frame),"-vf","format=yuv420p,setsar=1","-frames:v","12","-an","-c:v","libx264","-pix_fmt","yuv420p","-crf","18",join(root,hold)]);
run(["-i",input,"-an","-vf","tpad=stop_mode=clone:stop_duration=0.5","-frames:v","1409","-c:v","libx264","-pix_fmt","yuv420p","-crf","18",join(root,silent)]);
run(["-i",input,"-i",original,"-filter_complex",[
  "[0:a]atrim=start=0:end=58.207,asetpts=PTS-STARTPTS,aresample=48000,afade=t=out:st=58.187:d=0.020[a0]",
  "[1:a]atrim=start=429.852:end=430.352,asetpts=PTS-STARTPTS,aresample=48000[a1]",
  "[a0][a1]concat=n=2:v=0:a=1[a]"
].join(";"),"-map","[a]","-vn","-c:a","pcm_s16le",join(root,audioMix)]);
run(["-i",join(root,silent),"-i",join(root,audioMix),"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",join(root,output)]);
const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,nb_frames,duration","-of","json",join(root,output)],{encoding:"utf8"})) as {format:{duration:string};streams:Array<{codec_type:string;nb_frames?:string;duration:string}>};
const video=probe.streams.find(s=>s.codec_type==="video"),audio=probe.streams.find(s=>s.codec_type==="audio");
if(Number(video?.nb_frames)!==1409 || Math.abs(Number(audio?.duration)*1000-58707)>40)throw new Error("Natural-tail review duration/frame count mismatch.");
const scene=db.prepare("SELECT id FROM scenes WHERE project_id=? AND sequence=5").get(project) as {id:string}|undefined;
if(!scene)throw new Error("Scene 5 missing.");
const finalShot=db.prepare("SELECT id FROM shots WHERE scene_id=? AND sequence=10").get(scene.id) as {id:string}|undefined;
if(finalShot?.id!==last.shotId)throw new Error("Selected last shot changed.");
const shotId=randomUUID(),now=Date.now(),videoAttempt=randomUUID(),assembledAttempt=randomUUID();
db.exec("BEGIN IMMEDIATE");
try{
  db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,coverage_notes,crowd_density,continuity_notes,spatial_view,status,created_at)
    SELECT ?,scene_id,11,'The final speaking moment settles into a quiet hold while the original chapter recording falls silent.',verse_ref,framing,'static',0,NULL,'single_clip',?,crowd_density,continuity_notes,spatial_view,'keyframe_approved',? FROM shots WHERE id=?`)
    .run(shotId,"Source 429852–430352 ms is recorded post-utterance silence, not a new word or revised approved speech binding. Twenty-millisecond fade at the preceding cast seam avoids a hard sample cut.",now,finalShot.id);
  db.prepare("INSERT INTO shot_characters (shot_id,character_id) SELECT ?,character_id FROM shot_characters WHERE shot_id=?").run(shotId,finalShot.id);
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','last-reviewed-frame','generate','16:9',?,'accepted',?,0,?)")
    .run(randomUUID(),shotId,"Source-grounded final-frame hold; no new character or action.",frame,now);
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_reuse','recorded-natural-tail','generate_final_video','720p',?,'accepted',?,0,?)")
    .run(videoAttempt,shotId,"500 ms still-picture coverage over recorded source silence 429852–430352 ms.",hold,now);
  db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,500,?)")
    .run(randomUUID(),shotId,videoAttempt,now);
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local','ffmpeg-source-bound-assembly','assemble_shot','1280x720',?,'accepted',?,0,?)")
    .run(assembledAttempt,shotId,"Silent 500 ms final hold; chapter soundtrack uses original recorded silence.",hold,now);
  db.prepare("INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at) VALUES (?,?,?,0,500,?)")
    .run(randomUUID(),shotId,assembledAttempt,now);
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
    .run(randomUUID(),project,shotId,"Natural source silence follows the complete approved Jesus utterance; no new speech or speaker attribution was introduced.",now);
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(project) as {n:number}).n);
  const payload=JSON.stringify({scene:5,sourceSpeechEndMs:429852,reviewEndMs:430352,postrollShotId:shotId,review:output,reason:"Recorded source silence and a restrained last-frame hold avoid stopping at an active spoken sample; approved dialogue binding remains unchanged."});
  db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)")
    .run(randomUUID(),project,sequence,"insert_source_recorded_postroll",payload,editKey,now);
  db.exec("COMMIT");
  console.log(payload);
}catch(error){db.exec("ROLLBACK");throw error;}
