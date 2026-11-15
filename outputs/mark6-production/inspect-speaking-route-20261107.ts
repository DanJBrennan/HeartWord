import {SshLtxTransport,latestLogCommand} from '../../src/providers/ltx/transport.js';
import {redactLtxSecret} from '../../src/providers/ltx/http.js';
import {writeFileSync} from 'node:fs';
const t=new SshLtxTransport(),token=process.env.LTX_TOKEN;if(!token)throw Error('Stored local credential required');
try{
 await t.connect();
 const files=await t.remote('find "/Applications/LTX Desktop.app/Contents/Resources" -maxdepth 6 -name "*video_generation_handler*" -print 2>/dev/null | head -10');
 const logs=await t.remote(latestLogCommand+' tail -160 "$latest" | grep -Ei "a2v|audio.?path|audio.?to.?video|conditioning|input.audio|speech|audio.encoder|text.encoding|request|pipeline|seed" | tail -45');
 const report={at:new Date().toISOString(),scope:'Read-only installed local speaking route diagnostics',handlerFiles:files.slice(0,2000),recentRelevantLog:redactLtxSecret(logs.slice(0,10000),token),generationCalls:0,settingsWrites:0,downloads:0};
 writeFileSync('outputs/mark6-production/speaking-route-readonly-diagnostics-20261107.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{t.reset();}
