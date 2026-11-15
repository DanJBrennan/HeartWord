/** Source-bound, single-face lip sync for the two Jesus inserts in the
 * Mark 4:11 three-clip pilot. Results are held for review, never selected
 * into a chapter timeline. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", shotId="17246352-3c8d-498a-b99e-47c70ff89d2a", originalId="95b36a21-021d-4ca3-b1d8-c1f5f1569f67";
const dataDir=getDataDir(),db=getDb(),key=process.env.KLING_API_KEY_1; if(!key) throw Error("Kling key is unavailable.");
const pendingPath=join(dataDir,"assets","generated","pilot-source","mark4-v11-three-clip-lipsync-pending.json");
const pending=existsSync(pendingPath)?JSON.parse(readFileSync(pendingPath,"utf8")) as Array<{sequence:number;taskId:string}>:[]; const save=()=>writeFileSync(pendingPath,JSON.stringify(pending,null,2));
const takes=[
  {sequence:2,baseTaskId:"933001983374528609",faceId:"0",start:3443,end:8416,label:"first Jesus insert"},
  {sequence:3,baseTaskId:"933003295017934939",faceId:"0",start:8416,end:11068,label:"final Jesus insert"}
] as const;
const audio=db.prepare(`SELECT original.start_ms original_start,original.end_ms original_end,composite.source_path,composite.start_ms composite_start,composite.end_ms composite_end,map.source_hash,ub.source_hash binding_hash
  FROM shot_utterance_bindings ub JOIN audio_segments original ON original.id=ub.source_audio_segment_id JOIN composite_audio_source_map map ON map.original_segment_id=original.id JOIN audio_segments composite ON composite.id=map.composite_segment_id AND composite.layer='composite_cast_master' WHERE ub.shot_id=? AND ub.source_audio_segment_id=?`).get(shotId,originalId) as {original_start:number;original_end:number;source_path:string;composite_start:number;composite_end:number;source_hash:string;binding_hash:string}|undefined;
if(!audio || audio.source_hash!==audio.binding_hash || !existsSync(join(dataDir,"assets",audio.source_path))) throw Error("The Mark 4:11 composite source binding is unavailable.");
async function baseUrl(taskId:string){const response=await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`,{headers:{Authorization:`Bearer ${key}`}});const task=await response.json() as {code:number;data?:{task_status?:string;task_result?:{videos?:Array<{url?:string}>}}};const url=task.data?.task_result?.videos?.[0]?.url;if(!response.ok||task.code!==0||task.data?.task_status!=="succeed"||!url)throw Error(`Base ${taskId} is unavailable.`);return url;}
const provider=new KlingFaceLipSyncProvider(), output=[];
for(const take of takes){
  const prior=db.prepare("SELECT id,result_asset_path FROM generation_attempts WHERE shot_id=? AND operation='lip_sync' AND prompt LIKE ? ORDER BY created_at DESC LIMIT 1").get(shotId,`Mark 4:11 three-clip pilot segment ${take.sequence}%`) as {id:string;result_asset_path:string}|undefined;
  if(prior&&existsSync(join(dataDir,"assets",prior.result_asset_path))){output.push({sequence:take.sequence,reused:true,path:prior.result_asset_path});continue;}
  if(pending.some(item=>item.sequence===take.sequence))throw Error(`${take.label} already has a durable lip-sync task awaiting recovery.`);
  const scale=(audio.composite_end-audio.composite_start)/(audio.original_end-audio.original_start), startMs=Math.round(take.start*scale),endMs=Math.round(take.end*scale);
  const result=await provider.syncFace(await baseUrl(take.baseTaskId),take.faceId,{path:audio.source_path,startMs,endMs},0,async taskId=>{pending.push({sequence:take.sequence,taskId});save();});
  if(!result.media||!existsSync(join(dataDir,"assets",result.media.path)))throw Error(`${take.label} lip-sync output was not retained.`);
  const id=randomUUID(),now=Date.now(),prompt=`Mark 4:11 three-clip pilot segment ${take.sequence}: ${take.label}; visually confirmed Jesus Candidate 1 (provider face ${take.faceId}); exact original source offset ${take.start}-${take.end} ms; composite source slice ${startMs}-${endMs} ms.`;
  db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,?,?,? ,?,'hold_for_review',?,?,?)").run(id,shotId,result.provenance.provider,result.provenance.model,"lip_sync",prompt,result.media.path,result.cost.usd,now);db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),projectId,id,result.cost.usd,now);db.exec("COMMIT");}catch(error){db.exec("ROLLBACK");throw error;}
  pending.splice(pending.findIndex(item=>item.sequence===take.sequence),1);save();output.push({sequence:take.sequence,path:result.media.path,sourceMs:[take.start,take.end]});
}
console.log(JSON.stringify(output,null,2));
