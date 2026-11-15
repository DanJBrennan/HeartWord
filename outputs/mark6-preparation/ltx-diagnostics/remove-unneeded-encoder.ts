/** Remove only this diagnostic's unnecessary new checkpoint after Desktop is
 * idle and its download has completed. Never restart/cancel an inference. */
import {readFileSync,writeFileSync} from 'node:fs';
import {request} from 'node:http';
import {randomUUID} from 'node:crypto';
import {SshLtxTransport,shellQuote} from '../../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../../src/providers/ltx/http.js';
const token=process.env.LTX_TOKEN?.trim();if(!token)throw new Error('Missing session');
const cp='gemma4-12b-with-proj-ltx-2.5',root='outputs/mark6-preparation/ltx-diagnostics';
const original=JSON.parse(readFileSync(`${root}/local-encoder-readiness.json`,'utf8'));
if(original.recommendation.cp_to_download!==cp)throw new Error('Checkpoint was not proven absent before this task.');
const t=new SshLtxTransport(),state:any={status:'waiting_for_download_and_idle_backend',checkpoint:cp,newGenerationCalls:0,paidApiCalls:0};
let lock:string|undefined;const owner=randomUUID();
const save=()=>writeFileSync(`${root}/encoder-cleanup.json`,JSON.stringify(state,null,2));save();
try{
 const url=await t.connect(),deadline=Date.now()+3*3600000;
 while(Date.now()<deadline){
  const active=await ltxJson(url,'/api/models/download/active',token,10000);
  const progress=await ltxJson(url,'/api/generation/progress',token,5000);
  if(active.session_id===null&&progress.status!=='running'){
   const settings=await ltxJson(url,'/api/settings',token,10000);
   if(settings.useLocalTextEncoder!==false)throw new Error('Encoder preference changed; do not delete a potentially selected model.');
   const recommendation=await ltxJson(url,'/api/models/text-encoder-recommendation',token,10000);
   if(recommendation.cp_to_download!==null){state.status='checkpoint_not_installed_no_delete';save();break;}
   const home=await t.remote('printf "%s" "$HOME"');
   lock=`${home}/LTX-Inbox/.heartword-generation.lock`;
   await t.remote(`mkdir ${shellQuote(lock)} && printf '%s' ${shellQuote(owner)} > ${shellQuote(`${lock}/owner`)}`);
   if((await ltxJson(url,'/api/generation/progress',token,5000)).status==='running')throw new Error('Another generation started; no deletion.');
   if((await ltxJson(url,'/api/settings',token,10000)).useLocalTextEncoder!==false)throw new Error('Encoder was selected; no deletion.');
   state.status='removing_only_new_optional_checkpoint';save();
   await new Promise<void>((resolve,reject)=>{
    const body=JSON.stringify({cp_ids:[cp]}),target=new URL('/api/models/delete',url);
    const req=request(target,{method:'DELETE',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
     let data='';res.setEncoding('utf8');res.on('data',v=>{data+=v;if(data.length>4096)req.destroy(new Error('Oversized deletion response'));});
     res.on('end',()=>{clearTimeout(timer);if(res.statusCode!==200)reject(new Error(`Checkpoint deletion HTTP ${res.statusCode}`));else resolve();});
    });
    const timer=setTimeout(()=>req.destroy(new Error('Checkpoint removal response uncertain; inspect before retry.')),10000);
    req.on('error',e=>{clearTimeout(timer);reject(e);});req.end(body);
   });
   if((await ltxJson(url,'/api/models/text-encoder-recommendation',token,10000)).cp_to_download!==cp)throw new Error('Checkpoint removal not verified.');
   state.status='unneeded_checkpoint_removed_web_encoder_retained';state.finishedAt=new Date().toISOString();save();break;
  }
  await new Promise(r=>setTimeout(r,10000));
 }
 if(state.status==='waiting_for_download_and_idle_backend'){state.status='timed_out_no_deletion';save();}
}catch(e){state.status='held_no_other_files_touched';state.error=redactLtxSecret((e as Error).message,token);save();}finally{
 if(lock)try{await t.remote(`test "$(cat ${shellQuote(`${lock}/owner`)})" = ${shellQuote(owner)} && rm ${shellQuote(`${lock}/owner`)} && rmdir ${shellQuote(lock)}`);}catch{/* retain ownership evidence */}
 t.reset();
}
