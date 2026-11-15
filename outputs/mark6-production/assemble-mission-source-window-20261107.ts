// Existing accepted shot assemblies -> one continuous approved source window.
// Filesystem/FFmpeg only; no provider, planning, selection or database writes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const top=resolve('outputs/mark6-production'),base=join(top,'native-motion/scene2-mission-preparation-v1'),folder=join(top,'complete-mission-source-window-20261107'),data='C:/Users/danbr/HeartWordData';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const defs=[
 {folder:'shot-7-final-after-draft1',shot:'46b27a7b-3239-4d0b-b261-e932ab9baf98',start:162839,end:167839,frames:120},
 {folder:'shot-8-final-level-gaze-retake1-lease-recovered',shot:'5dbcf16e-4aed-48d7-a9f0-0c26f177b000',start:167839,end:172839,frames:120},
 {folder:'shot-9-final-level-head-retake2',shot:'2d139176-2b3a-4baf-9534-99f9013d7192',start:172839,end:177839,frames:120},
 {folder:'shot-10-final-poised-contact-retake1',shot:'12503377-2358-4d09-b0b3-f55a672950d7',start:177839,end:185339,frames:180}
];
if(existsSync(folder))throw Error('Existing actual joined window requires inspection, never overwrite.');
// Check every dependency before creating output or starting an encode.
const inputs=defs.map(d=>{
 const p=read(join(base,d.folder,'selection-and-assembly.json'));
 if(p.assembled.shotId!==d.shot||p.assembled.durationMs!==d.end-d.start||p.assembled.hasDialogueAudio!==false||p.nativeAudioExcluded!==true||JSON.stringify(p.sourceBindingMs)!==JSON.stringify([d.start,d.end])||JSON.stringify(p.selectedFrames)!==JSON.stringify([0,d.frames]))throw Error('Exact source-scoped selected silent assembly required: '+d.shot);
 const review=read(p.review);if(review.attemptId!==p.attemptId||review.status!=='clear_picture_for_review_production')throw Error('Actual named picture acceptance required.');
 const path=join(data,'assets',p.assembled.assembledVideoPath);if(hash(path)!==p.assembledSha256)throw Error('Selected assembly changed.');
 return {...d,path,sha256:p.assembledSha256,attemptId:p.attemptId,clipId:p.selection.clipId,selectionEvidence:join(base,d.folder,'selection-and-assembly.json')};
});
const prep=read(join(base,'prepared-source-and-motion.json')),audio=resolve(prep.audioPath);
if(prep.sourceStartMs!==162839||prep.sourceEndMs!==185339||prep.audioStereoFrames!==540000||prep.audioSampleRate!==24000||hash(audio)!==prep.audioSha256||prep.audioSha256!=='be11bc501ffe35e10ab7555ed9638bc8d4d0ae0e57ec0e595b09a1f5f422fe14')throw Error('Exact continuous approved mission audio required.');
const mix=join(data,'assets/generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav'),mixSha='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547';
if(hash(mix)!==mixSha)throw Error('Approved source master changed.');
const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:16*1024*1024});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
for(const i of inputs){const streams=probe(i.path),v=streams.find((s:any)=>s.codec_type==='video');if(v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==i.frames||streams.some((s:any)=>s.codec_type==='audio'))throw Error('Selected silent picture geometry/count changed.');}
const pcm=(p:string,filter?:string)=>ff(['-i',p,...(filter?['-af',filter]:[]),'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-']);
const actualPcm=pcm(audio),sourceFilter='atrim=start_sample=3908136:end_sample=4448136,asetpts=PTS-STARTPTS';
if(actualPcm.length!==540000*4||!actualPcm.equals(pcm(mix,sourceFilter)))throw Error('Exact approved continuous source PCM mismatch.');
mkdirSync(folder);const output=join(folder,'complete-mission-approved-mix.mp4'),reference=join(folder,'single-continuous-audio-reference.m4a');
const filters=inputs.map((i,n)=>`[${n}:v]trim=end_frame=${i.frames},setpts=N/(24*TB)[w${n}]`).join(';')+';[w0][w1][w2][w3]concat=n=4:v=1:a=0[v]';
ff([...inputs.flatMap(i=>['-i',i.path]),'-i',audio,'-filter_complex',filters,'-map','[v]','-map','4:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','aac','-b:a','160k','-movflags','+faststart',output]);
ff(['-i',audio,'-c:a','aac','-b:a','160k',reference]);
const packets=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',p],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024})).packets;
const streams=probe(output),v=streams.find((s:any)=>s.codec_type==='video'),a=streams.find((s:any)=>s.codec_type==='audio');
if(Number(v.nb_read_frames)!==540||v.r_frame_rate!=='24/1'||a.sample_rate!=='24000'||a.channels!==2||a.time_base!=='1/24000'||Number(a.duration_ts)!==540000||JSON.stringify(packets(output))!==JSON.stringify(packets(reference)))throw Error('Joined picture or single continuous AAC encode mismatch.');
const manifest={at:new Date().toISOString(),scope:'Complete22.5s mission window ONLY for joined review, not wholefilm completion',productionRunId:prep.productionRunId,planningBriefHash:prep.planningBriefHash,sourceStartMs:162839,sourceEndMs:185339,sourceStartSample:3908136,sourceEndSample:4448136,sourceSamples:540000,sampleRate:24000,sourceMixPath:mix,sourceMixSha256:mixSha,exactPcmSubsetSha256:createHash('sha256').update(actualPcm).digest('hex'),noGainOrResampling:true,noAudioGapsOrAddedPauses:true,aacPacketsIdenticalToSingleReferenceEncode:true,inputs,filters,frames:540,fps:24,joinFrames:[120,240,360],output,outputSha256:hash(output),audio,audioSha256:hash(audio),reference,providerCalls:0,databaseWrites:0,qualityApproved:false,wholeFilmReady:false,limitations:['Cuts are illustrative allocations, not exact Hatam word/verse timing.','Actual whole-window audio/picture and joins still require audiovisual review. Native sound excluded.','Anointing selected endpoint must separately be directly reviewed for completed contact and withdrawal.']};
writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});console.log(JSON.stringify({output,frames:540,sourceSamples:540000,qualityApproved:false,providerCalls:0}));
