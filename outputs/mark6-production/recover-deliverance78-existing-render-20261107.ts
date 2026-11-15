import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SshLtxTransport,shellQuote} from '../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../src/providers/ltx/http.js';
import {prepareLtxVideoOutput} from '../../src/providers/ltx/output.js';
const folder='outputs/mark6-production/native-motion/scene2-mission-preparation-v1/shot-9-final',generationId='342f6982-50c9-4c95-8269-4124e62e3058',job='9b6279bb',data='C:/Users/danbr/HeartWordData';
const output=join(data,'assets/generated/video/2d139176-2b3a-4baf-9534-99f9013d7192-ltx-'+generationId+'.mp4'),metadataPath=output+'.json',meta=JSON.parse(readFileSync(metadataPath,'utf8'));
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(meta.generationId!==generationId||meta.status!=='submission_uncertain'||meta.seed!==2013499806||meta.error!=='database is locked'||existsSync(output)||existsSync(join(folder,'recovered-provider-result.json')))throw Error('Unexpected retained render state; reconcile manually without another generation');
if(hash(join(data,'assets',meta.sourceKeyframe))!==meta.sourceKeyframeSha256||(meta.sourceEndKeyframe && hash(join(data,'assets',meta.sourceEndKeyframe))!==meta.sourceEndKeyframeSha256))throw Error('Changed submitted inputs');
const token=process.env.LTX_TOKEN;if(!token)throw Error('Stored local credential required');const t=new SshLtxTransport();
const lease='/Users/danieljbrennan/LTX-Inbox/.heartword-generation.lock';
try{
 const base=await t.connect();let terminal:any;
 for(let i=0;i<80;i++){
  const p=await ltxJson(base,'/api/generation/progress',token,10000),owner=(await t.remote('cat '+shellQuote(lease+'/owner'))).trim();
  if(p.id!==job||owner!==generationId)throw Error('Backend job/lease changed; no substitution or generation allowed');
  const observed={at:new Date().toISOString(),backendJobId:job,generationId,progress:p,leaseOwner:owner,generationCalls:0};
  writeFileSync(join(folder,'recovery-monitor.json'),JSON.stringify(observed,null,2));
  console.log(JSON.stringify({at:observed.at,id:p.id,status:p.status,phase:p.phase,progress:p.progress}));
  if(p.status!=='running'){terminal=observed;break;}
  await new Promise(r=>setTimeout(r,30000));
 }
 if(!terminal)throw Error('Bounded observation ended; recheck the SAME backend job, never submit another');
 // This Desktop progress endpoint returns the completed path as a string;
 // /api/generate returns {status,video_path}. Preserve the raw receipt above.
 const response=terminal.progress.status==='complete'&&typeof terminal.progress.result==='string'?{status:'complete',video_path:terminal.progress.result}:terminal.progress.result;
 if(!response||response.status!=='complete'||typeof response.video_path!=='string'||!response.video_path.startsWith('/Users/danieljbrennan/Library/Application Support/LTXDesktop/outputs/')||/[\r\n\0]/.test(response.video_path))throw Error('Existing backend result is not a verified completed output');
 writeFileSync(join(folder,'terminal-existing-render-receipt.json'),JSON.stringify(terminal,null,2),{flag:'wx'});
 writeFileSync(join(folder,'metadata-before-recovery.json'),readFileSync(metadataPath),{flag:'wx'});
 const downloaded=output+'.recovery-download.mp4',prepared=output+'.recovery-prepared.mp4',ambience=output.replace(/\.mp4$/,'.ambience.wav');
 if(existsSync(downloaded)||existsSync(prepared)||existsSync(ambience))throw Error('Existing recovery files require reconciliation');
 await t.download(response.video_path,downloaded);const properties=await prepareLtxVideoOutput(downloaded,prepared,{audioMode:'ambient',ambientOutput:ambience});
 if(properties.width!==1280||properties.height!==704||properties.frameRate!=='24/1'||!properties.frames||properties.frames!==121)throw Error('Wrong returned geometry/frame count');
 renameSync(prepared,output);
 Object.assign(meta,{status:'complete',remoteOutputPath:response.video_path,output:properties,ambientAudio:{path:'generated/video/'+output.split(/[\\/]/).at(-1)!.replace(/\.mp4$/,'.ambience.wav'),status:'needs_review'},recovery:{backendJobId:job,completedAt:new Date().toISOString(),retainedOriginalError:'database is locked',providerResubmissions:0,terminalReceipt:join(folder,'terminal-existing-render-receipt.json')},progress:{phase:'complete',percentage:100,status:'complete'}});
 writeFileSync(metadataPath,JSON.stringify(meta,null,2));
 const result={status:'accepted',media:{path:'generated/video/'+output.split(/[\\/]/).at(-1)},ambientAudio:meta.ambientAudio,cost:{usd:0},provenance:{provider:'ltx_local',model:meta.model,prompt:meta.prompt},metadata:{...meta,metadataPath}};
 writeFileSync(join(folder,'recovered-provider-result.json'),JSON.stringify({at:new Date().toISOString(),result,outputSha256:hash(output),originalGenerationCountRetained:true,noPictureAcceptance:true,noNativeAudioAcceptance:true},null,2),{flag:'wx'});
 await t.remote('if [ "$(cat '+shellQuote(lease+'/owner')+')" = '+shellQuote(generationId)+' ]; then rm -f '+shellQuote(lease+'/owner')+'; rmdir '+shellQuote(lease)+'; fi');
 console.log(JSON.stringify({status:'existing_render_recovered_unreviewed',path:output,frames:properties.frames,generationCalls:0}));
}catch(e){console.error(redactLtxSecret((e as Error).message,token));process.exitCode=1;}finally{t.reset();}
