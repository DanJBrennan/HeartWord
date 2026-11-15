import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { recordSourceAlignmentSpeakerAttribution } from "../src/pipeline/ingestion/source-alignment-speaker-attributions.js";
const db=getDb(), projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", jesusId="b78bed54-1d53-4b9f-9070-549dddb71b19";
const targets=[
  ["95b36a21-021d-4ca3-b1d8-c1f5f1569f67","Mark 4:11"],["7f9e6066-5f16-42ba-96c7-910e1686bfd2","Mark 4:13"],
  ["f13972b1-1558-466c-abd8-68cc4a083d37","Mark 4:21"],["22736946-752e-414e-885c-af8a0651348e","Mark 4:21"],["698dc882-8765-4758-85a3-0cf7d9ce71b2","Mark 4:21"],
  ["4a7a0236-00e6-4045-9a02-d2d05d9c0d98","Mark 4:26"],["cbcd2c8e-c3a2-4dd4-80f4-3f7cc20ef5f7","Mark 4:30"],["8f5a7a3d-ca34-482a-a8c7-425cc0f54c83","Mark 4:30"]
] as const;
for(const [id] of targets) if(!db.prepare("SELECT id FROM audio_segments WHERE id=? AND project_id=? AND layer='original_reading'").get(id,projectId)) throw new Error(`Preflight failed for ${id}`);
db.exec("BEGIN TRANSACTION");
try { for(const [id,verseRef] of targets) recordSourceAlignmentSpeakerAttribution(db,{projectId,audioSegmentId:id,characterId:jesusId,verseRef,reviewerName:"Dan Brennan",evidence:"Producer approved the held Mark 4 mixed-speaker boundary candidate in voice review; this segment contains Jesus's quoted Hatam words after the narrated lead-in."}); db.exec("COMMIT"); }
catch(error){db.exec("ROLLBACK");throw error;}
const saved=(db.prepare("SELECT COUNT(*) n FROM audio_segments WHERE project_id=? AND layer='original_reading' AND speaker_character_id=? AND id IN (?,?,?,?,?,?,?,?)").get(projectId,jesusId,...targets.map(x=>x[0])) as {n:number}).n;
if(saved!==targets.length) throw new Error(`Verification failed: saved ${saved}/${targets.length}`);
console.log(`verified ${saved} Mark 4 teaching segments`);
