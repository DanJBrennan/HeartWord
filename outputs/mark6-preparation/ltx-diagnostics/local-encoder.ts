import {writeFileSync} from 'node:fs';
import {SshLtxTransport} from '../../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../../src/providers/ltx/http.js';
const token=process.env.LTX_TOKEN?.trim();if(!token)throw new Error('Missing session');
const t=new SshLtxTransport();try{
 const url=await t.connect(),settings=await ltxJson(url,'/api/settings',token,10000);
 const recommendation=await ltxJson(url,'/api/models/text-encoder-recommendation',token,10000);
 const result={modelsDir:settings.modelsDir,useLocalTextEncoder:settings.useLocalTextEncoder,hasLtxApiKey:settings.hasLtxApiKey,recommendation,
 activeDownload:await ltxJson(url,'/api/models/download/active',token,10000)};
 writeFileSync('outputs/mark6-preparation/ltx-diagnostics/local-encoder-readiness.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
}catch(e){throw new Error(redactLtxSecret((e as Error).message,token));}finally{t.reset();}
