import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {readPerformanceDirection} from '../../src/pipeline/voice-lipsync/performance-direction.js';
import {resolveSpeechRunCastAudio} from '../../src/pipeline/voice-lipsync/speech-run-audio.js';
import {detectSilences} from '../../src/pipeline/ingestion/detect-silences.js';
import {planShortSpeaking} from '../../src/pipeline/voice-lipsync/short-speaking-plan.js';
const db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856',run=requireCurrentPlan(db,data,project),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const [name,shotId] of [['herod-assertion','b86afce1-84b5-4518-accb-7853b7e5e9a0'],['john-rebuke','9dfadec5-e0df-4446-995f-da741495f7db']]){
 const b=db.prepare('SELECT b.* FROM shot_utterance_bindings b JOIN shots s ON s.id=b.shot_id JOIN scenes sc ON sc.id=s.scene_id WHERE b.shot_id=? AND sc.project_id=?').get(shotId!,project);if(!b)throw Error('Exact current source binding required');
 const direction=readPerformanceDirection(db,project,shotId!),audio=resolveSpeechRunCastAudio(db,shotId!,String(b.character_version_id));if(!audio)throw Error('Current source/voice-matched continuous cast audio required');
 const folder=join('outputs/mark6-production/speaking-source-preflight',name!);mkdirSync(folder,{recursive:true});const source=join(data,'assets',audio.path);
 const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams.find((s:any)=>s.codec_type==='audio');const original=probe(source),rate=Number(original.sample_rate),start=Math.round(audio.startMs*rate/1000),end=Math.round(audio.endMs*rate/1000),line=join(folder,'full-line.wav');
 execFileSync('ffmpeg',['-v','error','-nostdin','-n','-i',source,'-af',`atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le',line],{windowsHide:true});const measured=probe(line);if(Number(measured.duration_ts)!==end-start||measured.time_base!==`1/${rate}`)throw Error('Exact existing source sample preservation failed');
 const quiet=detectSilences(line,{minDurationSec:.15}).map(q=>({startSample:Math.max(0,Math.round(q.startMs*rate/1000)),endSample:Math.min(end-start,Math.round(q.endMs*rate/1000))})).filter(q=>q.endSample>q.startSample),plan=planShortSpeaking({sampleRate:rate,sampleCount:end-start,quiet});
 const evidence={at:new Date().toISOString(),status:'existing_cast_audio_and_native_section_plan_preflight_only',projectId:project,shotId,productionRunId:run.id,binding:b,direction,audio,sourceSha256:hash(source),sampleRate:rate,startSample:start,endSample:end,fullLineSamples:Number(measured.duration_ts),lineSha256:hash(line),quiet,plan,providerCalls:0,newVoiceCalls:0,nativeGenerationCalls:0,limitations:['Not native-language attestation','No actual lip-sync/mouth/caption/join acceptance follows','Actual per-shot returned framing/crop and whole-line audiovisual review still required']};writeFileSync(join(folder,'preflight.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({shotId,sampleRate:rate,samples:end-start,seconds:(end-start)/rate,sections:plan.sections.length,providerCalls:0}));
}
