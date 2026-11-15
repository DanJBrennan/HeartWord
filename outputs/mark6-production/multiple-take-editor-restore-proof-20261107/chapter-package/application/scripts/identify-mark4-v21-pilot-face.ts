import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/db/client.js";
import { KlingFaceLipSyncProvider } from "../src/providers/kling/index.js";
const key=process.env.KLING_API_KEY_1;if(!key)throw Error("Kling key unavailable.");const taskId="933007854700331011",dataDir=getDataDir();
const response=await fetch(`https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`,{headers:{Authorization:`Bearer ${key}`}});const task=await response.json() as {data?:{task_result?:{videos?:Array<{url?:string}>}}};const url=task.data?.task_result?.videos?.[0]?.url;if(!url)throw Error("Base unavailable.");
const faces=await new KlingFaceLipSyncProvider().identifyFaces(url),dir=join(dataDir,"assets","generated","face-thumbs","mark4-v21",taskId);mkdirSync(dir,{recursive:true});const out=[];for(const [i,face] of faces.entries()){const image=await fetch(face.thumbnailUrl);const path=join(dir,`face-${i+1}.jpg`);writeFileSync(path,Buffer.from(await image.arrayBuffer()));out.push({candidate:i+1,faceId:face.faceId,start:face.startTime,end:face.endTime,path});}console.log(JSON.stringify(out,null,2));
