/** Free/read-only evidence after account-balance rejection. Never retries POST. */
import 'dotenv/config';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.env.HEARTWORD_DATA_DIR || 'C:/Users/danbr/HeartWordData';
const dir=join(root,'research/kling-avatar-2026-10-14');
const state=JSON.parse(readFileSync(join(dir,'comparison-run.json'),'utf8'));
const get=async path=>{const r=await fetch(`https://api-singapore.klingai.com${path}`,{headers:{Authorization:`Bearer ${process.env.KLING_API_KEY_1}`},signal:AbortSignal.timeout(20000)});return {httpStatus:r.status,body:await r.json()};};
const queries=[];
for(const p of state.planned)queries.push({externalTaskId:p.requestId,...await get(`/v1/videos/avatar/image2video/${p.requestId}`)});
const account=await get(`/account/costs?start_time=${Date.parse('2026-07-01T00:00:00Z')}&end_time=${Date.now()}`);
const list=await get('/v1/videos/avatar/image2video?pageNum=1&pageSize=500');
const report={observedAt:new Date().toISOString(),queries,account,accountRemainingMayLagHours:12,avatarList:list,newTasksReturned:queries.filter(q=>q.body.code===0).length,actualNewBilledUsd:null,noAutomaticRetry:true};
writeFileSync(join(dir,'comparison-rejection-reconciliation.json'),JSON.stringify(report,null,2));
Object.assign(state,{scope:'standalone proof of concept; never belonged to a film (Dan, October 14)',status:'held_api_balance_insufficient',rejectionReconciliation:'comparison-rejection-reconciliation.json',actualNewBilledUsd:null,newProviderTasksReturned:report.newTasksReturned,noAutomaticRetry:true});
writeFileSync(join(dir,'comparison-run.json'),JSON.stringify(state,null,2));
console.log(JSON.stringify({queries:queries.map(q=>({id:q.externalTaskId,httpStatus:q.httpStatus,code:q.body.code,message:q.body.message})),accountStatus:account.httpStatus,avatarTaskCount:list.body.data?.length,newTasksReturned:report.newTasksReturned,actualNewBilledUsd:null},null,2));
