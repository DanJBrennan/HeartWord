import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/scene2-mission-preparation-v1/shot-10-final-poised-contact-retake1';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='3f5c4ef5-716b-4e94-875f-3e4f5d77d9e4',shot='12503377-2358-4d09-b0b3-f55a672950d7',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review={at:new Date().toISOString(),reviewer:'Codex direct all121frame contacts and full sampled poses plus bounded AV54',attemptId:id,status:'clear_picture_for_review_production',sourceBindingMs:[177839,185339],selectedFrames:[0,180],observations:[
 'Actual all193frame contacts and native0/24/48/72/96/120/144/168/192poses directly inspected. Correct fourpeople/currentclothes/site/light retained. Peter RIGHT alone contacts sternforehead once around0.2to1.5s, withdraws/lowerhand byabout2s, sternbrowmodestlyeases afterward; youngwaits. Andrew retains ONEbowl LEFT atwaist andstaffRIGHT, PeterstaffLEFT. No secondanointer, repeatcontact or unsupportedbowl.',
 'Initialselectedpicture begins AFTER unshown oilpickup and BEFOREcontact; no claimpickup was filmed. This practical coverage clarifies within-reach staging, preserves source-authorized anointing/relief and ALL originalsourceaudio/narrator/approvedscore. No diagnosis/addedwords/scorecue/pause.',
 'Peter makes a small forward weight/foot adjustment after withdrawing and brieflylooksdown later; this is not an allfeetplanted/allheadsupright performance asencoderrequested. No groupbow, departure event, collision or newrecipientcontact observed. Staffsupport is coarsevisible, not certifiedsubpixel/hidden3D. Model exactallcontact/nosliding/perfectidentity claims notadopted.',
 'AV all10checks clear through7.917s; completeactualending and selectedframes178,179 directlyinspected, handalreadyLOW/bowlstable before7.5scut. Select0through179 exactly7.5s; exclude180through192, no gesturetruncation/freeze/loop/retiming. Nativeaudio unverified/excluded.',
 'Existingaspect-preserving scale/crop to1280x720, normalizedfirst/last inspected separately. Qualitative identity/hand-action/light continuity only; no nativeHatamaccuracy/lens/hiddenphysicalpush-clearance certificate. Full22.5smission joinedAV/fullchapter/editableproject remainpending.'
],evidence:['frames-000-095.png','frames-096-192.png','native-sampled-poses.png','motion-av-review.json'],providerCalls:0};
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_anoint_poised_contact_retake1_av_20261107',project,av.response.costUsd))throw Error('Actual AV receipt required');
 writeFileSync(folder+'/root-picture-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 const selection=acceptFinalVideoCandidate(db,project,id,7500),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==7500||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==180||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized5s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:[177839,185339],selectedFrames:[0,180],nativeAudioExcluded:true,providerCalls:0,fullMissionJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-anoint83-reviewed-selected-20261107',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
