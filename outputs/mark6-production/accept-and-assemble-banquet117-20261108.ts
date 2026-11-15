import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const folder='outputs/mark6-production/native-motion/banquet-preparation-20261108/establish-fixed-wide-native-v2';
const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
const id='aeab3c57-5b14-4789-a398-d0c7c5cc4962',shot='059f3fd1-0b75-4bd7-bb6b-4c15371661f6',project='c457a815-d07d-4902-91b5-7b936b549856';
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(av.attemptId!==id||av.response.result.pictureStatus!=='clear'||Object.keys(av.response.result.checks).length!==10||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Actual clear review and unchanged original required');
const review=JSON.parse(readFileSync(folder+'/root-picture-review.json','utf8'));
const db=getDb();try{
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get('mark6-production-audio-review-m6_banquet_establish_native117_av_20261108',project,av.response.costUsd))throw Error('Actual AV receipt required');
 const selection=acceptFinalVideoCandidate(db,project,id,10000),assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
 if(assembled.durationMs!==10000||assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==240||streams.some((s:any)=>s.codec_type==='audio')||hash(av.originalMotion.path)!==av.originalMotion.sha256)throw Error('Normalized10s/source integrity mismatch');
 const proof={at:new Date().toISOString(),attemptId:id,selection,assembled,assembledSha256:hash(out),rawSourceSha256:av.originalMotion.sha256,review:folder+'/root-picture-review.json',sourceBindingMs:null,sourceWindowMs:[269900,340954],selectedFrames:[0,240],nativeAudioExcluded:true,providerCalls:0,fullNarratorWindowJoinedReviewPending:true};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-banquet-establish117-reviewed-selected-20261108',project,shot,JSON.stringify({review,proof}),Date.now());
 console.log(JSON.stringify(proof));
}finally{db.close();}
