import {writeFileSync} from 'node:fs';
import {SshLtxTransport} from '../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../src/providers/ltx/http.js';
const token=process.env.LTX_TOKEN;if(!token)throw Error('Stored local session credential is required');
for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','ELEVENLABS_API_KEY','OPENAI_API_KEY','CODEX_API_KEY'])delete process.env[key];
const transport=new SshLtxTransport();
try{
 const base=await transport.connect(),health=await ltxJson(base,'/health',token,10000),settings=await ltxJson(base,'/api/settings',token,10000),policy=await ltxJson(base,'/api/runtime-policy',token,10000),progress=await ltxJson(base,'/api/generation/progress',token,10000);
 const apiPreferences:Record<string,unknown>={};
 const collect=(value:any,path:string)=>{if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){const key=`${path}.${k}`;if(/force.*api|user.*prefer.*api|prefer.*api/i.test(k)&&typeof v==='boolean')apiPreferences[key]=v;else if(v&&typeof v==='object')collect(v,key);}};
 collect(policy,'runtime');collect(settings,'settings');
 const fast=(health.models_status as any[])?.find(m=>m.id==='fast');
 const safe={at:new Date().toISOString(),status:'read_only_local_readiness',healthStatus:health.status,modelsLoaded:health.models_loaded,fastDownloaded:fast?.downloaded===true,fastLoaded:fast?.loaded===true,activeModel:settings.activeLtxModelId,useLocalTextEncoder:settings.useLocalTextEncoder,apiPreferences,progressStatus:progress.status,generationCalls:0,downloads:0,settingsWrites:0};
 writeFileSync('outputs/mark6-production/local-readiness-20261105.json',JSON.stringify(safe,null,2));console.log(JSON.stringify(safe));
 if(safe.healthStatus!=='ok'||!safe.fastDownloaded||safe.activeModel!=='ltx-2.5-22b-distilled'||safe.useLocalTextEncoder!==false||policy.force_api_generations!==false||settings.userPrefersLtxApiVideoGenerations!==false||settings.userPrefersFalApiImageGenerations!==false||Object.values(apiPreferences).some(v=>v!==false)||['running','processing','queued'].includes(String(safe.progressStatus)))throw Error('Local-only/free-web-encoder readiness needs reconciliation; no generation submitted');
}catch(error){console.error(redactLtxSecret((error as Error).message,token));process.exitCode=1;}finally{transport.reset();}
