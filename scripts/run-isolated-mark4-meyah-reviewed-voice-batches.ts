/** Convert each reviewed Meyah speech run separately after Dan's audition approval.
 * Re-running skips intact mapped runs. No donor or live HeartWordData path opens.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("Meyah voice batches must stay inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const maxArg=process.argv.find(arg=>arg.startsWith("--max-runs="));
const maxRuns=maxArg?Number(maxArg.split("=")[1]):Infinity;
if(!(maxRuns>0&&Number.isInteger(maxRuns)||maxRuns===Infinity))throw new Error("Use a positive --max-runs=N");
const [{getDb},{assertEditionVoiceAuditionApproved},{readConfirmedSpeechRuns},{runVoicing}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/language-edition-audition.js"),
  import("../src/pipeline/ingestion/continuous-speech.js"),import("../src/pipeline/voicing/index.js")]);
const db=getDb(),approved=assertEditionVoiceAuditionApproved(db,root,projectId);
const dbPath=join(root,"db","heartword.sqlite"),backup=join(root,"review","pre-reviewed-voice-batches-20261025.sqlite");
if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
const runs=readConfirmedSpeechRuns(db,projectId,root).filter(run=>run.characterId!==null)
  .sort((a,b)=>(a.endMs-a.startMs)-(b.endMs-b.startMs));
const reportPath=join(root,"review","meyah-mark4-reviewed-voice-batches.json");
type Item={runId:string;verseRef:string;speakerId:string|null;sourceDurationMs:number;segmentIds:string[];
  generated:number;reused:number;castPaths:string[];castDurationsMs:number[];status:"ready"|"held";reasoning:string};
const prior=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,"utf8")) as {items:Item[];planHash:string}:null;
if(prior&&prior.planHash!==approved.planHash)throw new Error("The saved voice batch report belongs to a different reviewed plan");
const items=prior?.items??[];
const save=()=>writeFileSync(reportPath,JSON.stringify({kind:"isolated_meyah_mark4_reviewed_voice_batches",projectId,
  planHash:approved.planHash,auditionSourceSegmentIds:approved.sourceSegmentIds,items,
  providerUsage:"See each cast sidecar; direct price is not reported by ElevenLabs here",
  liveDatabaseOpened:false},null,2)+"\n");
const mapped=(id:string)=>db.prepare(`SELECT a.source_path AS path,a.start_ms AS startMs,a.end_ms AS endMs FROM composite_audio_source_map m
  JOIN audio_segments a ON a.id=m.composite_segment_id WHERE m.original_segment_id=? AND a.project_id=?`).get(id,projectId) as
  {path:string;startMs:number;endMs:number}|undefined;
let processed=0;
for(const run of runs){
  const ids=run.members.map(member=>member.id);
  const already=ids.map(mapped);
  if(already.every(Boolean))continue;
  if(already.some(Boolean))throw new Error(`Reviewed speech ${run.verseRef} has a partial cast map; reconcile before spending`);
  if(processed>=maxRuns)break;
  console.log(`Converting ${run.verseRef} (${((run.endMs-run.startMs)/1000).toFixed(3)} s, ${ids.length} source rows)`);
  try{
    const result=await runVoicing(projectId,{sourceSegmentIds:ids});
    if(!result.ok||result.generated!==1)throw new Error(result.reasoning);
    const cast=ids.map(mapped);
    if(cast.some(item=>!item))throw new Error("A paid voice result did not map every reviewed speech row");
    const paths=[...new Set(cast.map(item=>item!.path))];
    for(const path of paths){const abs=join(root,"assets",path);if(!existsSync(abs)||!existsSync(`${abs}.json`))
      throw new Error("A generated cast master or its settings sidecar is missing");}
    items.push({runId:run.id,verseRef:run.verseRef,speakerId:run.characterId,sourceDurationMs:run.endMs-run.startMs,
      segmentIds:ids,generated:result.generated,reused:result.reused,castPaths:paths,
      castDurationsMs:cast.map(item=>item!.endMs-item!.startMs),status:"ready",reasoning:result.reasoning});
    save();processed++;
    console.log(`Saved ${run.verseRef}: ${paths.join(", ")}`);
  }catch(error){
    const reason=(error as Error).message;
    items.push({runId:run.id,verseRef:run.verseRef,speakerId:run.characterId,sourceDurationMs:run.endMs-run.startMs,
      segmentIds:ids,generated:0,reused:0,castPaths:[],castDurationsMs:[],status:"held",reasoning:reason});
    save();throw error;
  }
}
const remaining=runs.filter(run=>run.members.some(member=>!mapped(member.id)));
console.log(JSON.stringify({projectId,approvedAudition:true,processed,remaining:remaining.map(run=>run.verseRef),reportPath},null,2));
