/** Record Codex's reviewed, source-clock LTX take choices on isolated shots. */
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Not isolated");
process.env.HEARTWORD_DATA_DIR=root;
const {getDb}=await import("../src/db/client.js");
const db=getDb(),projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const selections=[
  {shotId:"632e9a87-93d3-49cc-a3a0-394e0f8ee121",attemptId:"91f77d41-179d-4a93-a0b0-00ffa6360cc6",clipId:"0c5cb878-7686-4bb7-9cf7-1b0a08e5244d",durationMs:3250,
    note:"Codex selected only the first 3250 ms of the shot 29 final LTX take after full-group and Jesus-face frame inspection. Full and exact-placement QC both reported no visible speech or identity drift but scored below automatic confidence; see docs/production/mark4-meyah/shot-029-final-selection.md. The unused raw take remains retained."},
  {shotId:"705cdbc7-3226-4725-a375-4d6410e91002",attemptId:"0f7fe390-9e28-411f-86a5-12b6f2b21211",clipId:"7a58574a-4d16-4783-b34a-2e77d2c0884c",durationMs:4807,
    note:"Codex selected only the first 4807 ms of the shot 52 final LTX take after reviewing the seed-path contact sheet. QC described visual continuity and no unexpected elements but scored below automatic confidence; see docs/production/mark4-meyah/shot-052-final-selection.md. The unused raw take remains retained."}
] as const;
const receiptPath=join(root,"review","meyah-mark4-reviewed-video-selections-20261026.json");
if(existsSync(receiptPath))throw Error("Selections already recorded; inspect the receipt");
for(const item of selections){
  const row=db.prepare(`SELECT c.timeline_start_ms startMs,c.timeline_end_ms endMs,ga.status
    FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id
    JOIN shots sh ON sh.id=c.shot_id JOIN scenes s ON s.id=sh.scene_id
    WHERE c.id=? AND c.shot_id=? AND ga.id=? AND ga.operation='generate_final_video' AND s.project_id=?`)
    .get(item.clipId,item.shotId,item.attemptId,projectId) as {startMs:number;endMs:number;status:string}|undefined;
  if(row?.startMs!==0||row.endMs!==item.durationMs||row.status!=="accepted")throw Error(`Selected clip changed: ${item.shotId}`);
  if(db.prepare("SELECT id FROM review_notes WHERE project_id=? AND subject_type='shot' AND subject_id=? AND note=?")
    .get(projectId,item.shotId,item.note))throw Error("Selection note already exists");
}
const now=Date.now(),noteIds:string[]=[];
db.exec("BEGIN IMMEDIATE");
try{
  for(const item of selections){
    const id=randomUUID();noteIds.push(id);
    db.prepare(`INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)
      VALUES(?,?,'shot',?,'qc',?,1,?)`).run(id,projectId,item.shotId,item.note,now);
  }
  db.exec("COMMIT");
}catch(error){db.exec("ROLLBACK");throw error;}
const receipt={kind:"isolated_meyah_mark4_reviewed_video_selections",projectId,
  selections:selections.map((item,index)=>({shotId:item.shotId,attemptId:item.attemptId,clipId:item.clipId,durationMs:item.durationMs,reviewNoteId:noteIds[index]})),
  liveDatabaseOpened:false,providerRequests:0};
writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt,null,2));
