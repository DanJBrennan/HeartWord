/** Inserts two source-grounded picture shots before the retained Mark 3:5 command. */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";

const projectId = "0b386bfc-7919-4f40-91af-e198508a8267";
const sceneId = "2842e225-94a7-4074-9ae1-a69ac3b50c76";
const commandShotId = "03501e06-4d6d-49f8-bd8a-1c4e4ad61ae3";
const healingShotId = "91afa1de-a013-4266-81e8-7e6be3199c7e";
const exitShotId = "7e4a0dfc-e7e3-466d-a844-0b59883b4e48";
const jesusId = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const commandKey = "mark3-scene1-verse5-narration-coverage-v1";
const reactionImage = "generated/keyframes/mark3-scene1-jesus-anger-grief-r1.png";
const otsImage = "generated/keyframes/03501e06-4d6d-49f8-bd8a-1c4e4ad61ae3.png";
const rationale = "Dan delegated source-grounded clip generation. Mark 3:5's verified Hatam and English texts narrate Jesus looking around with anger and grief before his command. Original narration remains the continuous 57.990–70.759 s soundtrack; the 65.990 s picture cut is not a new audio boundary. A close Jesus reaction carries the first 8.000 s, then the already-approved OTS bench view carries 4.769 s before the existing 70.759–72.000 s command. The man remains unhealed until the subsequent hand insert.";

const db = getDb();
const existing = db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId,commandKey) as {payload:string}|undefined;
if (existing) {
  console.log(existing.payload);
} else {
  for (const asset of [reactionImage,otsImage]) {
    if (!existsSync(join(getDataDir(),"assets",asset))) throw new Error(`Missing approved/reviewed keyframe ${asset}`);
  }
  const existingShots = db.prepare("SELECT id,sequence FROM shots WHERE scene_id=? AND sequence BETWEEN 5 AND 8 ORDER BY sequence").all(sceneId) as Array<{id:string;sequence:number}>;
  if (JSON.stringify(existingShots.map(row=>[row.id,row.sequence]))!==JSON.stringify([
    ["b78f8ac2-508b-4526-b50e-e57323579e54",5],[commandShotId,6],[healingShotId,7],[exitShotId,8]
  ])) throw new Error("Scene 1 shot order changed; refusing stale insertion.");
  const reactionId=randomUUID(), leadinId=randomUUID(), now=Date.now();
  const insertShot=db.prepare(`INSERT INTO shots
    (id,scene_id,sequence,action,verse_ref,framing,camera_movement,needs_lip_sync,
      dialogue_character_id,coverage_plan,coverage_notes,crowd_density,continuity_notes,spatial_view,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE shots SET sequence=10 WHERE id=? AND sequence=8").run(exitShotId);
    db.prepare("UPDATE shots SET sequence=9 WHERE id=? AND sequence=7").run(healingShotId);
    db.prepare("UPDATE shots SET sequence=8 WHERE id=? AND sequence=6").run(commandShotId);
    insertShot.run(reactionId,sceneId,6,
      "Jesus silently looks around the synagogue leaders with restrained anger and grief at their hardness of heart; he has not yet commanded the man to stretch out his hand.",
      "Mark 3:5","medium_close","static",0,null,"single_clip",
      "57.990–65.990 s original-reading narration; no visible speech. The 65.990 s picture cut is inside continuous narration, not an utterance boundary.",
      "moderate",
      "Direct continuation of the approved Shot 4 Jesus close-up: exact Papuan face, dark hair and beard, cream-dominant tunic with narrow indigo bands, dark-basalt synagogue and warm high-window daylight. Closed mouth, subtle head/eye turn, no new action or healing.",
      "Medium-close on Jesus from the central synagogue floor toward the same silent bench; eyeline scans leaders offscreen.",
      "keyframe_approved",now);
    insertShot.run(leadinId,sceneId,7,
      "From behind Jesus, the exact three men remain on the same synagogue bench while narration continues his look around at their hardness of heart. Jesus is only a foreground shoulder/back silhouette; no visible speech or healing yet.",
      "Mark 3:5","medium_close","push_in",0,null,"single_clip",
      "65.990–70.759 s original-reading narration. Continue the same OTS moving take into the existing 70.759–72.000 s Jesus command, with real cast audio only for the command.",
      "moderate",
      "Reuse the approved command-shot OTS keyframe exactly: principal scribe left, Man with Withered Hand centered with contracted anatomical left hand in lap, older scribe right; Jesus's cream/indigo shoulder at foreground right. No one speaks visibly or begins the healing.",
      "Approved Shot 6 OTS geometry, from behind Jesus facing the three seated men; identical room and wardrobe.",
      "keyframe_approved",now);
    db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(reactionId,jesusId);
    const characters=db.prepare("SELECT character_id FROM shot_characters WHERE shot_id=?").all(commandShotId) as Array<{character_id:string}>;
    for (const character of characters) db.prepare("INSERT INTO shot_characters (shot_id,character_id) VALUES (?,?)").run(leadinId,character.character_id);
    for (const [shotId,path,provider,resolution,prompt] of [
      [reactionId,reactionImage,"codex_imagegen","1672x941","Producer-delegated identity-preserving edit of approved Shot 4 Jesus close-up for Mark 3:5 restrained anger/grief; closed mouth, exact canon and room."],
      [leadinId,otsImage,"local_reuse","1376x768","Exact approved OTS command keyframe reused for preceding Mark 3:5 narrator lead-in; same three-man bench and hidden foreground Jesus mouth."]
    ] as Array<[string,string,string,string,string]>) db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,?,?,?,'accepted',?,0,?)")
      .run(randomUUID(),shotId,provider,provider==="codex_imagegen"?"built-in-imagegen":"approved-keyframe-reuse","generate",resolution,prompt,path,now);
    const sequence=Number((db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
    const payload=JSON.stringify({reactionId,leadinId,sourceStartMs:57990,pictureCutMs:65990,commandStartMs:70759,commandEndMs:72000,previousOrder:existingShots,newOrder:[5,6,7,8,9,10],rationale,assets:{reactionImage,otsImage}});
    db.prepare("INSERT INTO edit_commands (id,project_id,sequence,command_type,payload,idempotency_key,applied_at,undone) VALUES (?,?,?,?,?,?,?,0)").run(randomUUID(),projectId,sequence,"insert_narration_coverage",payload,commandKey,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
      .run(randomUUID(),projectId,reactionId,`Narration coverage plan: ${rationale} The built-in imagegen call is unmetered in the project ledger; $0 is not a claim that it was free.`,now);
    db.exec("COMMIT");
    console.log(payload);
  } catch(error) {db.exec("ROLLBACK");throw error;}
}
