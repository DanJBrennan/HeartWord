// Existing external-keyframe handoff. One framing-only edit; immutable full context retained.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {getDb,getDataDir} from '../../src/db/client.js';
import {prepareKeyframe,sha256} from '../../src/pipeline/media-generation/external-keyframes.js';
import {requireCurrentPlan,directionsFromRun} from '../../src/pipeline/creative-direction/crew-store.js';
import {historicalSettingPrompt} from '../../src/pipeline/historical-setting.js';
const root='outputs/mark6-production',folder=root+'/keyframes/john-rebuke-headroom-20261108-v1',shot='9dfadec5-e0df-4446-995f-da741495f7db',sourceId='d1f1c6f6-9fe8-4a7a-be95-327b8a3104e2',read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
if(existsSync(folder+'/prepare-result.json')||read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('Prepare once at settled native boundary; no duplicate handoff');
const db=getDb(),data=getDataDir();
try{
 const plan=requireCurrentPlan(db,data,'c457a815-d07d-4902-91b5-7b936b549856'),source=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='accepted' AND operation='generate'").get(sourceId,shot);
 if(plan.brief_hash!=='07ffceb50c4deb9cf684d0473286bf8a69692149d01fcf3f16b83186dac7f412'||!source?.result_asset_path)throw Error('Actual current accepted John frame and plan required');
 const target=String(source.result_asset_path),targetSha=sha256(readFileSync(join(data,'assets',target)));
 if(targetSha!=='f73e3e8e6bc818604542dcb886c1e9b1fdf1e2d63ebc74b8623406f490d8833a')throw Error('Actual inspected John source changed');
 const prompt=`Use case: identity-preserve. Asset type: 16:9 photographic starting-frame correction for source-faithful Hatam Mark6.
IMAGE1 is the exact accepted scene EDIT TARGET, not permission to redesign the actor or scene. Make ONE framing correction: widen this same camera view modestly so there is a clear band of the SAME palace background ABOVE the highest curl, about10percent of final image height. Show the complete existing hair/beard/face and shoulders without changing their proportions. Preserve his existing supported body position and camera height/angle; retain the same slightly image-right eyeline toward the offscreen royal listener. This is not a new dramatic pose.
Keep the exact lean mature Papuan John identity, curly dark hair, full long beard, skin, age, quiet firm closed-mouth expression, rough brown hair-cloth garment, neckline, folds, and exposed upper chest as IMAGE1. Preserve the same reverse palace view, rectangular square piers, recess, burgundy/gold-edged screen, warm hall-left lighting and weaker stone bounce, exposure and photographic texture. Extend only the immediate already-implied background needed for wider framing, keeping the same spatial relationships. No new fixture, window grid, arch, prop, actor, chain, guard, gesture, text, caption or graphic. No crown, modern clothing, prison or banquet. Alive and unbound. No expression beautification or costume finish. One unlettered landscape16:9 photorealistic frame. Source quote08/5.4135s, voice, chronology and approved music stay unchanged; this still does not certify motion or lip-sync.`;
 const rationale='Framing-only headroom correction before costly native speech. Direct actual source and projected preview show very tight upper curls; preserve accepted face/body/setting and same eyeline. No new narrative/canon/source decision. Original tight frame retained. Actual returned frame/canon and later whole speech/joins require independent review.';
 const brief=prepareKeyframe(db,data,shot,prompt,rationale),unabridged=brief.prompt;
 // Exact accepted edit target already embodies identity, garment and scene. Full canon/source/FDL
 // remain immutable in context/filmInput and archived text; no global chapter history in edit call.
 brief.prompt=prompt+'\nCONTROLLING EXISTING SHOT DIRECTION:\n'+directionsFromRun(plan,shot)+'\nSCOPED HISTORICAL RULES:\n'+historicalSettingPrompt(brief.context.project,[brief.context.scene.sequence]);
 brief.generationInputs=[{path:target,sha256:targetSha,referenceNumbers:[]}];brief.promptHash=sha256(brief.prompt);
 if(brief.prompt.length>16000)throw Error('Inspect unexpectedly large scoped framing edit');
 mkdirSync(folder,{recursive:true});writeFileSync(folder+'/unabridged-governed-prompt.txt',unabridged,{flag:'wx'});
 const dir=join(data,'exports/keyframe-briefs',brief.id);mkdirSync(dir,{recursive:true});const briefFile=join(dir,'brief.json');writeFileSync(briefFile,JSON.stringify(brief,null,2),{flag:'wx'});writeFileSync(join(dir,'prompt.txt'),brief.prompt,{flag:'wx'});writeFileSync(folder+'/prompt.txt',brief.prompt,{flag:'wx'});
 const result={brief:briefFile,shotId:shot,sourceAttemptId:sourceId,sourceSha256:targetSha,promptCharacters:brief.prompt.length,generationInputs:[{path:join(data,'assets',target),sha256:targetSha,referenceNumbers:[]}],projection:{kind:'single_accepted_target_framing_edit_only',unabridgedSha256:sha256(unabridged),actualPromptSha256:brief.promptHash,fullImmutableContextAndFilmInputRetained:true,scope:'Exact target preservation plus complete existing shot director and scoped historical rules. Offscreen cast/global prose and canonical boards retained outside image call; actual reference and full canon checked again on return.'},imageCalls:0,nativeCalls:0,wholeFilmReady:false};
 writeFileSync(folder+'/prepare-result.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
}finally{db.close();}
