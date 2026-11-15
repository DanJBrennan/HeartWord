// Reconcile the original disconnected request only; never generates/downloads media.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {getDb} from '../../src/db/client.js';
import {SshLtxTransport,shellQuote} from '../../src/providers/ltx/transport.js';
import {ltxJson,redactLtxSecret} from '../../src/providers/ltx/http.js';
const root='outputs/mark6-production',folder=root+'/native-motion/scene2-mission-preparation-v1/shot-10-final',data='C:/Users/danbr/HeartWordData',shot='12503377-2358-4d09-b0b3-f55a672950d7',generation='23c15fae-d822-4b08-bb55-1a87c122b0a9',job='9bc16c11-e0d0-4a32-a2a6-0c7de99160ca',nativeId='video:'+shot+':61fcdc32-9881-412c-aa38-128dc45a7398';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),output=join(data,'assets/generated/video',shot+'-ltx-'+generation+'.mp4'),metadataPath=output+'.json',meta=read(metadataPath),request=read(folder+'/request.json'),old=read(folder+'/recovery-observation.json');
const prior=read(join(data,'assets/generated/video/2d139176-2b3a-4baf-9534-99f9013d7192-ltx-2bb7a783-4658-4b93-952b-f7ab1e6238e4.mp4.json'));
if(meta.generationId!==generation||meta.status!=='submission_uncertain'||meta.error!=='socket hang up'||existsSync(output)||request.pid!==527712||old.progress.status!=='complete'||old.progress.id!=='c3bf488e'||old.progress.result!==prior.remoteOutputPath||old.leaseOwner!==generation||Date.now()-Date.parse(old.at)<120000)throw Error('Exact original failed observer and independently observed PREVIOUS result required');
try{process.kill(request.pid,0);throw Error('Original observer is still live; no reconciliation');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
const token=process.env.LTX_TOKEN;if(!token)throw Error('Stored credential required');const t=new SshLtxTransport(),lease='/Users/danieljbrennan/LTX-Inbox/.heartword-generation.lock';
try{
 const base=await t.connect(),progress=await ltxJson(base,'/api/generation/progress',token,10000),owner=(await t.remote('cat '+shellQuote(lease+'/owner'))).trim();
 if(progress.status!=='complete'||progress.phase!=='complete'||progress.id!==old.progress.id||progress.result!==prior.remoteOutputPath||owner!==generation)throw Error('Backend or lease changed; no retry or cleanup');
 // Read the installed service implementation: all slow generation work is
 // inside a reservation; its progress reports running/starting before work.
 const backend='/Applications/LTX Desktop.app/Contents/Resources/backend/handlers/';
 const generateSource=await t.remote('sed -n '+shellQuote('175,205p')+' '+shellQuote(backend+'video_generation_handler.py'));
 const progressSource=await t.remote('sed -n '+shellQuote('338,365p')+' '+shellQuote(backend+'generation_handler.py'));
 if(!generateSource.includes('with self._generation.reserved_generation_start():')||!progressSource.includes('if self.state.generation_starting_since is not None:')||!progressSource.includes('status="running"')||!progressSource.includes('phase="starting"'))throw Error('Installed backend lifecycle evidence changed');
 const evidence={at:new Date().toISOString(),status:'original_request_terminal_no_backend_generation_started',generationId:generation,originalObserverPid:request.pid,observerMissing:true,originalError:meta.error,earlierObservation:old,currentObservation:{progress,leaseOwner:owner},previousKnownCompletedGeneration:{id:old.progress.id,output:prior.remoteOutputPath,sourceShot:prior.shotId,durationSeconds:prior.durationSeconds},installedBackendEvidence:{generateSource,progressSource},reason:'Both separated observations identify previous five-second deliverance80 result. Backend reservation would report running/starting before generation work; original caller is gone. No eight-second anoint job is running or returned. Preserve original reservation count and failed request; never relabel old output as anointing.',generationCalls:0,downloads:0,settingsWrites:0,originalMediaPreserved:true};
 writeFileSync(folder+'/no-start-reconciliation.json',JSON.stringify(evidence,null,2),{flag:'wx'});
 writeFileSync(folder+'/metadata-before-no-start-reconciliation.json',readFileSync(metadataPath),{flag:'wx'});
 // Remove only this verified terminal request's owner marker and empty lease;
 // retain the uploaded image, all originals, and every historical receipt.
 await t.remote('if [ "$(cat '+shellQuote(lease+'/owner')+')" = '+shellQuote(generation)+' ]; then rm '+shellQuote(lease+'/owner')+' && rmdir '+shellQuote(lease)+'; else exit 1; fi');
 const db=getDb();try{
  const row=db.prepare('SELECT status,metadata_json FROM video_generation_jobs WHERE id=? AND shot_id=?').get(job,shot);if(row?.status!=='held'||!String(row.metadata_json).includes('socket hang up'))throw Error('Original held job changed');
  db.prepare("UPDATE video_generation_jobs SET status='error',metadata_json=?,updated_at=? WHERE id=?").run(JSON.stringify({error:'socket hang up',submissionMayHaveStarted:false,reconciliation:evidence}),Date.now(),job);
 }finally{db.close();}
 Object.assign(meta,{status:'failed',reconciliation:{evidence:folder+'/no-start-reconciliation.json',submissionMayHaveStarted:false,outputProduced:false,originalReservationCountRetained:true}});writeFileSync(metadataPath,JSON.stringify(meta,null,2));
 const journalPath=root+'/native-generation/execution.json',j=read(journalPath),entry=j.entries.find((e:any)=>e.id===nativeId);if(j.entries.length!==81||entry?.status!=='uncertain_reconcile_before_retry')throw Error('Original native reservation changed');
 entry.status='returned_unreviewed';entry.artifact='generated/video/'+shot+'-ltx-'+generation+'.mp4.json';entry.terminalOutcome='failed_before_backend_generation_no_media';entry.recoveryEvidence=folder+'/no-start-reconciliation.json';writeFileSync(journalPath,JSON.stringify(j,null,2));
 const mainPath=root+'/execution.json',main=read(mainPath);main.ltx={...main.ltx,calls:j.entries.length,pending:j.entries.filter((e:any)=>e.status!=='returned_unreviewed').length,journal:'native-generation/execution.json'};writeFileSync(mainPath,JSON.stringify(main,null,2));
 console.log(JSON.stringify({status:evidence.status,originalReservationCountRetained:81,generationCalls:0,downloads:0,outputProduced:false}));
}catch(e){console.error(redactLtxSecret((e as Error).message,token));process.exitCode=1;}finally{t.reset();}
