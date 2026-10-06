/** Generate only the three silent base-motion candidates selected for the
 * Dan-approved Mark 4:11 pilot. Each result remains held for face review
 * and source-bound lip sync; no chapter timeline is changed. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";

const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", shotId="17246352-3c8d-498a-b99e-47c70ff89d2a";
const dataDir=getDataDir(), db=getDb(), provider=new KlingFaceLipSyncProvider();
const pendingPath=join(dataDir,"assets","generated","pilot-source","mark4-v11-three-clip-pending.json");
const manifest=JSON.parse(readFileSync(join(dataDir,"assets","generated","pilot-source","mark4-v11-three-clip-pilot.json"),"utf8")) as {
  segments:Array<{sequence:number;sourceStartMs:number;sourceEndMs:number;coverageBeatId:string;role:string}>;
  selectedKeyframes:Array<{coverageBeatId:string;path:string}>;
};
const prompts:Record<number,string>={
  1:"Mark 4:11 three-clip pilot segment 1. Hold the approved over-shoulder master of Jesus and the small private teaching circle. Keep Jesus's mouth obscured or unreadable while the real source speech will play underneath. Only natural small posture, cloth, and listener movement; no invented speech, no audible dialogue, no new people, no camera move, no canon or wardrobe change.",
  2:"Mark 4:11 three-clip pilot segment 2. Hold the approved medium-close Jesus teaching composition. Jesus is the single clear foreground speaking face, with restrained natural breathing, eye and head movement, and a neutral resting mouth for later source-audio face-targeted lip sync. Listeners remain quiet and out of focus. No invented speech, no audible dialogue, no new people, no camera move, no canon or wardrobe change.",
  3:"Mark 4:11 three-clip pilot segment 3. Hold the approved distinct three-quarter Jesus teaching composition for the landing. Jesus is the single clear foreground speaking face, with restrained natural breathing, eye and head movement, and a neutral resting mouth for later source-audio face-targeted lip sync. Listeners remain quiet and out of focus. No invented speech, no audible dialogue, no new people, no camera move, no canon or wardrobe change."
};
const keyframeFor=(beatId:string)=>{
  const row=manifest.selectedKeyframes.find(item=>item.coverageBeatId===beatId);
  if(!row || !existsSync(join(dataDir,"assets",row.path))) throw Error(`Missing approved pilot keyframe for ${beatId}.`);
  return row.path;
};
const durationMs=(path:string)=>Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",path],{encoding:"utf8"}).trim())*1000);
const pending=existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath,"utf8")) as Array<{sequence:number;taskId:string}> : [];
const savePending=()=>writeFileSync(pendingPath,JSON.stringify(pending,null,2));

const result=[];
for(const segment of manifest.segments){
  const label=`Mark 4:11 three-clip pilot segment ${segment.sequence}`;
  const prompt=prompts[segment.sequence]; if(!prompt) throw Error(`Missing fixed prompt for ${label}.`);
  const prior=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='generate_coverage_base' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1")
    .get(shotId,`${label}%`) as {id:string;result_asset_path:string}|undefined;
  if(prior && existsSync(join(dataDir,"assets",prior.result_asset_path))){ result.push({sequence:segment.sequence,reused:true,attemptId:prior.id,path:prior.result_asset_path}); continue; }
  if(pending.some(item=>item.sequence===segment.sequence)) throw Error(`${label} already has a durable provider task awaiting recovery; do not resubmit it.`);
  const {taskId,videoUrl}=await provider.generateSceneVideo({path:keyframeFor(segment.coverageBeatId)},prompt,5,async submittedTaskId=>{pending.push({sequence:segment.sequence,taskId:submittedTaskId});savePending();});
  const response=await fetch(videoUrl); if(!response.ok) throw Error(`${label} base download failed: ${response.status}.`);
  const rel=join("generated","video",`mark4-v11-three-clip-base-${segment.sequence}-${taskId}.mp4`);
  mkdirSync(join(dataDir,"assets","generated","video"),{recursive:true});
  writeFileSync(join(dataDir,"assets",rel),Buffer.from(await response.arrayBuffer()),{flag:"wx"});
  const actualMs=durationMs(join(dataDir,"assets",rel));
  if(actualMs<segment.sourceEndMs-segment.sourceStartMs) throw Error(`${label} is too short for its exact source slice.`);
  const attemptId=randomUUID(),now=Date.now();
  db.exec("BEGIN IMMEDIATE"); try {
    db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'kling','kling-v2-6-pro','generate_coverage_base','720p',?,'hold_for_review',?,?,?)")
      .run(attemptId,shotId,prompt,rel,0.6,now);
    db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),projectId,attemptId,0.6,now);
    db.prepare("INSERT INTO review_notes (id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES (?,?,'shot',?,'qc',?,0,?)")
      .run(randomUUID(),projectId,shotId,`${label} is a silent held base-motion candidate for the exact ${segment.sourceStartMs}-${segment.sourceEndMs} ms source slice.`,now);
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
  pending.splice(pending.findIndex(item=>item.sequence===segment.sequence && item.taskId===taskId),1); savePending();
  result.push({sequence:segment.sequence,taskId,attemptId,path:rel,durationMs:actualMs});
}
console.log(JSON.stringify(result,null,2));
