import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {crewBriefHash,digest,loadCrewBrief,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {productionAuthorization} from '../../src/pipeline/creative-direction/crew-store.js';
import {applyProducerReviewedFinishing,structuralCutFindings,type ProducerReviewedFinishing} from '../../src/pipeline/assembly/finishing.js';
const top='outputs/mark6-production',f=top+'/complete-film-20261112',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),project='c457a815-d07d-4902-91b5-7b936b549856',data=getDataDir(),db=getDb();
try{
 const auth=productionAuthorization(db,data,project);auth.assertCurrent();const base=read(f+'/picture-render-result.json'),brief=loadCrewBrief(db,data,project,'finishing');
 if(existsSync(f+'/finished-render-result.json')||read(top+'/native-generation/execution.json').entries.some((x:any)=>x.status!=='returned_unreviewed')||!brief.render||brief.render.id!==base.renderId||brief.render.sha256!==base.sha256||brief.render.durationMs!==817180||brief.render.audioMap?.length!==49||structuralCutFindings(brief).length)throw Error('Exact complete current actual unscored base and structural/source guards required');
 const music=brief.audioAssets.filter(a=>a.kind==='music'&&a.sha256==='a9c688cb41fb67fe31fd790a69354898217dbdaadaf4980d9ac6f5f16138599c'&&a.processedMusic?.includesDucking===true);if(music.length!==1)throw Error('Exactly one retained approved preprocessed score at original level required');
 const review:ProducerReviewedFinishing={id:'mark6-approved-existing-score-v1-20261112',reviewer:'Codex under Dan delegated autonomous review-production authority',evidence:'Apply the already producer-approved13-cue/3-track Mark5-derived processed score without additional gain, ducking, overlap or effects, retaining separate unchanged approved performance and entire source clock. Fresh24k rehearsal reproduces approved mix sample-for-sample. No new sound or color design. Actual whole output QC/AV and portable proof remain pending.',briefHash:crewBriefHash(brief,'finishing'),contributions:{
  colorist:{decision:'approve',summary:'Retain reviewed shot exposure and color; no new adjustment.',directions:[],findings:[],colorAdjustments:[]},
  composer:{decision:'approve',summary:'Preserve existing approved continuous processed music at0relativegain beneath complete source.',directions:[],findings:[],generationRequests:[],audioCues:[{assetId:music[0]!.id,startMs:6500,endMs:803180,sourceStartMs:0,gainDb:0,preserveApprovedMix:true,reason:'Exact retained producer-approved stem and ducking, source-offset6500ms, no second score or level change.'}]},
  sound_designer:{decision:'approve',summary:'Original retained dialogue, narrator reports and quiet only; no generated/native effects.',directions:[],findings:[],generationRequests:[],audioCues:[]}
 }};
 writeFileSync(f+'/finishing-brief.json',JSON.stringify(brief,null,2),{flag:'wx'});writeFileSync(f+'/finishing-producer-review.json',JSON.stringify(review,null,2),{flag:'wx'});
 auth.assertCurrent();const result=applyProducerReviewedFinishing(db,data,project,review);
 writeFileSync(f+'/finished-render-result.json',JSON.stringify({at:new Date().toISOString(),...result,sha256:digest(readFileSync(productionAssetPath(data,result.path))),baseRenderId:base.renderId,relativeMusicGainDb:0,additionalDucking:false,providerCalls:0,scope:'Actual complete scored review cut; full output QC/AV and portable restore EDIT RERENDER still required',wholeFilmReady:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
}finally{db.close();}
