import {SshLtxTransport,latestLogCommand} from '../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../src/providers/ltx/http.js';
import {writeFileSync} from 'node:fs';
const token=process.env.LTX_TOKEN;if(!token)throw Error('Stored local credential required');const t=new SshLtxTransport();
try{
 const b=await t.connect(),p=await ltxJson(b,'/api/generation/progress',token,10000);
 const evidence={at:new Date().toISOString(),progress:p,leaseOwner:(await t.remote('cat "$HOME/LTX-Inbox/.heartword-generation.lock/owner"')).trim(),completionLog:await t.remote(latestLogCommand+' tail -400 "$latest" | grep -E "Inference:|Total generation:|[Ss]aved|video_path|[Oo]utput.*mp4|[Gg]enerat.*complete|POST /api/generate|[Gg]enerat.*start|ERROR|23c15fae|12503377" | tail -30'),recentOutputNames:await t.remote('find "$HOME/Library/Application Support/LTXDesktop/outputs" -maxdepth 2 -type f -name "*.mp4" -mmin -45 -print | tail -8'),generationCalls:0,settingsWrites:0,downloads:0};
 writeFileSync('outputs/mark6-production/native-motion/scene2-mission-preparation-v1/shot-10-final/recovery-observation.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(e){console.error(redactLtxSecret((e as Error).message,token));process.exitCode=1;}finally{t.reset();}
