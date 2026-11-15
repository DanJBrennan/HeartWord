// Existing selected clips -> source-window review derivative. No provider calls or DB writes.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const top=resolve('outputs/mark6-production'),base=join(top,'native-motion'),folder=join(top,'complete-herodias-to-banquet-source-window-20261108'),project='c457a815-d07d-4902-91b5-7b936b549856',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(existsSync(join(folder,'manifest.json'))||existsSync(join(folder,'complete-herodias-to-banquet-approved-mix.mp4')))throw Error('Inspect retained/partial window explicitly; never overwrite');
if(read(join(top,'native-generation/execution.json')).entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('All native must settle before selected-clip/plan inspection');
const audio=read(join(folder,'audio-preparation-proof.json')),prep={productionRunId:audio.productionRunId,planningBriefHash:audio.planningBriefHash};
// Prepared only: execution requires all nine ACTUAL normal selected clips, including241real reactionframes.
const defs=[
 {name:'grudge_close',proof:'herodias-and-herod-narration-preparation-20261108/grudge-close-native-v1/selection-and-assembly.json',frames:192,inputFrames:192},
 {name:'grudge_medium',proof:'herodias-and-herod-narration-preparation-20261108/grudge-medium-native-v1/selection-and-assembly.json',frames:192,inputFrames:192},
 {name:'guarded',proof:'herodias-and-herod-narration-preparation-20261108/herod-fear-native-v1/selection-and-assembly.json',frames:120,inputFrames:120},
 {name:'kept_safe',proof:'herodias-and-herod-narration-preparation-20261108/herod-kept-safe-native-v1/selection-and-assembly.json',frames:120,inputFrames:120},
 {name:'perplexed_glad',proof:'herodias-and-herod-narration-preparation-20261108/herod-perplexed-glad-native-v2/selection-and-assembly.json',frames:120,inputFrames:120},
 {name:'banquet',proof:'banquet-preparation-20261108/establish-fixed-wide-native-v2/selection-and-assembly.json',frames:240,inputFrames:240},
 {name:'guests',proof:'banquet-preparation-20261108/guest-pan-native-v1/selection-and-assembly.json',frames:240,inputFrames:240},
 {name:'dance',proof:'banquet-preparation-20261108/dance-native-v1/selection-and-assembly.json',frames:240,inputFrames:240},
 {name:'pleased',proof:'banquet-preparation-20261108/herod-guests-pleased-native-v1/selection-and-assembly.json',frames:241,inputFrames:241}
];
const db=getDb(),data=getDataDir();let inputs:any[];
try{
 const plan=requireCurrentPlan(db,data,project);if(plan.id!==prep.productionRunId||plan.brief_hash!==prep.planningBriefHash||audio.productionRunId!==plan.id||audio.planningBriefHash!==plan.brief_hash)throw Error('Current exact accepted source plan required');
 inputs=defs.map(d=>{const p=read(join(base,d.proof)),id=p.selection?.attemptId??p.attemptId;validateAttemptRevision(db,data,project,id);
  const clip=db.prepare("SELECT c.id,c.timeline_start_ms,c.timeline_end_ms,ga.shot_id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.id=? AND ga.id=? AND ga.status='accepted'").get(p.selection.clipId,id);
  if(!clip||clip.shot_id!==p.assembled.shotId||clip.timeline_start_ms!==0||Math.abs(Number(clip.timeline_end_ms)-Math.round(d.inputFrames*1000/24))>.001||p.assembled.hasDialogueAudio!==false||Math.abs(p.assembled.durationMs-Math.round(d.inputFrames*1000/24))>.001)throw Error('Exact accepted normal-stage silent clip required: '+d.name);
  const path=join(data,'assets',p.assembled.assembledVideoPath);if(hash(path)!==p.assembledSha256)throw Error('Retained selected picture changed');
  return {...d,path,sha256:p.assembledSha256,shotId:p.assembled.shotId,attemptId:id,clipId:clip.id,selectionEvidence:join(base,d.proof),selectedInputFrameRange:[0,d.frames],parentAttemptId:p.selection.parentAttemptId??null,parentSelectedFrameRange:p.selection.range??null};
 });
}finally{db.close();}
const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:16*1024*1024});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
for(const i of inputs){const ss=probe(i.path),v=ss.find((s:any)=>s.codec_type==='video');if(ss.some((s:any)=>s.codec_type==='audio')||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==i.inputFrames)throw Error('Selected silent geometry/count changed: '+i.name);}
if(audio.sourceSamples!==1705296||audio.sampleRate!==24000||audio.channels!==2||JSON.stringify(audio.sourceSampleRange)!=='[6477600,8182896]'||JSON.stringify(audio.sourceMs)!=='[269900,340954]'||audio.sourceMasterSha256!=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'||hash(audio.sourceMaster)!==audio.sourceMasterSha256||hash(audio.audio)!==audio.audioSha256||hash(audio.reference)!==audio.referenceSha256)throw Error('Exact unchanged approved continuous master/source71.054s required');
const pcm=(p:string,filter?:string)=>ff(['-i',p,...(filter?['-af',filter]:[]),'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-']);
const actualPcm=pcm(audio.audio);if(actualPcm.length!==1705296*4||!actualPcm.equals(pcm(audio.sourceMaster,'atrim=start_sample=6477600:end_sample=8182896,asetpts=PTS-STARTPTS'))||createHash('sha256').update(actualPcm).digest('hex')!==audio.pcmSha256)throw Error('Original approved source PCM subset mismatch');
const filters=inputs.map((i,n)=>`[${n}:v]trim=end_frame=${i.frames},setpts=N/(24*TB)[w${n}]`).join(';')+';'+inputs.map((_,n)=>`[w${n}]`).join('')+'concat=n=9:v=1:a=0[v]',output=join(folder,'complete-herodias-to-banquet-approved-mix.mp4');
ff([...inputs.flatMap(i=>['-i',i.path]),'-i',audio.reference,'-filter_complex',filters,'-map','[v]','-map','9:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',output]);
const packets=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',p],{encoding:'utf8',windowsHide:true})).packets;
const ss=probe(output),v=ss.find((s:any)=>s.codec_type==='video'),a=ss.find((s:any)=>s.codec_type==='audio');if(Number(v.nb_read_frames)!==1705||v.r_frame_rate!=='24/1'||v.width!==1280||v.height!==720||a.channels!==2||a.time_base!=='1/24000'||Number(a.duration_ts)!==1705296||JSON.stringify(packets(output))!==JSON.stringify(packets(audio.reference)))throw Error('Actual whole picture/source/AAC packet count or timing mismatch');
const joins=join(folder,'actual-joins-and-ending.png'),ending=join(folder,'actual-final-frame1704.png');
ff(['-i',output,'-vf',"select='between(n,189,194)+between(n,381,386)+between(n,501,506)+between(n,621,626)+between(n,741,746)+between(n,981,986)+between(n,1221,1226)+between(n,1461,1466)+between(n,1701,1704)',scale=320:180,tile=6x9",'-frames:v','1',joins]);
ff(['-i',output,'-vf',"select='eq(n,1704)'",'-frames:v','1',ending]);
const manifest={at:new Date().toISOString(),scope:'Whole71.054s Mark6:19-22 source-window review derivative only, not wholefilm or editable project',productionRunId:prep.productionRunId,planningBriefHash:prep.planningBriefHash,sourceStartMs:269900,sourceEndMs:340954,sourceStartSample:6477600,sourceEndSample:8182896,sourceSamples:1705296,sampleRate:24000,sourceMixPath:audio.sourceMaster,sourceMixSha256:audio.sourceMasterSha256,exactPcmSubsetSha256:audio.pcmSha256,aacPacketsIdenticalToSingleReferenceEncode:true,noGainOrResampling:true,noAudioGapsOrAddedPauses:true,nativeAudioExcluded:true,inputs,filters,frames:1705,fps:24,joinFrames:[192,384,504,624,744,984,1224,1464],pictureMinusAudioMs:1705/24*1000-71054,output,outputSha256:hash(output),audio:a,reference:audio.reference,referenceSha256:hash(audio.reference),joinContact:joins,joinContactSha256:hash(joins),ending,endingSha256:hash(ending),qualityApproved:false,heardReviewPending:true,wholeFilmReady:false,providerCalls:0,databaseWrites:0,limitations:['Nine views/eight illustrative cuts. No precise semantic Hatam word boundary claimed; whole heard source action/pacing review still required.','Unresolved943ms speech285478-286421 remains audible; no verse overrides, source deletion or invented pause.','Final241frames must be real returned reviewed native120 frames, including frame240, not manufactured repetition or freeze.','Picture underhang12.333ms is ordinary24fps quantization only; full1705296sample audio retained.','Include actual incoming John-to-grudge3s join in heard review.','Editable final render retains ORIGINAL selected clips and global audio master, not recursively encoded review derivative.']};
writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});console.log(JSON.stringify({output,frames:1705,sourceSamples:1705296,qualityApproved:false,providerCalls:0,databaseWrites:0}));
