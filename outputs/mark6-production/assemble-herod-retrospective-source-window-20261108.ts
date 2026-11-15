// Existing selected clips -> source-window review derivative. No provider calls or DB writes.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const top=resolve('outputs/mark6-production'),base=join(top,'native-motion/herod-retrospective-preparation-v1'),folder=join(top,'complete-herod-retrospective-source-window-20261108'),project='c457a815-d07d-4902-91b5-7b936b549856',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(existsSync(join(folder,'manifest.json'))||existsSync(join(folder,'complete-herod-retrospective-approved-mix.mp4')))throw Error('Inspect retained/partial window explicitly; never overwrite');
if(read(join(top,'native-generation/execution.json')).entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('All native must settle before selected-clip/plan inspection');
const prep=read(join(base,'prepared-source-and-motion.json')),audio=read(join(folder,'audio-preparation-proof.json'));
// Unique reviewed native ranges intercut with other approved views; no semantic word timing.
// Last input frame83 is actual parent107 frame191, not a fabricated ending.
const defs=[
 {name:'responsibility',proof:'responsibility-final-awake-guided-v2/selection-and-assembly.json',frames:192,inputFrames:192},
 {name:'royal_listener',proof:'royal-listener-reviewed-ranges-v1/early-selection-and-assembly.json',frames:22,inputFrames:22},
 {name:'marriage',proof:'marriage-final-guided-v1/selection-and-assembly.json',frames:120,inputFrames:120},
 {name:'royal_listener',proof:'royal-listener-reviewed-ranges-v1/later-selection-and-assembly.json',frames:48,inputFrames:48},
 {name:'rebuke_tableau',proof:'rebuke_tableau-final-guided-v1/selection-and-assembly.json',frames:120,inputFrames:120},
 {name:'royal_listener',proof:'royal-listener-reviewed-ranges-v1/final-selection-and-assembly.json',frames:84,inputFrames:84}
];
const db=getDb(),data=getDataDir();let inputs:any[];
try{
 const plan=requireCurrentPlan(db,data,project);if(plan.id!==prep.productionRunId||plan.brief_hash!==prep.planningBriefHash||audio.productionRunId!==plan.id||audio.planningBriefHash!==plan.brief_hash)throw Error('Current exact accepted source plan required');
 inputs=defs.map(d=>{const p=read(join(base,d.proof)),v=prep.views.find((v:any)=>v.view===d.name),id=p.selection?.attemptId??p.attemptId;validateAttemptRevision(db,data,project,id);
  const clip=db.prepare("SELECT c.id,c.timeline_start_ms,c.timeline_end_ms,ga.shot_id FROM clips c JOIN generation_attempts ga ON ga.id=c.generation_attempt_id WHERE c.id=? AND ga.id=? AND ga.status='accepted'").get(p.selection.clipId,id);
  if(!clip||clip.shot_id!==v.shotId||clip.timeline_start_ms!==0||Math.abs(Number(clip.timeline_end_ms)-Math.round(d.inputFrames*1000/24))>.001||p.assembled.hasDialogueAudio!==false||Math.abs(p.assembled.durationMs-Math.round(d.inputFrames*1000/24))>.001)throw Error('Exact accepted normal-stage silent clip required: '+d.name);
  const path=join(data,'assets',p.assembled.assembledVideoPath);if(hash(path)!==p.assembledSha256)throw Error('Retained selected picture changed');
  return {...d,path,sha256:p.assembledSha256,shotId:v.shotId,attemptId:id,clipId:clip.id,selectionEvidence:join(base,d.proof),selectedInputFrameRange:[0,d.frames],parentAttemptId:p.selection.parentAttemptId??null,parentSelectedFrameRange:p.selection.range??null};
 });
}finally{db.close();}
const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:16*1024*1024});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
for(const i of inputs){const ss=probe(i.path),v=ss.find((s:any)=>s.codec_type==='video');if(ss.some((s:any)=>s.codec_type==='audio')||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==i.inputFrames)throw Error('Selected silent geometry/count changed: '+i.name);}
if(audio.sourceSamples!==586032||audio.sampleRate!==24000||audio.channels!==2||JSON.stringify(audio.sourceSampleRange)!=='[5761644,6347676]'||JSON.stringify(audio.sourceMs)!=='[240068.5,264486.5]'||audio.sourceMasterSha256!=='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547'||hash(audio.sourceMaster)!==audio.sourceMasterSha256||hash(audio.audio)!==audio.audioSha256||hash(audio.reference)!==audio.referenceSha256)throw Error('Exact unchanged approved continuous master/source24.418s required');
const pcm=(p:string,filter?:string)=>ff(['-i',p,...(filter?['-af',filter]:[]),'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-']);
const actualPcm=pcm(audio.audio);if(actualPcm.length!==586032*4||!actualPcm.equals(pcm(audio.sourceMaster,'atrim=start_sample=5761644:end_sample=6347676,asetpts=PTS-STARTPTS'))||createHash('sha256').update(actualPcm).digest('hex')!==audio.pcmSha256)throw Error('Original approved source PCM subset mismatch');
const filters=inputs.map((i,n)=>`[${n}:v]trim=end_frame=${i.frames},setpts=N/(24*TB)[w${n}]`).join(';')+';'+inputs.map((_,n)=>`[w${n}]`).join('')+'concat=n=6:v=1:a=0[v]',output=join(folder,'complete-herod-retrospective-approved-mix.mp4');
ff([...inputs.flatMap(i=>['-i',i.path]),'-i',audio.reference,'-filter_complex',filters,'-map','[v]','-map','6:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','copy','-movie_timescale','24000','-movflags','+faststart',output]);
const packets=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',p],{encoding:'utf8',windowsHide:true})).packets;
const ss=probe(output),v=ss.find((s:any)=>s.codec_type==='video'),a=ss.find((s:any)=>s.codec_type==='audio');if(Number(v.nb_read_frames)!==586||v.r_frame_rate!=='24/1'||v.width!==1280||v.height!==720||a.channels!==2||a.time_base!=='1/24000'||Number(a.duration_ts)!==586032||JSON.stringify(packets(output))!==JSON.stringify(packets(audio.reference)))throw Error('Actual whole picture/source/AAC packet count or timing mismatch');
const joins=join(folder,'actual-joins-and-ending.png'),ending=join(folder,'actual-final-frame585.png');
ff(['-i',output,'-vf',"select='between(n,189,194)+between(n,211,216)+between(n,331,336)+between(n,379,384)+between(n,499,504)+between(n,582,585)',scale=320:180,tile=6x6",'-frames:v','1',joins]);
ff(['-i',output,'-vf',"select='eq(n,585)'",'-frames:v','1',ending]);
const manifest={at:new Date().toISOString(),scope:'Whole24.418s retrospective review derivative only, not wholefilm or independent edit project',productionRunId:prep.productionRunId,planningBriefHash:prep.planningBriefHash,sourceStartMs:240068.5,sourceEndMs:264486.5,sourceStartSample:5761644,sourceEndSample:6347676,sourceSamples:586032,sampleRate:24000,sourceMixPath:audio.sourceMaster,sourceMixSha256:audio.sourceMasterSha256,exactPcmSubsetSha256:audio.pcmSha256,aacPacketsIdenticalToSingleReferenceEncode:true,noGainOrResampling:true,noAudioGapsOrAddedPauses:true,nativeAudioExcluded:true,inputs,filters,frames:586,fps:24,joinFrames:[192,214,334,382,502],pictureMinusAudioMs:586/24*1000-24418,lastInputSelectedEndingFrame:83,lastInputParentEndingFrame:191,output,outputSha256:hash(output),audio:a,reference:audio.reference,referenceSha256:audio.referenceSha256,joinContact:joins,joinContactSha256:hash(joins),ending,endingSha256:hash(ending),qualityApproved:false,heardReviewPending:true,wholeFilmReady:false,providerCalls:0,databaseWrites:0,limitations:['Six motivated views, five cuts illustrative, no semantic word boundary or invented pause.','Only exact disjoint106frames0-21/144-191 and107frames108-191 selected, intercut with other approved views. Last child83 equals actual107parent191. Both full parents remain held; all smiling middles excluded. No native frame repeated, frozen or retimed.','Picture underhang1.333333ms ordinary24fps quantization only, complete source AAC retained.','Full heard source-window review with actual q07 incoming3s cut remains required.','Final editable render must retain ORIGINAL selected clips/ranges/global master, not recursively encode this review derivative.']};
writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});console.log(JSON.stringify({output,frames:586,sourceSamples:586032,qualityApproved:false,providerCalls:0,databaseWrites:0}));
