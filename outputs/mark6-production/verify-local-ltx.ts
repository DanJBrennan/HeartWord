import {writeFileSync} from 'node:fs';
import {SshLtxTransport} from '../../src/providers/ltx/transport.js';
import {ltxJson} from '../../src/providers/ltx/http.js';
import {assertLocalA2v} from '../../src/providers/ltx/a2v.js';
const transport=new SshLtxTransport(),token=process.env.LTX_TOKEN!;
try{const base=await transport.connect();
 const health=await ltxJson(base,'/health',token,10000),policy=await ltxJson(base,'/api/runtime-policy',token,10000),settings=await ltxJson(base,'/api/settings',token,10000);
 assertLocalA2v(health,policy,settings);
 if(settings.useLocalTextEncoder!==false)throw Error('Free web encoder preference changed; do not download a local encoder.');
 const result={at:new Date().toISOString(),localA2vReady:true,health,forceApiGenerations:policy.force_api_generations,userPrefersApi:settings.userPrefersLtxApiVideoGenerations??settings.user_prefers_ltx_api_video_generations,useLocalTextEncoder:settings.useLocalTextEncoder,activeModel:settings.activeLtxModelId,localGenerationCalls:0,modelLoading:'Existing speaking path loads downloaded Fast weights lazily on first real generation.'};
 writeFileSync('outputs/mark6-production/local-only-preflight.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{transport.reset();}
