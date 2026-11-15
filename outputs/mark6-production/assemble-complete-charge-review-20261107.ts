// Local joined quotation for AV review; not a final film or an editable-project export.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';

const top=resolve('outputs/mark6-production'),folder=join(top,'complete-charge-source-window-20261107');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const native=read(join(top,'native-generation/execution.json'));
if(native.entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Native worker must settle before joined-quotation database inspection. No render or provider call made.');
const folders=[join(top,'speaking-execution/travel-charge-window1-editorial-repair-20261107'),...([2,3].map(n=>join(top,`speaking-execution/travel-charge-window${n}-native-continuation-20261107`)))];
if(folders.some(p=>!existsSync(join(p,'full-window-selection.json'))))throw Error('All three actual complete-window selections required. No render or provider call made.');
if(existsSync(folder))throw Error('Existing joined-quotation evidence must be inspected, never overwritten.');
const db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856';
const ff=(args:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...args],{windowsHide:true,maxBuffer:16*1024*1024});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
try{
 const plan=requireCurrentPlan(db,data,project);
 if(plan.id!=='67631c67-22d8-4c51-8d1e-e567dafeaaed'||plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412')throw Error('Current accepted planning authority changed.');
 const frames=[350,427,343],samples=[700000,854000,685200],starts=[0,700000,1554000];
 const inputs=folders.map((p,index)=>{
  const result=read(join(p,'result.json')),selection=read(join(p,'full-window-selection.json')),id=result.attemptId;
  validateAttemptRevision(db,data,project,id);
  const row=db.prepare("SELECT ga.result_asset_path,cl.id clipId FROM generation_attempts ga JOIN clips cl ON cl.generation_attempt_id=ga.id WHERE ga.id=? AND ga.operation='lip_sync' AND ga.status='accepted'").get(id);
  if(!row?.result_asset_path||selection.attemptId!==id||selection.frames!==frames[index])throw Error('Actual selected accepted quotation window required.');
  const path=join(data,'assets',String(row.result_asset_path)),line=read(join(dirname(path),'line.json')),streams=probe(path),v=streams.find((x:any)=>x.codec_type==='video');
  if(hash(path)!==line.outputSha256||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==frames[index]||line.plan.sampleCount!==samples[index])throw Error('Selected window bytes, native frame count or source sample count changed.');
  if(index>0&&(result.continuation?.parentAttemptId!==read(join(folders[index-1]!,'result.json')).attemptId||result.continuation.sourceBoundarySample!==starts[index]))throw Error('Actual selected previous-window continuation changed.');
  return {window:index+1,attemptId:id,clipId:String(row.clipId),path,sha256:hash(path),frames:frames[index],sourceStartSample48k:starts[index],sourceSamples48k:samples[index],selectionFile:join(p,'full-window-selection.json')};
 });
 const mix=join(data,'assets/generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav');
 const mixSha='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547';
 const mixAudio=probe(mix).find((x:any)=>x.codec_type==='audio');
 if(hash(mix)!==mixSha||mixAudio.sample_rate!=='24000'||mixAudio.channels!==2||mixAudio.time_base!=='1/24000'||Number(mixAudio.duration_ts)!==19120320)throw Error('Exact approved full-source mix required.');
 mkdirSync(folder);
 const audio=join(folder,'complete-source-audio.wav'),output=join(folder,'complete-charge-approved-mix.mp4'),reference=join(folder,'single-continuous-audio-reference.m4a');
 const sourceStart=2788536,sourceEnd=3908136,sourceSamples=1119600;
 ff(['-i',mix,'-af',`atrim=start_sample=${sourceStart}:end_sample=${sourceEnd},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le',audio]);
 const pcm=(path:string,filter?:string)=>ff(['-i',path,...(filter?['-af',filter]:[]),'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-']);
 const actualPcm=pcm(audio),expectedPcm=pcm(mix,`atrim=start_sample=${sourceStart}:end_sample=${sourceEnd},asetpts=PTS-STARTPTS`);
 if(actualPcm.length!==sourceSamples*4||!actualPcm.equals(expectedPcm))throw Error('Exact continuous approved source PCM subset mismatch.');
 const filters=inputs.map((x,i)=>`[${i}:v]trim=end_frame=${x.frames},setpts=N/(24*TB)[w${i}]`).join(';')+';[w0][w1][w2]concat=n=3:v=1:a=0[v]';
 ff([...inputs.flatMap(x=>['-i',x.path]),'-i',audio,'-filter_complex',filters,'-map','[v]','-map','3:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','aac','-b:a','160k','-movflags','+faststart',output]);
 ff(['-i',audio,'-c:a','aac','-b:a','160k',reference]);
 const packets=(path:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',path],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024})).packets;
 const streams=probe(output),v=streams.find((x:any)=>x.codec_type==='video'),a=streams.find((x:any)=>x.codec_type==='audio');
 if(Number(v.nb_read_frames)!==1120||v.r_frame_rate!=='24/1'||a.sample_rate!=='24000'||a.channels!==2||a.time_base!=='1/24000'||Number(a.duration_ts)!==sourceSamples||JSON.stringify(packets(output))!==JSON.stringify(packets(reference)))throw Error('Joined picture/frame count or single continuous AAC encode proof failed.');
 const manifest={at:new Date().toISOString(),scope:'Actual complete46.65s travel-charge quotation with approved source mix for joined AV review ONLY; not chapter completion or editable-project export',productionRunId:plan.id,planningBriefHash:plan.brief_hash,sourceStartMs:116189,sourceEndMs:162839,sourceStartSample:sourceStart,sourceEndSample:sourceEnd,sourceSamples,sampleRate:24000,sourceMixPath:mix,sourceMixSha256:mixSha,exactPcmSubsetSha256:createHash('sha256').update(actualPcm).digest('hex'),noGainOrResampling:true,noAudioGapsOrAddedPauses:true,aacPacketsIdenticalToSingleReferenceEncode:true,inputs,filters,frames:1120,fps:24,pictureSurplusMs:1000/60,windowJoinFrames:[350,777],editorialListenerCutsFrames:[132,240],output,outputSha256:hash(output),audio,audioSha256:hash(audio),reference,referenceSha256:hash(reference),providerCalls:0,qualityApproved:false,wholeFilmReady:false,limitations:['Frame/PCM/packet checks do not prove perceptual lip sync, native Hatam accuracy, affect or invisible geometry.','Actual joined AV and direct window joins/ending review still required. All source windows/held attempts and approved masters retained.']};
 writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log(JSON.stringify({output,frames:1120,sourceSamples,providerCalls:0,qualityApproved:false}));
}finally{db.close();}
