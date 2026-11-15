import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
const top='outputs/mark6-production',file=top+'/checkpoints/accepted150-default-warning-resolution-20261109.json',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
if(existsSync(file)||read(top+'/native-generation/execution.json').entries.some((x:any)=>x.status!=='returned_unreviewed'))throw Error('Actual nativeIDLE and new resolution receipt required');
const rootFile=top+'/complete-apostles-return-gathering-source-window-20261109-v2/root-joined-review.json',proof=read(rootFile),project='c457a815-d07d-4902-91b5-7b936b549856',attempt='9b60d160-0e0e-45d8-9a40-71da28973b74',note='a98bc853-7629-41e8-8a83-154b5ba1390f';
if(proof.attemptId!==attempt||!proof.av.all14Clear||proof.av.id!=='m6_apostles_return_selected120_and_scene_join_av_20261109'||!proof.all120NormalDecodedPicturesIdenticalToReviewedPicture||proof.sourceClearThroughMs!==450682)throw Error('Exact actual accepted150/root/AV106 evidence required');
const db=getDb();try {
 validateAttemptRevision(db,getDataDir(),project,attempt);
 const old=db.prepare("SELECT id,note,resolved FROM review_notes WHERE id=? AND project_id=? AND source='qc' AND resolved=0 AND note LIKE ?").get(note,project,'Final-video candidate '+attempt+'. final video review unavailable:%');
 if(!old||!db.prepare("SELECT c.id FROM clips c JOIN generation_attempts a ON a.id=c.generation_attempt_id WHERE c.id=? AND a.id=? AND a.status='accepted'").get(proof.clipId,attempt))throw Error('Exact still-unresolved default warning and selected accepted150 required');
 const receipt={at:new Date().toISOString(),attemptId:attempt,noteId:note,previous:old,resolved:1,reason:'Only unavailable unmetered default review is superseded by actual boundedAV106 all14clear plus actualselected120/direct/normal/root evidence. Unused native120 remains outside selection; earlier149bow and other held notes untouched.',rootFile,rootSha256:createHash('sha256').update(readFileSync(rootFile)).digest('hex'),providerCalls:0,sourceUnchanged:true,wholeFilmReady:false};
 db.exec('BEGIN IMMEDIATE');try {if(db.prepare('UPDATE review_notes SET resolved=1 WHERE id=? AND resolved=0').run(note).changes!==1)throw Error('Warning changed');db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-native150-av106-default-warning-resolved-20261109',project,'55eff677-5b57-43ef-b3ad-364e0f7378a6',JSON.stringify(receipt),Date.now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(file,JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({noteId:note,resolved:true,proof:rootFile,newProviderCalls:0}));
}finally{db.close();}
