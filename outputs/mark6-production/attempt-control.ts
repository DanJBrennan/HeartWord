// Mark 6 operational limits around existing providers, not a pipeline stage.
import {existsSync,readFileSync,writeFileSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
const file='bounded-resume-20261104.json';
export type AttemptKind='crewRequests'|'includedStartingFrameGenerations'|'localLtxGenerations'|'geminiAvReviews';
const limitKey={crewRequests:'reviewRequestCount',includedStartingFrameGenerations:'includedStartingFrameGenerations',localLtxGenerations:'localLtxGenerations',geminiAvReviews:'geminiAvReviews'};
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export function reserveBoundedAttempt(root:string,kind:AttemptKind,id:string,now=Date.now()){
 const path=join(root,file);if(!existsSync(path))return; // Other/legacy runs unchanged.
 const lock=path+'.lock',fd=openSync(lock,'wx');closeSync(fd);
 try{
  const state=read(path),snapshot=read(join(root,'allowance-snapshot.json'));
  const age=now-Date.parse(snapshot.observedAt),limit=state.limits[limitKey[kind]],used=snapshot.usedPercent;
  if(!state.status.startsWith('authorized_')||!snapshot.ordinaryUsageAllowed||!Number.isFinite(age)||age<0||age>120000||!Number.isFinite(used)||used<0||used>100||used>=state.allowance.stopAtUsedPercent)throw Error('Bounded attempt held: allowance missing/stale, unavailable or at stop threshold');
  if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(state.usage[kind])||state.usage[kind]>=limit)throw Error('Bounded attempt request ceiling; no automatic expansion');
  const reservations=state.reservations??=[];
  if(reservations.some((r:any)=>r.id===id))throw Error('Existing attempt reservation; reconcile, never auto-repeat');
  reservations.push({kind,id,at:new Date(now).toISOString(),allowanceUsedPercent:used});
  state.usage[kind]++;writeFileSync(path,JSON.stringify(state,null,2));
 }finally{unlinkSync(lock);}
}
export async function awaitCrewPermit(root:string,request:{eventId:string;role:string}){
 const pending=join(root,'allowance-pending.json'),permit=join(root,'allowance-permit.json');
 writeFileSync(pending,JSON.stringify({...request,at:new Date().toISOString()}));
 console.log(JSON.stringify({status:'waiting_for_fresh_allowance_permit',...request}));
 const start=Date.now();
 // Waiting authorizes no submission. Allow the host to finish a reviewed image
 // or local operation without discarding the current role's completed parts.
 while(Date.now()-start<900000){
  if(existsSync(permit)){
   const p=read(permit);unlinkSync(permit);
   if(p.eventId!==request.eventId||Date.now()-Date.parse(p.at)>30000)throw Error('Mismatched/stale allowance permit; no submission');
   reserveBoundedAttempt(root,'crewRequests',request.eventId);unlinkSync(pending);return;
  }
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error('No fresh host allowance permit; no submission');
}
