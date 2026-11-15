import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/scene2-mission-preparation-v1/shot-9-final-level-head-retake2';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='5a297d5e-eff9-49d6-b84c-193dbf766be5',shot='2d139176-2b3a-4baf-9534-99f9013d7192',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review={at:new Date().toISOString(),reviewer:'Codex direct all121frame contacts and full sampled poses plus bounded AV53',attemptId:id,status:'clear_picture_for_review_production',sourceBindingMs:[172839,177839],selectedFrames:[0,120],observations:[
 'Actual all121frame contacts and native0/24/48/72/96/120poses inspected. Six people retain placement, current clothes, staffs and fixed wall/tree/daylight. Apostles mouths remain concealed. Stern/young witnesses maintain quiet upright posture; no collective bow or raised-arm response.',
 'Elder alone briefly lowers head toward low hands around1to2s and settles upright by3s. This exceeds requested all-level-head encoder prose but is compatible with governing Director independent restrained aftermath: low empty hands/shoulder settling, no synchronized worship, touch, diagnosis or exorcism gesture. No claim every head is level throughout. Headwrapped man subtly settles independently; no exact Hatam timing inferred.',
 'AV all10checks clear through4.917s; nativeending118through120 directly inspected for defects. Model confidence3.8 is outside requested0to1 and invalid/not adopted; actual visible evidence and explicit checks control. Fine identity/hidden geometry/native Hatam accuracy uncertified.',
 'Select native0through119 exactly5s, discard extra120; source172839to177839ms illustrative allocation, no added pause or retiming. Nativeaudio remains unverified and excluded, original continuous narrator/approved score retained.',
 'Existing aspect-preserving normalization only, no stretch/loop/freeze. Inspect normalized first/last frame separately. Fullmission joined audiovisual review, remaining fullchapter and actual portable editableproject restore are still pending.'
],evidence:['frames-000-059.png','frames-060-120.png','native-sampled-poses.png','motion-av-review.json'],providerCalls:0};
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_deliverance_level_head_retake2_av_20261107',project,av.response.costUsd))throw Error('Actual AV receipt required');
 writeFileSync(folder+'/root-picture-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 const selection=acceptFinalVideoCandidate(db,project,id,5000),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==5000||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==120||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized5s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:[172839,177839],selectedFrames:[0,120],nativeAudioExcluded:true,providerCalls:0,fullMissionJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-deliverance80-reviewed-selected-20261107',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
