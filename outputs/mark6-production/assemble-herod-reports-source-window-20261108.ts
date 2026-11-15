// Existing accepted native clips -> complete continuous source window; no provider/selection calls.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const top=resolve('outputs/mark6-production'),base=join(top,'native-motion/herod-reports-preparation-v1'),folder=join(top,'complete-herod-reports-source-window-20261108'),project='c457a815-d07d-4902-91b5-7b936b549856';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const reconcile=process.argv.includes('--reconcile-movie-timescale');if(existsSync(folder)&&(!reconcile||existsSync(join(folder,'manifest.json'))))throw Error('Existing joined window requires inspection, never overwrite');
if(read(join(top,'native-generation/execution.json')).entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Native must settle before plan/clip inspection');
const prep=read(join(base,'prepared-source-and-motion.json'));
const defs=[
 {proof:prep.existingSelected[0],evidence:'prepared-source-and-motion.json#existingSelected0',frames:192,inputFrames:192},
 {proof:prep.existingSelected[1],evidence:'prepared-source-and-motion.json#existingSelected1',frames:96,inputFrames:96},
 {proof:read(join(base,'profile-final-after-reconcile-v2/quiet-prefix-selection.json')),evidence:'profile-final-after-reconcile-v2/quiet-prefix-selection.json',frames:144,inputFrames:144},
 {proof:read(join(base,'profile-quiet-continuation-v1/selection-and-assembly.json')),evidence:'profile-quiet-continuation-v1/selection-and-assembly.json',frames:96,inputFrames:96},
 {proof:read(join(base,'close-final-quiet-end-guided-v1/quiet-tail-selection.json')),evidence:'close-final-quiet-end-guided-v1/quiet-tail-selection.json',frames:72,inputFrames:72},
 {proof:read(join(base,'close-quiet-continuation-v1/selection-and-assembly.json')),evidence:'close-quiet-continuation-v1/selection-and-assembly.json',frames:120,inputFrames:120},
 {proof:read(join(base,'wide-final-open-ending-guided-v1/selection-and-assembly.json')),evidence:'wide-final-open-ending-guided-v1/selection-and-assembly.json',frames:240,inputFrames:240},
 {proof:read(join(base,'intro-final-quiet-guided-v1/selection-and-assembly.json')),evidence:'intro-final-quiet-guided-v1/selection-and-assembly.json',frames:97,inputFrames:120}
];
const db=getDb(),data=getDataDir();let inputs:any[];
try{
 const plan=requireCurrentPlan(db,data,project);if(plan.id!==prep.productionRunId||plan.brief_hash!==prep.planningBriefHash)throw Error('Current accepted plan changed');
 inputs=defs.map(d=>{const p=d.proof,attemptId=p.selection?.attemptId??p.attemptId??p.rawAttemptId;validateAttemptRevision(db,data,project,attemptId);
 const c=p.selection?.clipId?db.prepare("SELECT c.id FROM clips c JOIN generation_attempts g ON g.id=c.generation_attempt_id WHERE c.id=? AND g.id=? AND g.status='accepted'").get(p.selection.clipId,attemptId):db.prepare("SELECT c.id FROM clips c JOIN generation_attempts g ON g.id=c.generation_attempt_id WHERE g.id=? AND g.status='accepted' AND c.timeline_start_ms=0 AND c.timeline_end_ms=?").get(attemptId,d.inputFrames*1000/24);
 if(!c||p.assembled.hasDialogueAudio!==false||Math.abs(p.assembled.durationMs-d.inputFrames*1000/24)>.01)throw Error('Exact accepted silent clip required '+d.evidence);
 const path=join(data,'assets',p.assembled.assembledVideoPath);if(hash(path)!==p.assembledSha256)throw Error('Selected assembly changed');
 return{path,sha256:p.assembledSha256,attemptId,clipId:c.id,shotId:p.assembled.shotId,frames:d.frames,inputFrames:d.inputFrames,selectionEvidence:join(base,d.evidence)};});
}finally{db.close();}
const ff=(a:string[])=>execFileSync('ffmpeg',['-v','error','-nostdin','-n',...a],{windowsHide:true,maxBuffer:32*1024*1024});
const probe=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',p],{encoding:'utf8',windowsHide:true})).streams;
for(const i of inputs){const s=probe(i.path),v=s.find((s:any)=>s.codec_type==='video');if(v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==i.inputFrames||s.some((x:any)=>x.codec_type==='audio'))throw Error('Selected picture geometry/count/audio changed');}
const audio=resolve(prep.audioPath),mix=join(data,'assets/generated/hatam/mark-6/source-clock-mix-candidates-20261102/complete-source-clock-score-mix-candidate.wav'),mixSha='b2b68e5a0ec8446185d358318e8003f0159616c97d9863b06397924c44421547';
if(prep.sourceStartMs!==185339||prep.sourceEndMs!==229368.5||prep.audioStereoFrames!==1056708||prep.sampleRate!==24000||hash(audio)!==prep.audioSha256||hash(mix)!==mixSha)throw Error('Exact approved reports/source master required');
const pcm=(p:string,filter?:string)=>ff(['-i',p,...(filter?['-af',filter]:[]),'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-']);
const actualPcm=pcm(audio);if(actualPcm.length!==1056708*4||!actualPcm.equals(pcm(mix,'atrim=start_sample=4448136:end_sample=5504844,asetpts=PTS-STARTPTS')))throw Error('Exact continuous approved source PCM mismatch');
if(!existsSync(folder))mkdirSync(folder);const initial=join(folder,'complete-herod-reports-approved-mix.mp4'),output=join(folder,reconcile?'complete-herod-reports-approved-mix-sample-clock.mp4':'complete-herod-reports-approved-mix.mp4'),reference=join(folder,reconcile?'single-continuous-audio-reference-sample-clock.m4a':'single-continuous-audio-reference.m4a');if(reconcile&&(!existsSync(initial)||existsSync(output)||existsSync(reference)))throw Error('Exact retained initial mux and fresh sampleclock outputs required');
const filters=inputs.map((i,n)=>`[${n}:v]trim=end_frame=${i.frames},setpts=N/(24*TB)[w${n}]`).join(';')+';'+inputs.map((_,n)=>`[w${n}]`).join('')+'concat=n=8:v=1:a=0[v]';
if(reconcile)ff(['-i',initial,'-map','0:v:0','-map','0:a:0','-c','copy','-movie_timescale','24000','-movflags','+faststart',output]);else ff([...inputs.flatMap(i=>['-i',i.path]),'-i',audio,'-filter_complex',filters,'-map','[v]','-map','8:a:0','-c:v','libx264','-crf','20','-preset','fast','-pix_fmt','yuv420p','-fps_mode','passthrough','-enc_time_base:v','1:24','-c:a','aac','-b:a','160k','-movie_timescale','24000','-movflags','+faststart',output]);
ff(['-i',audio,'-c:a','aac','-b:a','160k','-movie_timescale','24000',reference]);
const packets=(p:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,duration,data_hash','-of','json',p],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024})).packets;
const s=probe(output),v=s.find((s:any)=>s.codec_type==='video'),a=s.find((s:any)=>s.codec_type==='audio');
if(Number(v.nb_read_frames)!==1057||v.r_frame_rate!=='24/1'||a.sample_rate!=='24000'||a.channels!==2||a.time_base!=='1/24000'||Number(a.duration_ts)!==1056708||JSON.stringify(packets(output))!==JSON.stringify(packets(reference)))throw Error('Joined picture/source single-continuous AAC encode mismatch');
if(reconcile&&JSON.stringify(packets(initial))!==JSON.stringify(packets(output)))throw Error('Remux changed originalAACpackets');
const manifest={at:new Date().toISOString(),movieTimescale:24000,...(reconcile?{containerReconciliation:{initialPath:initial,initialSha256:hash(initial),initialPreserved:true,operation:'codec-copyremuxonlyto24000movietimescale, sameexistingnormalstagebehavior',aacPacketsUnchanged:true}}:{}),scope:'Complete44.0295s original narrator reports only; wholefilm incomplete',productionRunId:prep.productionRunId,planningBriefHash:prep.planningBriefHash,sourceStartMs:185339,sourceEndMs:229368.5,sourceStartSample:4448136,sourceEndSample:5504844,sourceSamples:1056708,sampleRate:24000,sourceMixPath:mix,sourceMixSha256:mixSha,exactPcmSubsetSha256:createHash('sha256').update(actualPcm).digest('hex'),noGainOrResampling:true,noAudioGapsOrAddedPauses:true,aacPacketsIdenticalToSingleReferenceEncode:true,inputs,filters,frames:1057,fps:24,joinFrames:[192,288,432,528,600,720,960],pictureMinusAudioMs:1057/24*1000-44029.5,output,outputSha256:hash(output),audio,audioSha256:hash(audio),reference,providerCalls:0,databaseWrites:0,qualityApproved:false,wholeFilmReady:false,limitations:['Cuts illustrative, no native Hatam word boundaries inferred.','Finalintro97actualframes vs full120accepted; frame quantization only, no freeze/loop/retiming/sourcepause.','Whole-window heardAV and source-prefix joins remainrequired. Nativeaudio excluded.','Use retained original clips for final editable render, not recursively encoded preview.']};
writeFileSync(join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});console.log(JSON.stringify({output,frames:1057,sourceSamples:1056708,qualityApproved:false,providerCalls:0}));
