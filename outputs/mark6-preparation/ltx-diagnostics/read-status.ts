import {writeFileSync} from 'node:fs';
import {SshLtxTransport} from '../../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../../src/providers/ltx/http.js';
const token=process.env.LTX_TOKEN?.trim();if(!token)throw new Error('Missing session');
const t=new SshLtxTransport();try{
 const url=await t.connect(),s=await ltxJson(url,'/api/settings',token,10000);
 const active=await ltxJson(url,'/api/models/download/active',token,10000);
 const status:any={checkedAt:new Date().toISOString(),useLocalTextEncoder:s.useLocalTextEncoder,freeWebTextEncoderRetained:s.useLocalTextEncoder===false,
  cloudVideoPreferred:s.userPrefersLtxApiVideoGenerations,promptEnhancerEnabledI2V:s.promptEnhancerEnabledI2V,activeDownload:active};
 if(typeof active.session_id==='string')status.downloadProgress=await ltxJson(url,`/api/models/download/progress?sessionId=${encodeURIComponent(active.session_id)}`,token,10000);
 writeFileSync('outputs/mark6-preparation/ltx-diagnostics/latest-backend-status.json',JSON.stringify(status,null,2));console.log(JSON.stringify(status));
}catch(e){throw new Error(redactLtxSecret((e as Error).message,token));}finally{t.reset();}
