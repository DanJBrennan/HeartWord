import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/scene2-mission-preparation-v1/shot-8-final-level-gaze-retake1-lease-recovered';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='2021447f-afea-4d79-a76c-26b208bf6c24',shot='5dbcf16e-4aed-48d7-a9f0-0c26f177b000',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review={at:new Date().toISOString(),reviewer:'Codex direct all121frame contacts and full sampled poses plus bounded AV52',attemptId:id,status:'clear_picture_for_review_production',sourceBindingMs:[167839,172839],selectedFrames:[0,120],observations:[
 'Actual six figures maintain upright heads/level chins through beginning, middle and ending. No collective bow, new touch, oil, relief or conversion event. Peter rust LEFT and Andrew barehead cream/green RIGHT remain back-to-camera; four listeners retain positions and garments.',
 'Independent subtle posture/cloth and facial changes, planted feet/staff tips and steady wall/tree/daylight. No obvious repeated speech or anatomy disruption at supplied resolution. Fine identity, hidden geometry and language accuracy remain unproved.',
 'AV all10 checks clear through4.917s; actual frames118,119 and unused120 directly inspected, no new ending defect. Model confidence6.8 is outside requested0to1 range and is invalid/not adopted; selection relies on concrete checks and direct evidence, never confidence.',
 'Select native0through119 for exactly5s, exclude extra120. Native sound remains unverified and excluded. Original source/narrator and approved score stay on continuous source clock. Five-second allocation is illustrative, not a Hatam word boundary.',
 'Normalize using existing aspect-preserving assembly scale/crop, no stretch/freeze/loop. Full mission joined audio/picture review and full chapter/editable project remain pending.'
],evidence:['frames-000-059.png','frames-060-120.png','native-sampled-poses.png','motion-av-review.json'],providerCalls:0};
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_preach_level_gaze_av_20261107',project,av.response.costUsd))throw Error('Actual AV receipt required');
 writeFileSync(folder+'/root-picture-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 const selection=acceptFinalVideoCandidate(db,project,id,5000),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==5000||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==120||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized5s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:[167839,172839],selectedFrames:[0,120],nativeAudioExcluded:true,providerCalls:0,fullMissionJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-preach77-reviewed-selected-20261107',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
