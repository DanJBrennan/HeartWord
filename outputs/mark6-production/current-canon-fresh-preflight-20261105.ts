import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {loadCrewBrief,crewBriefHash,digest,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {hasCurrentSourceReview} from '../../src/pipeline/ingestion/source-review.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {newProductionRecord} from '../../src/pipeline/creative-direction/production-record.js';
import {runCrew} from '../../src/pipeline/creative-direction/crew.js';
import {latestCrewRun,productionRecordForRun} from '../../src/pipeline/creative-direction/crew-store.js';
import {codexInputBudget} from '../../src/providers/codex-text.js';
const root='outputs/mark6-production',dataDir='C:/Users/danbr/HeartWordData',projectId='c457a815-d07d-4902-91b5-7b936b549856',db=new DatabaseSync(dataDir+'/db/heartword.sqlite',{readOnly:true});
if(!hasCurrentSourceReview(db,projectId))throw Error('Current prepared-source acceptance required');
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND (status='running' OR status='approved')").get(projectId))throw Error('Fresh offline preflight assumes no active or already accepted plan');
const manifest=JSON.parse(readFileSync(root+'/current-canon-reference-review-inputs-20261105-v2.json','utf8'));
const media=manifest.media.map((ref:any)=>({mimeType:ref.mimeType,data:readFileSync(ref.path).toString('base64'),caption:`REFERENCE ${ref.key}; SHA256:${ref.sha256}. ${ref.caption} These supplemental references were not seen by retained initial proposals; they require actual current owner review.`,characterIds:ref.characterIds}));
const brief=loadCrewBrief(db,dataDir,projectId,'planning'),hash=crewBriefHash(brief,'planning'),visualMedia=canonReferenceMedia(db,dataDir,brief,{compact:true,includeBody:true});
if(visualMedia.length+media.length>16)throw Error('Whole-chapter image count exceeds existing cap');
const bytes=[...visualMedia,...media].reduce((n,m)=>n+Buffer.byteLength(m.data,'base64'),0);if(bytes>16*1024*1024)throw Error('Whole-chapter image bytes exceed existing cap');
let nextRequest:unknown;
// Match the store's fresh-run history/issue carry, without inheriting proposals
// or acceptance from the old canon context.
const previous=latestCrewRun(db,projectId,'planning'),record=newProductionRecord(brief,'offline-current-canon',hash),prior=productionRecordForRun(db,previous);
if(previous){
 const old=JSON.parse(previous.brief_json),same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const {hashes:oldHashes,...oldSource}=old.source,{hashes:currentHashes,...currentSource}=brief.source;
 const assetHashes=(canon:any[])=>new Set(canon.flatMap(c=>db.prepare('SELECT path FROM character_assets WHERE character_version_id=?').all(c.versionId).map(a=>digest(readFileSync(productionAssetPath(dataDir,String(a.path)))))));
 const oldCanonHashes=assetHashes(old.canon),currentCanonHashes=assetHashes(brief.canon);
 // source.hashes also contains every canon asset hash, so those approved
 // replacements must be distinguished from unchanged Scripture/audio inputs.
 if(!same(oldSource,currentSource)||!same(old.audio,brief.audio)||!same(oldHashes.filter((h:string)=>!oldCanonHashes.has(h)),currentHashes.filter(h=>!currentCanonHashes.has(h)))){
  writeFileSync(root+'/current-source-comparison-diagnostic-20261105.json',JSON.stringify({old:{source:old.source,audio:old.audio},current:{source:brief.source,audio:brief.audio}},null,2));
  throw Error('Source text, original clock or approved speech binding changed; exact comparison saved for inspection');
 }
 const updated=new Map([['0ee7b1c5-b33c-43b7-b6e4-803fb18e9bf6','22e9661e-bd79-4cf2-ac42-48c606d47c03'],['1192b5d3-5972-4555-a95b-f9fa7b355a6d','5f35d10f-49db-4f01-be78-1694a5a6b3dc']]);
 if(brief.canon.length!==old.canon.length+1)throw Error('Unexpected canon roster change');
 for(const c of old.canon){const now=brief.canon.find(n=>n.id===c.id);if(!now||(updated.has(c.id)?now.versionId!==updated.get(c.id):!same(c,now)))throw Error('Unrelated approved canon changed');}
 const executioner='f7020de6-2c55-4cd9-9d35-7b72eaf93bde',allowed=new Set(['72a59708-601c-45c3-83f4-4865ac74d86c','30917d11-1f9f-420e-aa03-a9a8c7372b2d','4896fbf4-4628-4a53-9b30-863bd5639c16']);
 for(const shot of brief.shots){
  const before=old.shots.find((s:any)=>s.id===shot.id);if(!before)throw Error('Baseline shot missing');
  const {characterIds,...rest}=shot,{characterIds:oldCast,...oldRest}=before;
  if(!same(rest,oldRest)||!same(characterIds.filter(id=>id!==executioner).sort(),[...oldCast].sort())||characterIds.includes(executioner)!==allowed.has(shot.id))throw Error('Changes exceed the three source-attested nonspeaking cast links');
 }
}
if(prior){record.history=[...new Map([...record.history,...prior.history].map(h=>[h.id,h])).values()];record.objections=[...new Map([...record.objections,...prior.objections].map(o=>[o.id,o])).values()];}
const result=await runCrew({phase:'planning',brief,productionRecord:record,media,visualMedia,maxShotTaskSize:32,creativeFeedback:true,scopedContext:true,boundedContext:true,maxCalls:30,maxInferenceCalls:300,maxSuppliedTextBytes:400000,maxReviewTextBytes:1000000,log:()=>{},call:async(prompt,schema,images)=>{nextRequest={budget:codexInputBudget(prompt,schema,images,1000000),images:images.length,phase:prompt.match(/TASK CONTEXT:[^\n]+/)?.[0],nativeRequests:0};throw Error('OFFLINE_CURRENT_CANON_PREFLIGHT_ONLY');}});
if(!nextRequest||!result.summary.includes('OFFLINE_CURRENT_CANON_PREFLIGHT_ONLY'))throw Error('Offline review did not reach first request');
const proof={status:'fresh_current_canon_inputs_fit_no_calls',briefHash:hash,shots:brief.shots.length,canonCount:brief.canon.length,canonVersions:brief.canon.map(c=>({id:c.id,name:c.name,versionId:c.versionId})),sourceHashes:brief.source.hashes,sourceWordsAndClockUnchanged:true,carriedHistory:record.history.length,carriedIssues:record.objections.length,normalCanonImages:visualMedia.length,supplementalImages:media.length,totalImages:visualMedia.length+media.length,totalImageBytes:bytes,nextRequest,noRetainedOldBriefApproval:true,noProviderCalls:true};
writeFileSync(root+'/current-canon-fresh-preflight-20261105.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({briefHash:hash,shots:proof.shots,canonCount:proof.canonCount,normalImages:proof.normalCanonImages,supplementalImages:proof.supplementalImages,imageBytes:bytes,nextRequest}));db.close();
