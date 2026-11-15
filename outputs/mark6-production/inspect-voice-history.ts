import{readFileSync}from'node:fs';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const s=JSON.parse(readFileSync('outputs/mark6-production/voices/execution.json','utf8'));
const r=await fetch('https://api.elevenlabs.io/v1/history/'+s.calls[0].usage.historyItemId,{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY!}});const h=await r.json();console.log(JSON.stringify({keys:Object.keys(h),costFields:Object.fromEntries(Object.entries(h).filter(([k])=>/character|credit|cost/.test(k)))}));
