import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {PRODUCTION_ROLE_REGISTRY,resolveRoleId} from "../pipeline/creative-direction/role-registry.js";
import {latestCrewRun,productionRecordForRun} from "../pipeline/creative-direction/crew-store.js";
export interface DiscussionEntry {
  id:string; source:"production_event"|"director_negotiation"; role:string; owner:string; roleLabel:string;
  at:number; sequence:number; runId:string|null; phase:string; round:number; summary:string;
  status:string; shotIds:string[]; verseRef:string|null; details:unknown; revision:string;
}
const signature=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function decode(value:string|null):{value:unknown;error:string|null} {
  if(!value)return {value:null,error:null};
  try{return {value:JSON.parse(value),error:null};}catch{return {value,error:"Saved structured output could not be decoded; original text is retained."};}
}
function owner(role:string) {
  const entry=PRODUCTION_ROLE_REGISTRY.find(item=>item.id===resolveRoleId(role));
  return {owner:entry?.owner??role,roleLabel:entry?.label??role.replaceAll("_"," ")};
}
export function readChapterDiscussion(db:DatabaseSync,projectId:string,now=Date.now()) {
  const project=db.prepare("SELECT id,language,book,chapter FROM projects WHERE id=?").get(projectId) as {id:string;language:string;book:string;chapter:number}|undefined;
  if(!project)throw new Error("Project not found.");
  const entries:DiscussionEntry[]=[],gaps:string[]=[];
  const has=(name:string)=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if(has("production_events")&&has("production_runs")) {
    const rows=db.prepare("SELECT e.id,e.role,e.round,e.sequence,e.output_json,e.error,e.created_at,r.id run_id,r.phase FROM production_events e JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? ORDER BY e.created_at,r.created_at,r.id,e.sequence,e.id").all(projectId) as unknown as Array<{id:string;role:string;round:number;sequence:number;output_json:string|null;error:string|null;created_at:number;run_id:string;phase:string}>;
    for(const row of rows) {
      const decoded=decode(row.output_json);
      const value=decoded.value&&typeof decoded.value==="object"&&!Array.isArray(decoded.value)?decoded.value as Record<string,unknown>:null;
      const shapeError=decoded.error??(row.output_json&&(!value||["directions","findings"].some(key=>value[key]!==undefined&&!Array.isArray(value[key])))?"Saved output has an invalid role-reply shape; inspect the retained original output.":null);
      const items=(key:string)=>Array.isArray(value?.[key])?(value[key] as unknown[]).filter((item):item is Record<string,unknown>=>!!item&&typeof item==="object"):[];
      const shotIds=[...new Set([...items("directions"),...items("findings")].flatMap(item=>typeof item.shotId==="string"?[item.shotId]:[]))];
      const status=row.error?"error":shapeError?"uncertain":typeof value?.decision==="string"?value.decision:items("findings").some(item=>item.severity==="blocking")?"finding":"recorded";
      const details={runId:row.run_id,role:row.role,output:decoded.value,error:row.error??shapeError};
      entries.push({id:`crew:${row.id}`,source:"production_event",role:resolveRoleId(row.role)??row.role,...owner(row.role),at:row.created_at,sequence:row.sequence,runId:row.run_id,phase:row.phase,round:row.round,summary:row.error??shapeError??(typeof value?.summary==="string"?value.summary:"No summary recorded; inspect the saved output."),status,shotIds,verseRef:null,details,revision:signature(details)});
    }
  } else gaps.push("Production-role event history is unavailable in this database.");
  if(has("director_negotiation_log")) {
    const rows=db.prepare("SELECT * FROM director_negotiation_log WHERE project_id=? ORDER BY created_at,round,rowid").all(projectId) as unknown as Array<{id:string;role:string;verdict:string|null;content:string;created_at:number;round:number;idea_id:string;narration_span_verse_ref:string}>;
    for(const [sequence,row] of rows.entries()) {
      let parsed:unknown; try{parsed=JSON.parse(row.content);}catch{parsed=row.content;}
      const object=parsed as Record<string,unknown>|null;
      const description=typeof parsed==="string"?parsed:[object?.summary,object?.description,object?.reasoning,object?.reason,object?.purpose].find(value=>typeof value==="string") as string|undefined;
      const details={ideaId:row.idea_id,verdict:row.verdict,content:parsed};
      entries.push({id:`negotiation:${row.id}`,source:"director_negotiation",role:resolveRoleId(row.role)??row.role,...owner(row.role),at:row.created_at,sequence,runId:null,phase:"legacy coverage negotiation",round:row.round,summary:description??row.content,status:row.verdict??"proposal",shotIds:[],verseRef:row.narration_span_verse_ref,details,revision:signature(details)});
    }
  } else gaps.push("Historical director negotiation records are unavailable in this database.");
  entries.sort((a,b)=>a.at-b.at||(a.runId??a.source).localeCompare(b.runId??b.source)||a.sequence-b.sequence||a.id.localeCompare(b.id));
  let current;
  try { current=has("production_runs")?productionRecordForRun(db,latestCrewRun(db,projectId,"planning")):undefined; }
  catch { gaps.push("Current structured planning record could not be read. Saved exchanges remain inspectable; no current approval is inferred."); }
  const shots=db.prepare("SELECT sh.id,sh.sequence,sc.sequence sceneSequence,sh.verse_ref FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY sc.sequence,sh.sequence").all(projectId) as unknown as Array<{id:string;sequence:number;sceneSequence:number;verse_ref:string|null}>;
  return {project,observedAt:now,entries,gaps,shots,current:current?{revision:current.revision,status:current.status,objections:current.objections}:null,
    note:"Replay of actual saved role replies and historical casting/coverage negotiation. No presentation scripts, generated dialogue, synthesized speech, live-worker claims or new approvals. Saved timestamps are original; playback pacing is a compressed presentation."};
}
export type ChapterDiscussion=ReturnType<typeof readChapterDiscussion>;
