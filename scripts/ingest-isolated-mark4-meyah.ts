/** Draft target timing locally in the fixed isolated root, with Gemini disabled. */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

if(process.argv.slice(2).join(" ")!=="--apply")throw new Error("Use exactly --apply in the isolated checkout.");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=resolve(checkout,"output","mark4-donor-20261024");
if(realpathSync(root)!==root)throw new Error("Expected the fixed isolated data root.");
process.env.HEARTWORD_DATA_DIR=root;
process.env.GEMINI_API_KEY="";
const {getDb}=await import("../src/db/client.js");
const {runIngestionWithAlignment}=await import("../src/pipeline/ingestion/index.js");
const {detectSilences}=await import("../src/pipeline/ingestion/detect-silences.js");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const db=getDb();
const project=db.prepare("SELECT language,book,chapter FROM projects WHERE id=?").get(projectId) as {language:string;book:string;chapter:number}|undefined;
if(project?.language!=="meyah"||project.book!=="mark"||project.chapter!==4)throw new Error("Expected the isolated Meyah Mark 4 project.");
const source=resolve(root,"assets","source/meyah/audio/Meyah_mej_TBL_NT_Non-Drama/B02___04_Markus______MEJTBLN1DA.mp3");
const opening=detectSilences(source).find(gap=>gap.startMs<4000 && gap.endMs>4000);
if(!opening)throw new Error("The heard chapter heading has no measured pause around four seconds.");
const endMs=Math.round((opening.startMs+opening.endMs)/2);
const observation=`Dan heard the spoken Meyah chapter heading before verse one, which starts about four seconds in. The measured opening pause is ${opening.startMs}–${opening.endMs} ms; the provisional boundary is its ${endMs} ms midpoint. Exact word timing remains unreviewed.`;
const result=await runIngestionWithAlignment(projectId,undefined,{spokenChapterHeading:{endMs,reviewer:"Dan Brennan",evidence:observation}});
if(result.ok && !db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='project' AND source='human' AND note=?").get(projectId,observation))
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'project',?,'human',?,0,?)")
    .run(randomUUID(),projectId,projectId,observation,Date.now());
const row=db.prepare("SELECT COUNT(*) AS count FROM audio_segments WHERE project_id=? AND layer='original_reading'").get(projectId) as {count:number};
console.log(JSON.stringify({result,originalReadingSegments:row.count,spokenHeadingEndMs:endMs,
  geminiDisabled:true,sourceReviewRecorded:false},null,2));
