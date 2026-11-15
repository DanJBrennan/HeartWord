import {writeFileSync} from 'node:fs';
import {SshLtxTransport} from '../../src/providers/ltx/transport.js';
import {ltxJson} from '../../src/providers/ltx/http.js';
const t=new SshLtxTransport(),token=process.env.LTX_TOKEN;if(!token)throw Error('Stored session required');
try{
 const base=await t.connect(),health=await ltxJson(base,'/health',token,10000),settings=await ltxJson(base,'/api/settings',token,10000),policy=await ltxJson(base,'/api/runtime-policy',token,10000),progress=await ltxJson(base,'/api/generation/progress',token,10000);
 if(settings.useLocalTextEncoder!==false||policy.force_api_generations!==false||settings.userPrefersLtxApiVideoGenerations!==false||settings.userPrefersFalApiImageGenerations!==false||progress.status==='running')throw Error('Local/free-web encoder preflight failed or backend busy');
 const spec=await ltxJson(base,'/openapi.json',token,10000);
 const resolve=(v:any):any=>v?.$ref?resolve(v.$ref.split('/').slice(1).reduce((a:any,k:string)=>a[k],spec)):v;
 const routes=Object.entries(spec.paths??{}).filter(([p])=>/model.*(?:load|initializ)|(?:load|initializ).*model/i.test(p)).map(([path,v]:any)=>({path,post:!!v.post,body:resolve(v.post?.requestBody?.content?.['application/json']?.schema)}));
 const result={at:new Date().toISOString(),status:'read_only_ordinary_pipeline_preflight',residentVideoFast:health.models_loaded===true&&health.active_model==='fast',fastDownloaded:(health.models_status as any[])?.some(m=>m.id==='fast'&&m.downloaded===true),activeModel:settings.activeLtxModelId,useLocalTextEncoder:settings.useLocalTextEncoder,progress:progress.status,routes,relatedPaths:Object.keys(spec.paths??{}).filter(p=>/model|pipeline|warm|preload|memory|device/i.test(p)),generationCalls:0,modelLoads:0};
 writeFileSync('outputs/mark6-production/ordinary-pipeline-preflight.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{t.reset();}
