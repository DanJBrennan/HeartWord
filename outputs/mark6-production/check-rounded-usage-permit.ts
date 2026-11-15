import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {reserveBoundedAttempt} from './attempt-control.js';
const root=mkdtempSync('outputs/mark6-production/allowance-guard-fixture-'),now=Date.now(),results=[];
for(const [name,used,allowed,age,expected] of [['rounded100-permitted',100,true,0,true],['ordinary-disabled',100,false,0,false],['stale-reading',100,true,121000,false],['invalid-percent',101,true,0,false],['fresh-zero',0,true,0,true]] as const){
 const state={status:'authorized_fixture_only',limits:{localLtxGenerations:2},usage:{localLtxGenerations:0},allowance:{stopAtUsedPercent:101},reservations:[]};writeFileSync(join(root,'bounded-resume-20261104.json'),JSON.stringify(state));writeFileSync(join(root,'allowance-snapshot.json'),JSON.stringify({observedAt:new Date(now-age).toISOString(),ordinaryUsageAllowed:allowed,usedPercent:used}));let passed=true;try{reserveBoundedAttempt(root,'localLtxGenerations','fixture-'+name,now);}catch{passed=false;}if(passed!==expected)throw Error('Guard regression:'+name);const saved=JSON.parse(readFileSync(join(root,'bounded-resume-20261104.json'),'utf8'));if(saved.usage.localLtxGenerations!==(expected?1:0))throw Error('Denied fixture mutated counter');results.push({name,permitted:passed});
}
const proof={at:new Date().toISOString(),fixtureRoot:root,results,productionReservationsAdded:0,providerCalls:0,purchases:0,resets:0};writeFileSync('outputs/mark6-production/rounded-usage-permit-check-20261106.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
