import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/herod-reports-preparation-v1/close-quiet-continuation-v1';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='c3e9a19f-59f1-4e79-a5d1-dcdd8555d158',shot='5d061b83-d717-4c37-86be-39e3e227585a',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review={at:new Date().toISOString(),reviewer:'Codex direct all121frame contacts and full sampled poses plus bounded AV59',attemptId:id,status:'clear_picture_for_review_production',sourceBindingMs:null,sourceWindowMs:[185339,229368.5],selectedFrames:[0,120],observations:[
 'All121actualframes and poses0/24/48/72/96/120 directlyinspected: same supportedseatedHerod/fullhair/currentcream-burgundy-narrowgold/barehead, chair/rectangularpiers/curtains/warmleftlight. No broadtoothygrin or raisedhand. Handsbelowframe notcertified.',
 'Actualperformance isrestrained uneasylistening, not perfectlyfixedneutralface: eyesclose/lowerroughly0.4to1.8s withbreath/slightlypartedlips, thenreopen; slightasymmetriclipcompression around2.5to3.4s, settleseriousby4s. No speechlikearticulation/newdialogue/joyfulgesture. Compatiblewithgoverningconcentrateduneasylistening, not a claimlipsclosedandeverybrowmotionabsent. Exactemotion/nativewordtiming notcertified.',
 'AV59all10checks clearthrough4.917s, nativeendpoint118-120 directlyinspected. Invalidconfidence6.8 discarded; modelclaimexactidentity/unchanginggaze notadopted; fineidentity/hiddengeometry limited.',
 'Selectnative0-119exact5s ascontinuationofselected88tail3s, totalplanned8sadditionalclose. Preservecomplete44.0295s originalnarrator/score, nogain/pause/nativeaudio/freeze/loop/retiming. Earlierwhole88 and87heldreactionsremainexcluded. Actualnormalizededges/join/fullreportsAVstillrequired.'
 ],evidence:['frames-000-059.png','frames-060-120.png','native-sampled-poses.png','motion-av-review.json'],providerCalls:0};
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_herod_close_quiet_continuation_av_20261108',project,av.response.costUsd))throw Error('Actual AV receipt required');
 writeFileSync(folder+'/root-picture-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 const selection=acceptFinalVideoCandidate(db,project,id,5000),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==5000||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==120||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized5s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:null,sourceWindowMs:[185339,229368.5],selectedFrames:[0,120],nativeAudioExcluded:true,providerCalls:0,fullHerodReportsJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-herod89-reviewed-selected-20261108',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
