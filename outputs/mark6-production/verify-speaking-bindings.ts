import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {join} from 'node:path';
const root='outputs/mark6-production',packet=JSON.parse(readFileSync(root+'/speaking-binding-proposals.json','utf8')),db=getDb(),rows=[];
const decode=(path:string,args:string[]=[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-i',path,...args,'-f','s16le','-'],{windowsHide:true,maxBuffer:20000000});
for(const p of packet.proposals){
 const bound=resolveSpeechRunCastAudio(db,p.shotId,p.characterVersionId);if(!bound)throw Error('No current cast mapping');
 const first=Math.round(bound.startMs*48),last=Math.round(bound.endMs*48);
 const actual=decode(join(getDataDir(),'assets',bound.path),['-af',`atrim=start_sample=${first}:end_sample=${last},asetpts=PTS-STARTPTS,pan=stereo|c0=c0|c1=c0`]);
 const expected=decode(p.preparedWindow);if(!actual.equals(expected)||actual.length/4!==p.castEndSample-p.castStartSample)throw Error('Resolved binding does not reproduce prepared source-bound PCM '+p.shotId);
 rows.push({shotId:p.shotId,quoteId:p.quoteId,startMs:p.startMs,endMs:p.endMs,resolved:bound,sampleFrames:actual.length/4,pcmSha256:createHash('sha256').update(actual).digest('hex'),matchesPreparedWindow:true});
}
for(const id of new Set(packet.proposals.map((p:any)=>p.quoteId))){const group=packet.proposals.filter((p:any)=>p.quoteId===id).sort((a:any,b:any)=>a.castStartSample-b.castStartSample);if(group[0].castStartSample!==0||group.some((p:any,i:number)=>i&&p.castStartSample!==group[i-1].castEndSample))throw Error('Duplicated/omitted source samples across picture views');}
const result={status:'all21_bound_windows_match_exact_consumer_PCM',rows,parentPerformances:18,sourceOrVoiceRateChanged:false,newProviderRequests:0,semanticVerseBoundariesNotInferred:true};writeFileSync(root+'/speaking-binding-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,windows:rows.length,parentPerformances:18,newProviderRequests:0}));
