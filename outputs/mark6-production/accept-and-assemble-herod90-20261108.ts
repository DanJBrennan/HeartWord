import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/herod-reports-preparation-v1/wide-final-quiet-guided-after-connection-v1';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='8af47847-84b5-4977-b178-1216932a6d16',shot='ade62c6b-cc88-4ebc-8436-5dafb8d676a7',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review={at:new Date().toISOString(),reviewer:'Codex direct all241frame contacts and full sampled poses plus bounded AV60',attemptId:id,status:'clear_picture_for_review_production',sourceBindingMs:null,sourceWindowMs:[185339,229368.5],selectedFrames:[0,240],observations:[
 'Actual241frames andnativefullsecondposes inspected: ONEsupportedseatedHerod, fullhair/body/chair/floor retained, lowhands onchairarms, cream boundneck/burgundynarrowgold/barehead, fixedrectangularpiers/curtains/urns/warmleftlight. Smallnaturalbody/headattentionmovement; no broadgrin/handgesture/newactor/ghost/reportmiming.',
 'Native0beginsfrompriorselectedwideendpoint191, notoriginalwideimage reset. Laterdeliberatecutbackfromcloserview is aneditorialchoice; do notclaimcontinuouscameramovementor hiddengeometry/finefaceidentity inwide.',
 'ActualboundedAV60alltenchecks mustbeclear andledgerreceiptpresent. Invalidconfidence outside0to1 ifpresent discarded; directactualending238-240inspected. No nativeHatamaccuracy/wordtiming/lens/completearchaeologycertification.',
 'Selectnative0-239exact10s additionalmovingwidecoveragewithinfull44.0295soriginalnarratorreports. Earlierselected8swide retainedseparately. Nativeaudioexcluded/no sourcegain/pause/freeze/loop/retiming. FullreportsjoinedAV and normalizededgespending.'
 ],evidence:['frames-000-083.png','frames-084-167.png','frames-168-240.png','native-sampled-poses.png','motion-av-review.json'],providerCalls:0};
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_herod_report_wide_quiet_guided_av_20261108',project,av.response.costUsd))throw Error('Actual AV receipt required');
 writeFileSync(folder+'/root-picture-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 const selection=acceptFinalVideoCandidate(db,project,id,10000),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==10000||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==240||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized10s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:null,sourceWindowMs:[185339,229368.5],selectedFrames:[0,240],nativeAudioExcluded:true,providerCalls:0,fullHerodReportsJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-herod90-reviewed-selected-20261108',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
