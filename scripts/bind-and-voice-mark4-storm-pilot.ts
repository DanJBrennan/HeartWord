import { getDb } from "../src/db/client.js";
import { bindShotUtterance } from "../src/pipeline/voice-lipsync/utterance-binding.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";
const p="8a5659a4-b033-4d5f-80e2-904b217cf8a0", db=getDb();
const rows=[
 ["6db6f5f1-ced4-4675-82f4-05c772333d01",473234,476434],
 ["c02b7bd2-d16d-4163-b7a0-88f32ae3e1dd",486583,488521],
 ["89ba4fb7-5e0a-4049-b4f2-6ec9fc778d64",499351,501407],
 ["404d00a7-a0c5-4d64-ae50-281e60f93302",502017,504416]
] as const;
const sourceIds:string[]=[];
for(const [shotId,start,end] of rows){
 const s=db.prepare("SELECT id,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=? AND end_ms=?").get(p,start,end) as {id:string;speaker_character_id:string};
 const v=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'").get(s.speaker_character_id) as {id:string};
 if(!db.prepare("SELECT id FROM shot_utterance_bindings WHERE shot_id=?").get(shotId)) bindShotUtterance(db,{projectId:p,shotId,sourceSegmentId:s.id,startMs:start,endMs:end,characterVersionId:v.id,approvedBy:"Dan Brennan"});
 sourceIds.push(s.id);
}
console.log(JSON.stringify(await runVoicing(p,{sourceSegmentIds:sourceIds}),null,2));
