import {writeFileSync} from 'node:fs';
import {SshLtxTransport} from '../../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../../src/providers/ltx/http.js';
throw new Error('Superseded: retain the existing FREE web text encoder. Do not download or select a local encoder for this test.');
const token=process.env.LTX_TOKEN?.trim();if(!token)throw new Error('Missing session');
const t=new SshLtxTransport(),path='outputs/mark6-preparation/ltx-diagnostics/encoder-install-v2.json';
const state:any={status:'checking',startedAt:new Date().toISOString(),generationCalls:0,paidApiCalls:0};
const save=()=>writeFileSync(path,JSON.stringify(state,null,2));
try{
 const url=await t.connect(),settings=await ltxJson(url,'/api/settings',token,10000);
 if((await ltxJson(url,'/api/generation/progress',token,5000)).status==='running')throw new Error('Backend busy; no settings changed.');
 const recommendation=await ltxJson(url,'/api/models/text-encoder-recommendation',token,10000);
 state.previousUseLocalTextEncoder=settings.useLocalTextEncoder;
 const cp=recommendation.cp_to_download;
 if(cp!==null){
  if(cp!=='gemma4-12b-with-proj-ltx-2.5')throw new Error('Unexpected encoder; no download.');
  if((await ltxJson(url,'/api/models/download/active',token,5000)).session_id!==null)throw new Error('Another download is active; do not replace.');
  const access=await ltxJson(url,'/api/models/check-access',token,30000,{cp_ids:[cp]});
  state.access=access.access;
  if((access.access as any)?.['Lightricks/LTX-2.5']!=='authorized')throw new Error('Model access is not authorized; no license or account consent inferred.');
  state.checkpoint=cp;state.expectedBytes=recommendation.expected_size_bytes;
  state.status='starting_download';save();
  const started=await ltxJson(url,'/api/models/download',token,30000,{type:'download',cp_ids:[cp]});
  state.sessionId=started.sessionId;state.status='downloading';save();console.log(JSON.stringify(state));
  const deadline=Date.now()+3*3600000;
  while(Date.now()<deadline){
   await new Promise(r=>setTimeout(r,10000));
   const p=await ltxJson(url,`/api/models/download/progress?sessionId=${encodeURIComponent(String(state.sessionId))}`,token,10000);
   state.progress=p;save();console.log(JSON.stringify({status:state.status,progress:p}));
   if((await ltxJson(url,'/api/models/text-encoder-recommendation',token,10000)).cp_to_download===null)break;
   if(['error','failed','cancelled'].includes(String(p.status)))throw new Error('Model download failed; inspect saved progress.');
  }
 }
 if((await ltxJson(url,'/api/models/text-encoder-recommendation',token,10000)).cp_to_download!==null)throw new Error('Encoder is not fully downloaded; no generation allowed.');
 await ltxJson(url,'/api/settings',token,10000,{useLocalTextEncoder:true});
 const verified=await ltxJson(url,'/api/settings',token,10000);
 if(verified.useLocalTextEncoder!==true)throw new Error('Local encoder preference did not persist.');
 state.status='local_encoder_installed_and_selected';state.finishedAt=new Date().toISOString();state.useLocalTextEncoder=true;save();console.log(JSON.stringify(state));
}catch(e){state.status='held_no_generation';state.error=redactLtxSecret((e as Error).message,token);save();throw new Error(state.error);}finally{t.reset();}
