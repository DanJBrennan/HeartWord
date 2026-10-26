/** Request one bounded Jesus Meyah 4:9 voice audition in the isolated project.
 * Dan authorized a newly reviewed 2–15 s audition before bulk conversion.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024");
const rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Voice audition must run against the isolated worktree root");
if(!existsSync(join(root,"review","meyah-mark4-reviewed-correspondence-application.json")))
  throw new Error("The approved isolated target correspondence must be applied first");
if(!process.env.ELEVENLABS_API_KEY)throw new Error("ElevenLabs is unavailable; no provider request was made");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const segmentId="96ff1b8b-7b03-45fc-93d7-c6ee60d0f520"; // reviewed Jesus 4:9, 142.703–152.394 s
const {getDb}=await import("../src/db/client.js");
const {validateEditionAuditionScope}=await import("../src/pipeline/language-edition-audition.js");
const {runVoicing}=await import("../src/pipeline/voicing/index.js");
const db=getDb();
validateEditionAuditionScope(db,root,projectId,[segmentId]);
const before=db.prepare("SELECT COUNT(*) n FROM composite_audio_source_map WHERE original_segment_id=?").get(segmentId) as {n:number};
const result=await runVoicing(projectId,{sourceSegmentIds:[segmentId]});
if(!result.ok||result.generated+result.reused!==1)throw new Error(`Bounded Meyah voice audition held: ${result.reasoning}`);
const cast=db.prepare(`SELECT a.source_path AS path,a.start_ms AS startMs,a.end_ms AS endMs
  FROM composite_audio_source_map m JOIN audio_segments a ON a.id=m.composite_segment_id
  WHERE m.original_segment_id=? AND a.project_id=?`).get(segmentId,projectId) as {path:string;startMs:number;endMs:number}|undefined;
if(!cast||!existsSync(join(root,"assets",cast.path))||!existsSync(join(root,"assets",`${cast.path}.json`)))
  throw new Error("The bounded cast candidate or its settings sidecar was not retained");
const report={kind:"isolated_meyah_mark4_voice_audition_candidate",projectId,sourceSegmentId:segmentId,
  sourceStartMs:142703,sourceEndMs:152394,sourceDurationMs:9691,castPath:cast.path,
  castStartMs:cast.startMs,castEndMs:cast.endMs,generated:result.generated,reused:result.reused,
  mappedBefore:before.n,reasoning:result.reasoning,approval:"pending_Dan_listening_review",
  targetDataRoot:root,liveDatabaseOpened:false};
const reportPath=join(root,"review","meyah-mark4-jesus-v9-voice-audition-candidate.json");
writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...report,reportPath},null,2));
