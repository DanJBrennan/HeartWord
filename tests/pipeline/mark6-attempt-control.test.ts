import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect} from 'vitest';
import {reserveBoundedAttempt} from '../../outputs/mark6-production/attempt-control.js';
it('enforces the account threshold, fresh readings and finite reservations without expanding the budget',()=>{
 const root=mkdtempSync(join(tmpdir(),'hw-attempt-')),now=Date.now();
 const state=join(root,'bounded-resume-20261104.json'),snapshot=join(root,'allowance-snapshot.json');
 try{
  const initial={status:'authorized_test',allowance:{stopAtUsedPercent:5},limits:{reviewRequestCount:2},usage:{crewRequests:0}};
  writeFileSync(state,JSON.stringify(initial));
  expect(()=>reserveBoundedAttempt(root,'crewRequests','a',now)).toThrow();
  const sample=(usedPercent:number,observedAt=now)=>writeFileSync(snapshot,JSON.stringify({ordinaryUsageAllowed:true,usedPercent,observedAt:new Date(observedAt).toISOString()}));
  sample(5);expect(()=>reserveBoundedAttempt(root,'crewRequests','a',now)).toThrow('stop threshold');
  sample(0,now-120001);expect(()=>reserveBoundedAttempt(root,'crewRequests','a',now)).toThrow('stale');
  sample(0);reserveBoundedAttempt(root,'crewRequests','a',now);
  expect(()=>reserveBoundedAttempt(root,'crewRequests','a',now)).toThrow('never auto-repeat');
  reserveBoundedAttempt(root,'crewRequests','b',now);
  expect(()=>reserveBoundedAttempt(root,'crewRequests','c',now)).toThrow('ceiling');
  const result=JSON.parse(readFileSync(state,'utf8'));expect(result.usage.crewRequests).toBe(2);expect(result.reservations).toHaveLength(2);
 }finally{rmSync(root,{recursive:true,force:true});}
});
