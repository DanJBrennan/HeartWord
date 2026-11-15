// Provider-free rerender of this retained chapter. Uses the packaged application.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const data=process.env.HEARTWORD_DATA_DIR;
if(!data)throw Error('Set HEARTWORD_DATA_DIR to the restored project root.');
const application=resolve(process.env.HEARTWORD_APPLICATION_DIR??join(data,'application'));
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const id=arg('--id'),reviewer=arg('--reviewer'),evidence=arg('--evidence');
if(!id||!reviewer||!evidence)throw Error('Supply --id, --reviewer and --evidence for the saved producer edit.');
const project='c457a815-d07d-4902-91b5-7b936b549856';
const load=path=>import(pathToFileURL(join(application,path)).href);
const {getDb}=await load('src/db/client.ts');
const {loadCrewBrief,crewBriefHash,productionAssetPath}=await load('src/pipeline/creative-direction/crew-context.ts');
const {renderProducerReviewedCut}=await load('src/pipeline/assembly/render-editorial-cut.ts');
const {applyProducerReviewedFinishing}=await load('src/pipeline/assembly/finishing.ts');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const db=getDb();
try{
 const before={};for(const table of ['generation_attempts','production_runs','cost_ledger_entries'])before[table]=Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
 const pictureRow=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='render_editorial_cut' AND json_extract(payload,'$.producerReview') IS NOT NULL ORDER BY sequence DESC LIMIT 1").get(project);
 const soundRow=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='apply_finishing' AND json_extract(payload,'$.producerReview') IS NOT NULL ORDER BY sequence DESC LIMIT 1").get(project);
 if(!pictureRow||!soundRow)throw Error('Retained named producer picture and soundtrack reviews are required.');
 const original=JSON.parse(pictureRow.payload),sound=JSON.parse(soundRow.payload),brief=loadCrewBrief(db,data,project,'editing');
 if(brief.retainedPerformanceMaster?.sha256!=='e48634f5f60d96ad2e5aa57e6d1b73edc29c378318c081b9787493c4879f0724')throw Error('Exact unchanged approved review dialogue required.');
 const contribution=structuredClone(original.producerReview.contribution),editIndex=arg('--shift-edit'),shiftFrames=arg('--shift-frames');
 let change=null;
 if(editIndex!==undefined||shiftFrames!==undefined){
  const i=Number(editIndex),frames=Number(shiftFrames);
  if(!Number.isSafeInteger(i)||i<0||!Number.isSafeInteger(frames)||frames<1)throw Error('Specify an existing edit index and positive real frame offset.');
  const edit=contribution.edits[i],shot=brief.shots.find(s=>s.id===edit?.shotId);
  if(!edit||!shot||shot.needsLipSync)throw Error('The isolation proof only shifts a non-lip-synced retained picture; speech is unchanged.');
  const clip=[shot.clip,...shot.availableClips??[]].find(c=>c?.id===edit.clipId);
  if(!clip)throw Error('The exact accepted picture choice is missing.');
  const start=edit.sourceStartMs+frames*1000/24,path=productionAssetPath(data,clip.path);
  const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_streams','-of','json',path],{encoding:'utf8',windowsHide:true})).streams[0];
  const picture=original.cut.timeline.filter(t=>t.shotId!==null)[i];
  const used=Math.round(picture.endMs*24/1000)-Math.round(picture.startMs*24/1000);
  if(stream.r_frame_rate!=='24/1'||Math.round(start*24/1000)+used>Number(stream.nb_read_frames)||start+edit.durationMs>clip.durationMs+1)throw Error('The saved edit needs real accepted spare frames, never padding or new generation.');
  change={editIndex:i,shiftFrames:frames,oldSourceStartMs:edit.sourceStartMs,newSourceStartMs:start,clipId:clip.id,sourceAudioChanged:false};edit.sourceStartMs=start;
 }
 if(Object.values(sound.producerReview.contributions).some(c=>c.decision!=='approve')||sound.producerReview.contributions.composer.audioCues.some(c=>c.preserveApprovedMix!==true||c.gainDb!==0))throw Error('Keep the exact retained approved processed score at its approved level.');
 contribution.decision='approve';
 const review={id,reviewer,evidence,briefHash:crewBriefHash(brief,'editing'),contribution};
 const output=join(data,'review-project-rerenders',id);if(existsSync(output))throw Error('Existing proof output: inspect it instead of repeating.');mkdirSync(output,{recursive:true});
 writeFileSync(join(output,'saved-picture-edit.json'),JSON.stringify({review,change},null,2),{flag:'wx'});
 const picture=renderProducerReviewedCut(db,data,project,review),finishing=loadCrewBrief(db,data,project,'finishing');
 const finishingReview={id:id+'-approved-score',reviewer,evidence:'Retain exact original approved processed score and source clock after saved picture-only revision. '+evidence,briefHash:crewBriefHash(finishing,'finishing'),contributions:structuredClone(sound.producerReview.contributions)};
 writeFileSync(join(output,'saved-finishing-review.json'),JSON.stringify(finishingReview,null,2),{flag:'wx'});
 const result=applyProducerReviewedFinishing(db,data,project,finishingReview);
 const counts={};for(const table of Object.keys(before))counts[table]=Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n);
 if(JSON.stringify(before)!==JSON.stringify(counts))throw Error('Provider/crew/cost records changed during provider-free retained-media rerender.');
 const proof={at:new Date().toISOString(),dataRoot:resolve(data),applicationRoot:application,change,picture,result,sha256:hash(productionAssetPath(data,result.path)),providerCrewAndCostCountsBefore:before,providerCrewAndCostCountsAfter:counts,providerCalls:0,musicLevelChanged:false,sourceAudioChanged:false};
 writeFileSync(join(output,'result.json'),JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
}finally{db.close();}
