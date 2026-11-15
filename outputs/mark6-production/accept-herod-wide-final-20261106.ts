import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptFinalVideoCandidate} from '../../src/pipeline/media-generation/final-video.js';
const projectId='c457a815-d07d-4902-91b5-7b936b549856',attemptId='aff13335-a3b0-4981-95de-3a5055198a21',folder='outputs/mark6-production/native-generation/scene3-shot1-final-v1';
const db=getDb();
try{
 const row=db.prepare('SELECT shot_id,result_asset_path,status FROM generation_attempts WHERE id=?').get(attemptId);
 if(!row?.result_asset_path||row.status!=='hold_for_review')throw Error('Expected retained held final, not a draft or duplicate selection');
 const source=join(getDataDir(),'assets',String(row.result_asset_path)),sha256=createHash('sha256').update(readFileSync(source)).digest('hex');
 const probe=JSON.parse(readFileSync(folder+'/probe.json','utf8')),v=probe.streams.find((s:any)=>s.codec_type==='video');
 const av=JSON.parse(readFileSync(folder+'/motion-av-review.json','utf8'));
 if(v.r_frame_rate!=='24/1'||v.nb_frames!=='193'||v.width!==1280||v.height!==704||av.attemptId!==attemptId||av.media[0].sha256!==sha256||av.response.result.pictureStatus!=='clear')throw Error('Changed native result or missing bounded review');
 if(Object.values(av.response.result.checks).some((c:any)=>c.status!=='clear'))throw Error('Unresolved picture finding');
 const decision={at:new Date().toISOString(),attemptId,sourceAsset:row.result_asset_path,sourceSha256:sha256,sourceContainerFrames:193,fps:24,selectedFrameStart:0,selectedFrameEndExclusive:192,selectedPictureMs:8000,excludedRawTailFrames:[192,193],pictureReview:'Bounded whole-file AV plus direct 16-frame contact sheet and exact frames0,188,189,190,191,192. Sole seated Herod retains costume, support, low hands and quiet listening; no extra people, text or invented event seen. Preserve normal crop handling for actual1280x704.',cameraVariance:'Actual native take gently pushes toward Herod instead of literal fixed camera. AV claim of entirely static camera is incorrect. Accepted as minor framing variation under delegated routine production decisions: supported quiet listening and source action unchanged. Do not represent it as a locked camera or use native endpoint as identical wide-frame geometry.',avCaveats:['Uncalibrated confidence7 ignored','Native ambience-only assessment not independently auditioned; no native audio approved'],nativeAudio:'Excluded; exact approved external source/voice/score mix controls',limitations:['Not final chapter review or native-language certification','No source interval shortened or invented pause; full narration remains controlling','Retained actual movement does not yet prove next-shot edit continuity']};
 const selection=acceptFinalVideoCandidate(db,projectId,attemptId,8000);
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(randomUUID(),projectId,String(row.shot_id),'Scoped picture selection: Herod listening final '+attemptId+' frames0–191 /8.000s accepted. Native gentle push-in documented versus fixed-camera instruction; source action/canon unchanged. Native audio excluded. Preserve safe final aspect handling and verify adjacent close-view edit. Evidence '+folder+'/usable-picture-selection.json',Date.now());
 writeFileSync(folder+'/usable-picture-selection.json',JSON.stringify({...decision,selection},null,2),{flag:'wx'});
 console.log(JSON.stringify({selection,attemptId,selectedPictureMs:8000,nativeAudioApproved:false,cameraVarianceDocumented:true}));
}finally{db.close();}
