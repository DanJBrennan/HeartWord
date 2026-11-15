/** Save provider face thumbnails for the two speaking clips in the bounded
 * Mark 4:11 pilot. This is inspection only; it never submits lip sync. */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
const dataDir=getDataDir(), key=process.env.KLING_API_KEY_1; if(!key) throw Error("Kling key is unavailable.");
const takes=[
  { sequence:2, taskId:"933001983374528609", label:"Mark 4:11 first Jesus insert" },
  { sequence:3, taskId:"933003295017934939", label:"Mark 4:11 final Jesus insert" }
];
const provider=new KlingFaceLipSyncProvider(), results=[];
for(const take of takes){
  const response=await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${take.taskId}`,{headers:{Authorization:`Bearer ${key}`}});
  const task=await response.json() as {code:number;data?:{task_status?:string;task_result?:{videos?:Array<{url?:string}>}}};
  const url=task.data?.task_result?.videos?.[0]?.url;
  if(!response.ok || task.code!==0 || task.data?.task_status!=="succeed" || !url) throw Error(`${take.label} base is unavailable.`);
  const faces=await provider.identifyFaces(url); const dir=join(dataDir,"assets","generated","face-thumbs","mark4-v11",take.taskId); mkdirSync(dir,{recursive:true});
  const saved=[];
  for(const [index,face] of faces.entries()) { const name=`face-${index+1}.jpg`,full=join(dir,name); const image=await fetch(face.thumbnailUrl); if(!image.ok) throw Error(`Face thumbnail failed for ${take.label}.`); writeFileSync(full,Buffer.from(await image.arrayBuffer())); saved.push({candidate:index+1,faceId:face.faceId,startTime:face.startTime,endTime:face.endTime,path:join("generated","face-thumbs","mark4-v11",take.taskId,name)}); }
  results.push({label:take.label,taskId:take.taskId,faces:saved});
}
console.log(JSON.stringify(results,null,2));
