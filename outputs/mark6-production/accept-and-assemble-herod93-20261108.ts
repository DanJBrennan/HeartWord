import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/herod-reports-preparation-v1/intro-final-quiet-guided-v1';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='331b8ca8-f449-4107-a541-873fcf6d3e04',shot='58ff35a7-c2ea-4f3c-bc49-ed36a4ce6d64',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review={at:new Date().toISOString(),reviewer:'Codex direct all121frame contacts and full sampled poses plus bounded AV63',attemptId:id,status:'clear_picture_for_review_production',sourceBindingMs:null,sourceWindowMs:[185339,229368.5],selectedFrames:[0,120],observations:[
 'Actualall121frames/0,24,48,72,96,120poses inspected: ONEsupportedseriousHerod, fullhair/uppermargin/currentcream-boundneck/burgundy-narrowgold/barehead/chair/rectangularpiers/curtain/warmleftlight stable. Quietmouth, ordinaryblinks/gazeadjustment/briefasymmetriclipcompression~1-2s withoutbroadgrin/speechlikearticulation/newgesture. Notperfectfixedneutralface; no newemotion/internalguiltinferred.',
 'ActualAV63alltenchecks clearthrough5s; nativeending118-120andplannedwindowending96inspected. Confidence.72uncalibrated/notacceptancewaiver. Unseenhands/feet/hiddengeometry/finefaceidentity limited.',
 'Guidanceusedactualaccepted89selectedframe119 ascontinuityreference, notoriginal923resetandnotAI95. Deliberatecutbackafterwide retainsseatedsupport/expression/garments/light. Source/narrator/approvedscoreunchanged.',
 'Acceptnative0-119exact5s silentmovingcontainer; complete44.0295sreportswindowusesFIRST97frames0-96only(framequantized4.041667s forremaining4.0295saudio). Nativeextra120excluded. Originalrestretained, no freeze/loop/retime/nativeaudio/newpause. HerodspokenassertionstartsONLYafter229368.5ms. Actualnormalizededges/wholejoinedreportsAVstillrequired.'
 ],evidence:['frames-000-059.png','frames-060-120.png','native-sampled-poses.png','motion-av-review.json'],providerCalls:0};
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_herod_pre_assertion_intro_av_20261108',project,av.response.costUsd))throw Error('Actual AV receipt required');
 writeFileSync(folder+'/root-picture-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 const selection=acceptFinalVideoCandidate(db,project,id,5000),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==5000||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==120||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized5s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:null,sourceWindowMs:[185339,229368.5],selectedFrames:[0,120],nativeAudioExcluded:true,providerCalls:0,fullHerodReportsJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-herod93-reviewed-selected-20261108',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
