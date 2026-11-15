/** Selects reviewed Mark 3:6 exit and aftermath footage, leaving source intact. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { acceptFinalVideoCandidate } from "../src/pipeline/media-generation/final-video.js";
import { assembleSingleShot } from "../src/pipeline/assembly/assemble-single-shot.js";

const projectId="0b386bfc-7919-4f40-91af-e198508a8267";
const db=getDb(),root=join(getDataDir(),"assets");
const original=db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'")
  .get("c8051195-8a7e-4a80-bc5f-5c63736d95fd",projectId) as {start_ms:number;end_ms:number}|undefined;
const next=db.prepare("SELECT start_ms FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'")
  .get("d514fded-17e7-45db-9692-2cb514ac27d8",projectId) as {start_ms:number}|undefined;
if(original?.start_ms!==78779||original.end_ms!==90655||next?.start_ms!==92799)throw new Error("Approved Mark 3:6 source timings changed.");
const preview=join(root,"generated","video","review","mark3-scene1-command-through-exit-review-r1.mp4");
if(!existsSync(preview))throw new Error("Source-continuous preview missing.");
for(const item of [
  {shotId:"7e4a0dfc-e7e3-466d-a844-0b59883b4e48",attemptId:"50da6fc5-4e0d-4e4c-b9d4-fcd48eb9600b",durationMs:8000},
  {shotId:"14211d4d-9f42-47b5-b20b-8703b1e594ff",attemptId:"84503126-6283-48c1-9a8b-81a13619fa44",durationMs:6020}
]){
  const candidate=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND operation='generate_final_video'")
    .get(item.attemptId,item.shotId) as {result_asset_path:string|null}|undefined;
  if(!candidate?.result_asset_path||!existsSync(join(root,candidate.result_asset_path)))throw new Error(`Candidate media missing for ${item.shotId}`);
  const selected=acceptFinalVideoCandidate(db,projectId,item.attemptId,item.durationMs);
  const assembled=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='assemble_shot' AND status='accepted' LIMIT 1")
    .get(item.shotId) as {result_asset_path:string}|undefined;
  const output=assembled?.result_asset_path??assembleSingleShot(db,item.shotId).assembledVideoPath;
  console.log(JSON.stringify({...item,clipId:selected.clipId,assembled:output}));
}
const marker="Mark 3:6 selected exit coverage QC v1";
if(!db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND note LIKE ?").get(projectId,"14211d4d-9f42-47b5-b20b-8703b1e594ff",`${marker}%`))
  db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,1,?)")
    .run(randomUUID(),projectId,"14211d4d-9f42-47b5-b20b-8703b1e594ff",`${marker}: inspected eight-second doorway departure and frame-continuous aftermath; no duplicated departing figure or new identity, seated witnesses remain. Continuous source narration 78.779–90.655 s and natural pause to 92.799 s; no truncated renewed onset in the speaker-turn check. Herodians are named in the verified narration but not visually depicted because no approved Herodian canon is present.`,Date.now());
