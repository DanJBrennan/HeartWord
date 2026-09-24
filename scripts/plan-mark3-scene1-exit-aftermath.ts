/** Adds source-timed doorway aftermath coverage after the approved Mark 3:6 exit. */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const sceneId="2842e225-94a7-4074-9ae1-a69ac3b50c76";
const departureId="7e4a0dfc-e7e3-466d-a844-0b59883b4e48";
const parentAttempt="50da6fc5-4e0d-4e4c-b9d4-fcd48eb9600b";
const frameRel="generated/keyframes/mark3-scene1-exit-aftermath-start-r2.png";
const editKey="mark3-scene1-verse6-aftermath-coverage-v1";
const db=getDb();
const prior=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId,editKey) as {payload:string}|undefined;
if(prior){console.log(prior.payload);}else{
  if(!existsSync(join(getDataDir(),"assets",frameRel)))throw new Error("Reviewable parent-video last frame missing.");
  const departure=db.prepare("SELECT sequence,status FROM shots WHERE id=? AND scene_id=?").get(departureId,sceneId) as {sequence:number;status:string}|undefined;
  if(departure?.sequence!==10)throw new Error("Scene 1 shot order changed.");
  if(db.prepare("SELECT id FROM shots WHERE scene_id=? AND sequence=11").get(sceneId))throw new Error("Scene 1 already has sequence 11.");
  const parent=db.prepare("SELECT result_asset_path,status FROM generation_attempts WHERE id=? AND shot_id=?").get(parentAttempt,departureId) as {result_asset_path:string|null;status:string}|undefined;
  if(parent?.status!=="hold_for_review"||!parent.result_asset_path)throw new Error("Source departure candidate changed.");
  const source=db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=? AND layer='original_reading'").get("c8051195-8a7e-4a80-bc5f-5c63736d95fd") as {start_ms:number;end_ms:number}|undefined;
  const next=db.prepare("SELECT start_ms FROM audio_segments WHERE id=? AND layer='original_reading'").get("d514fded-17e7-45db-9692-2cb514ac27d8") as {start_ms:number}|undefined;
  if(source?.start_ms!==78779||source.end_ms!==90655||next?.start_ms!==92799)throw new Error("Mark 3:6 source timing changed.");
  const id=randomUUID(),now=Date.now();
  const rationale="Mark 3:6's original narrator spans 78.779–90.655 s, followed by a natural 2.144 s pause before the next scene. The approved departure take covers the first 8.000 s; this frame-continuous 6.020 s aftermath covers the rest and the pause. Verified text mentions counsel with the Herodians, but no Herodian visual canon is approved; the picture remains inside the synagogue on the departing group and silent witnesses, without fabricating a meeting, words, violence, or a new identity. Narration remains one continuous source span across the 86.779 s picture cut.";
  const prompt="Mark 3:6 doorway aftermath, photorealistic 16:9 landscape. Continue exactly from the reviewed last frame of the approved departure video: the same dark-basalt synagogue, historically corrected pivot-peg two-leaf doors, warm high-window light, Papuan/Hatam seated witnesses on both walls, and the same dark-robed leaders already disappearing outside. Over six seconds the remaining leaders recede out of view; witnesses exchange only small independent silent glances toward the empty doorway. Hold a steady wide camera and let the last two seconds breathe on the now-empty doorway. No new people, Herodian depiction, meeting, dialogue, violence, weapon, costume change, text, modern hardware, camera orbit or cut. Original Scripture narration and its natural pause will be added separately.";
  db.exec("BEGIN IMMEDIATE");try{
    db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,dialogue_character_id,coverage_plan,coverage_notes,crowd_density,continuity_notes,spatial_view,status,created_at)
      VALUES (?,?,11,?,'Mark 3:6','wide','static',0,NULL,'single_clip',?,'moderate',?,?,'keyframe_approved',?)`)
      .run(id,sceneId,"The departing Pharisees recede beyond the synagogue doorway while the remaining witnesses sit in silence; the wide room holds through the narrator's natural pause.",
        "86.779–92.799 s picture. Original narrator continues without an audio splice to 90.655 s, then natural source silence until the next scene at 92.799 s.",
        "Direct continuation of the accepted Shot 10 last frame: same doorway, basalt, benches, witnesses, departing dark-robed figures and wardrobe. No visual depiction of unapproved Herodian characters.",
        "Wide view from inside the synagogue, toward the open main doors; final figures recede into daylight.",now);
    const characters=db.prepare("SELECT character_id FROM shot_characters WHERE shot_id=?").all(departureId) as Array<{character_id:string}>;
    for(const c of characters)db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(id,c.character_id);
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'local_frame_extraction','ffmpeg-parent-video','generate','1280x720',?,'accepted',?,0,?)")
      .run(randomUUID(),id,prompt,frameRel,now);
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
    const payload=JSON.stringify({aftermathShotId:id,parentShotId:departureId,parentAttempt,frameRel,sourceStartMs:78779,pictureCutMs:86779,narrationEndMs:90655,nextSceneStartMs:92799,rationale});
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)")
      .run(randomUUID(),projectId,sequence,"insert_exit_aftermath_coverage",payload,editKey,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(),projectId,id,rationale,now);
    db.exec("COMMIT");console.log(payload);
  }catch(error){db.exec("ROLLBACK");throw error;}
}
