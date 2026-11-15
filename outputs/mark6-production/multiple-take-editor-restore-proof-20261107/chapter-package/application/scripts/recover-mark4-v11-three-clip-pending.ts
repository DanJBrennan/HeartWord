/** Recover a durable Mark 4:11 provider task after a local download fault.
 * This consumes no new provider job: it only downloads the task named in
 * the pending manifest and records it as held review history. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getDb } from "../src/db/client.js";
const projectId="8a5659a4-b033-4d5f-80e2-904b217cf8a0", shotId="17246352-3c8d-498a-b99e-47c70ff89d2a";
const dataDir=getDataDir(), db=getDb(), pendingPath=join(dataDir,"assets","generated","pilot-source","mark4-v11-three-clip-pending.json");
const pending=JSON.parse(readFileSync(pendingPath,"utf8")) as Array<{sequence:number;taskId:string}>;
const key=process.env.KLING_API_KEY_1; if(!key) throw Error("Kling key is unavailable.");
async function fetchRetry(url:string, options?:RequestInit){let last:unknown;for(let i=0;i<3;i++){try{const response=await fetch(url,options);if(response.ok)return response;last=Error(`HTTP ${response.status}`);}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,1000*(i+1)));}throw last;}
for(const entry of pending){
  const response=await fetchRetry(`https://api-singapore.klingai.com/v1/videos/image2video/${entry.taskId}`,{headers:{Authorization:`Bearer ${key}`}});
  const task=(await response.json()) as { code:number; data?:{ task_status?:string; task_result?:{ videos?:Array<{url?:string}> } } };
  const url=task.data?.task_result?.videos?.[0]?.url;
  if(task.code!==0 || task.data?.task_status!=="succeed" || !url) throw Error(`Provider task for segment ${entry.sequence} is not ready for recovery.`);
  const rel=join("generated","video",`mark4-v11-three-clip-recovered-${entry.sequence}-${entry.taskId}.mp4`), full=join(dataDir,"assets",rel);
  if(!existsSync(full)){mkdirSync(join(dataDir,"assets","generated","video"),{recursive:true});writeFileSync(full,Buffer.from(await (await fetchRetry(url)).arrayBuffer()),{flag:"wx"});}
  const duration=Math.round(Number(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",full],{encoding:"utf8"}).trim())*1000);
  const now=Date.now(), id=randomUUID();
  db.prepare("INSERT INTO generation_attempts (id,shot_id,provider,model,operation,resolution,prompt,status,result_asset_path,cost_usd,created_at) VALUES (?,?,'kling','kling-v2-6-pro','generate_coverage_base','720p',?,'hold_for_review',?,?,?)")
    .run(id,shotId,`Mark 4:11 three-clip pilot segment ${entry.sequence}. Recovered an already-submitted duplicate provider task after a transient local download failure; retained as alternate history, not a new submission.`,rel,0.6,now);
  db.prepare("INSERT INTO cost_ledger_entries (id,project_id,generation_attempt_id,amount_usd,created_at) VALUES (?,?,?,?,?)").run(randomUUID(),projectId,id,0.6,now);
  console.log(JSON.stringify({sequence:entry.sequence,taskId:entry.taskId,path:rel,durationMs:duration}));
}
writeFileSync(pendingPath,"[]\n");
