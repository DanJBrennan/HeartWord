import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {SshLtxTransport,shellQuote} from '../../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../../src/providers/ltx/http.js';
import {assertLocalA2v} from '../../../src/providers/ltx/a2v.js';
const token=process.env.LTX_TOKEN?.trim();if(!token)throw new Error('Missing session credential');
const t=new SshLtxTransport();
try {
 const base=await t.connect(),settings=await ltxJson(base,'/api/settings',token,10000);
 const health=await ltxJson(base,'/health',token,10000),policy=await ltxJson(base,'/api/runtime-policy',token,10000);
 assertLocalA2v(health,policy,settings);
 const safe:any={checkedAt:new Date().toISOString(),localVideoVerified:true,settings:{},progress:await ltxJson(base,'/api/generation/progress',token,5000),remoteHashes:[]};
 for(const key of ['use_local_text_encoder','useLocalTextEncoder','promptEnhancerEnabledI2V','promptEnhancerEnabledT2V','prompt_enhancer_enabled_i2v','prompt_enhancer_enabled_t2v','activeLtxModelId','active_ltx_model_id','hasLtxApiKey','hasGeminiApiKey','userPrefersLtxApiVideoGenerations','user_prefers_ltx_api_video_generations'])if(key in settings)safe.settings[key]=settings[key];
 safe.apiKeyPresence=settings.hasLtxApiKey??'not_exposed';
 for(const id of ['short-v37','chain-v4','pause-v50']){
  const line=JSON.parse(readFileSync(resolve(`outputs/mark6-preparation/ltx-prepared-tests-v3/assets/generated/lip-sync/ltx-mark6-20261101-${id}/line.json`),'utf8'));
  for(const s of line.sections){
   const attempt=JSON.parse(readFileSync(resolve(s.rawPath,'../attempt.json'),'utf8'));
   const remote=await t.remote(`shasum -a 256 ${attempt.remoteInputs.map(shellQuote).join(' ')}`);
   const hashes=remote.split('\n').map(v=>v.trim().split(/\s+/)[0]);
   safe.remoteHashes.push({id,section:s.index,imageMatches:hashes[0]===attempt.imageSha256,audioMatches:hashes[1]===attempt.audioSha256});
  }
 }
 writeFileSync('outputs/mark6-preparation/ltx-diagnostics/backend-inspection-v2.json',JSON.stringify(safe,null,2),{flag:'wx'});
 console.log(JSON.stringify(safe));
}catch(e){throw new Error(redactLtxSecret((e as Error).message,token));}finally{t.reset();}
