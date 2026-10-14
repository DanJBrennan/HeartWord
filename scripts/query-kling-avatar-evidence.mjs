/** Documented existing-task GETs only; never discovers fields by generation. */
import 'dotenv/config';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.env.HEARTWORD_DATA_DIR || 'C:/Users/danbr/HeartWordData';
const key=process.env.KLING_API_KEY_1;
if(!key)throw new Error('Kling credential unavailable');
for(const id of ['317949919322306','935054166702034982']){
  const response=await fetch(`https://api-singapore.klingai.com/v1/videos/avatar/image2video/${id}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  writeFileSync(join(root,`research/kling-avatar-2026-10-14/task-${id}.json`),JSON.stringify({queriedAt:new Date().toISOString(),httpStatus:response.status,body},null,2));
  console.log(JSON.stringify({id,status:response.status,code:body.code,message:body.message,returnedFields:Object.keys(body.data ?? {}),taskInfo:body.data?.task_info}));
}
