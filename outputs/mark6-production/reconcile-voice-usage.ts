import {readFileSync,writeFileSync} from 'node:fs';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const root='outputs/mark6-production',state=JSON.parse(readFileSync(root+'/voices/execution.json','utf8'));
const headers={'xi-api-key':process.env.ELEVENLABS_API_KEY!};
const get=async(path:string)=>{const r=await fetch('https://api.elevenlabs.io'+path,{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Read-only voice reconciliation failed '+r.status);return r.json();};
const subscription=await get('/v1/user/subscription'),checks=[];
for(const c of state.calls){const h=await get('/v1/history/'+encodeURIComponent(c.usage.historyItemId));checks.push({id:c.id,historyItemId:h.history_item_id,voiceId:h.voice_id,modelId:h.model_id,characterCountChange:h.character_count_change_to-h.character_count_change_from,expectedCredits:c.reportedCredits,match:h.voice_id===c.voiceId&&h.character_count_change_to-h.character_count_change_from===c.reportedCredits});}
const result={at:new Date().toISOString(),readOnly:true,subscriptionUsed:subscription.character_count,before:state.subscriptionBefore.used,expectedDelta:state.spentReportedCredits,actualDelta:subscription.character_count-state.subscriptionBefore.used,history:checks,allMatch:checks.every(c=>c.match)};
writeFileSync(root+'/voices/usage-reconciliation.json',JSON.stringify(result,null,2));console.log(JSON.stringify({allMatch:result.allMatch,actualDelta:result.actualDelta,expectedDelta:result.expectedDelta}));
if(!result.allMatch)throw Error('History mismatch; no further voice calls until reconciled');
