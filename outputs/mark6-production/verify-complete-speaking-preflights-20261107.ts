import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization} from '../../src/pipeline/creative-direction/crew-store.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
const db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856',root='outputs/mark6-production/speaking-source-preflight',auth=productionAuthorization(db,data,project);
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>join(root,d.name,'preflight.json')).filter(existsSync).map(path=>({path,value:JSON.parse(readFileSync(path,'utf8'))}));
const rows=db.prepare('SELECT sh.id,sc.sequence scene,sh.sequence FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sh.needs_lip_sync=1 ORDER BY sc.sequence,sh.sequence').all(project);
if(rows.length!==21)throw Error('Current chapter speaking inventory changed');
const results=rows.map(row=>{
 const shot=String(row.id),binding=db.prepare('SELECT character_version_id FROM shot_utterance_bindings WHERE shot_id=?').get(shot);
 if(!binding)throw Error('Missing actual current utterance binding');
 const audio=resolveSpeechRunCastAudio(db,shot,String(binding.character_version_id));if(!audio)throw Error('Missing current voice/source-matched audio');
 const matches=files.filter(f=>f.value.shotId===shot&&JSON.stringify(f.value.audio)===JSON.stringify(audio));if(matches.length!==1)throw Error('Expected one exact source-bound preflight for '+shot);
 const f=matches[0]!,v=f.value,source=join(data,'assets',audio.path),line=join(root,...f.path.slice(root.length+1).split(/[\\/]/).slice(0,-1),'full-line.wav');
 if(v.productionRunId!==auth.runId||hash(source)!==v.sourceSha256||hash(line)!==v.lineSha256||v.sampleRate!==48000||v.endSample-v.startSample!==v.fullLineSamples||v.plan.sampleCount!==v.fullLineSamples)throw Error('Preflight source/revision/sample proof changed for '+shot);
 let cursor=0;const nonQuietCuts:number[]=[];
 for(const [i,s] of v.plan.sections.entries()){
  if(s.sourceStartSample!==cursor||s.sourceEndSample<=cursor)throw Error('Missing/repeated source samples');cursor=s.sourceEndSample;
  if(i<v.plan.sections.length-1&&!v.quiet.some((q:any)=>q.startSample<=cursor&&cursor<=q.endSample))nonQuietCuts.push(cursor);
 }
 if(cursor!==v.fullLineSamples)throw Error('Incomplete source line');
 return{shotId:shot,scene:row.scene,shot:row.sequence,preflight:f.path,sourceSha256:v.sourceSha256,lineSha256:v.lineSha256,sourceStartSample:v.startSample,sourceEndSample:v.endSample,samples:v.fullLineSamples,sections:v.plan.sections.length,nonQuietCuts};
});
auth.assertCurrent();const report={at:new Date().toISOString(),status:'all_21_current_speaking_window_source_preflights_verified',productionRunId:auth.runId,briefHash:auth.briefHash,sampleRate:48000,windows:results.length,totalSourceSamples:results.reduce((n,x)=>n+x.samples,0),seconds:results.reduce((n,x)=>n+x.samples,0)/48000,plannedNativeSections:results.reduce((n,x)=>n+x.sections,0),nonQuietCuts:results.filter(x=>x.nonQuietCuts.length),results,providerCalls:0,newVoiceCalls:0,newAlignmentCalls:0,limitations:'Readiness only, not actual generated speech/mouth/expression/join or source-language approval. Complete source/cast sound stays continuous, including initial quiet; non-quiet cut requires whole-line audiovisual review, never synthetic pause or retime.'};
writeFileSync('outputs/mark6-production/complete-speaking-preflight-verification-20261107.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({status:report.status,windows:report.windows,seconds:report.seconds,plannedNativeSections:report.plannedNativeSections,nonQuietCuts:report.nonQuietCuts.map(x=>({shotId:x.shotId,cuts:x.nonQuietCuts})),providerCalls:0}));db.close();
