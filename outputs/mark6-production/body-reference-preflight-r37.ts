import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDataDir} from '../../src/db/client.js';
import {loadCrewBrief,crewBriefHash,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
import {sortAssetsByFreshness} from '../../src/characters/asset-freshness.js';
import {sceneReferenceAssetsForVerse} from '../../src/providers/story-state-assets.js';
const data=getDataDir(),db=new DatabaseSync(join(data,'db','heartword.sqlite'),{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
const brief=loadCrewBrief(db,data,'c457a815-d07d-4902-91b5-7b936b549856','planning');
const media=canonReferenceMedia(db,data,brief,{compact:true,includeBody:true});
const bodyViews=brief.canon.map(c=>{
 const rows=db.prepare('SELECT path,category,imported_from AS importedFrom,content_hash,asset_role,story_state,available_from_verse,available_through_verse FROM character_assets WHERE character_version_id=?').all(c.versionId) as Array<{path:string;category:string;importedFrom:string|null;content_hash:string|null}>;
 const sorted=sortAssetsByFreshness(sceneReferenceAssetsForVerse(rows),{headshot:0,body_pose:1,turnaround:2});
 const body=sorted.find(a=>a.category==='body_pose')??sorted.find(a=>a.category==='turnaround');
 if(!body)return{name:c.name,versionId:c.versionId,missingBody:true};
 const sha256=createHash('sha256').update(readFileSync(productionAssetPath(data,body.path))).digest('hex');
 return{name:c.name,versionId:c.versionId,bodyPath:body.path,sha256,representedInCaption:media.some(m=>m.caption?.includes(sha256))};
});
const value={status:'reference_packaging_only_not_costume_or_plan_approval',briefHash:crewBriefHash(brief,'planning'),characters:brief.canon.length,mediaCount:media.length,totalBytes:media.reduce((n,m)=>n+Buffer.byteLength(m.data,'base64'),0),bodyViews,
 media:media.map(m=>({characterIds:m.characterIds,caption:m.caption,sha256:createHash('sha256').update(Buffer.from(m.data,'base64')).digest('hex')})),newProviderCalls:0,canonChanged:false,runningReviewInputsChanged:false};
if(value.mediaCount>16||value.totalBytes>16*1024*1024||bodyViews.some(v=>'missingBody'in v||!v.representedInCaption))throw Error('Incomplete or over-budget body reference package');
writeFileSync('outputs/mark6-production/body-reference-preflight-r37.json',JSON.stringify(value,null,2));
console.log(JSON.stringify({status:value.status,characters:value.characters,mediaCount:value.mediaCount,totalBytes:value.totalBytes,allBodyViewsRepresented:true,newProviderCalls:0}));db.close();
