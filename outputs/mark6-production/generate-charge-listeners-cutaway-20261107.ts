// Additional quiet-listener coverage from an actual approved native ending.
// No invented keyframe, regenerated speech, new scene action or paid route.
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {generateNonSpeakingVideoCandidate,localMotionDirection} from '../../src/pipeline/media-generation/final-video.js';
import {LtxVideoProvider} from '../../src/providers/ltx/index.js';
import type {ShotRequest} from '../../src/providers/types.js';
import {sharedLtxTransport} from '../../src/providers/ltx/transport.js';
import {mark6NativeBudget} from './native-budget.js';
const root='outputs/mark6-production',folder=root+'/native-motion/travel-charge-listeners-cutaway-20261107',parentFolder=root+'/native-motion/scene2-shot2-commissioning-medium-final-v1',project='c457a815-d07d-4902-91b5-7b936b549856',shot='62288e58-86c4-4766-a567-f43d67d41573',parentId='ca57383b-8aaf-4c30-8974-82c0c94d255e',execute=process.argv.includes('--execute'),db=getDb(),data=getDataDir(),read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
try{
 const plan=requireCurrentPlan(db,data,project);validateAttemptRevision(db,data,project,parentId);
 const parent=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND shot_id=? AND status='accepted'").get(parentId,shot),selected=db.prepare('SELECT id FROM clips WHERE generation_attempt_id=?').get(parentId),decision=read(parentFolder+'/root-picture-review.json');
 if(!parent?.result_asset_path||!selected||decision.attemptId!==parentId||decision.selectedFrameEndExclusive!==240||hash(join(data,'assets',String(parent.result_asset_path)))!==decision.sourceSha256||existsSync(folder+'/request.json')||existsSync(folder+'/result.json'))throw Error('Actual accepted native54 and no duplicate cutaway required');
 const raw=join(data,'assets',String(parent.result_asset_path)),frame=parentFolder+'/actual-frame239.png';
 const rgb=(path:string,filter?:string)=>execFileSync('ffmpeg',['-v','error','-nostdin','-i',path,...(filter?['-vf',filter]:[]),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'],{windowsHide:true,maxBuffer:4*1024*1024});
 const actual=rgb(raw,'select=eq(n\\,239)');if(!actual.equals(rgb(frame)))throw Error('Actual frame239 extraction changed pixels');
 const imageAsset='preparation/mark6-motion-continuity-20261107/charge-listeners-native54-frame239.png',image=join(data,'assets',imageAsset);mkdirSync(join(data,'assets/preparation/mark6-motion-continuity-20261107'),{recursive:true});if(existsSync(image)){if(hash(image)!==hash(frame))throw Error('Retained endpoint changed');}else copyFileSync(frame,image);
 mkdirSync(folder,{recursive:true});
 const reason='Keep every source word while covering held articulation in travel charge first window frames132–239 (5.5–10.0s) with new quiet listener motion. Existing commissioning sequence retains its original footage; new five-second take is not a loop or reused moving range.';
 const prompt='Exactly these two existing listeners in this clean chest-up two-shot: older rust-mantled man LEFT and bareheaded cream-and-green man RIGHT. Both remain comfortably upright and planted in their current positions, quietly attending to the offscreen teacher to image LEFT. Independently timed ordinary blinking, gentle breathing and tiny natural eye adjustments; lips remain quietly at rest. Keep their same faces, hair, beards, tunic openings, stripes, mantle folds and visible staff ownership. Preserve the plain doorway and stone facade, wall, trees, daylight and exposure. Fixed camera and stable framing, both complete heads comfortably visible. Quiet listening continues throughout; no new emotional reaction, nod, bow, hand gesture, speech or extra person. The teacher stays outside this picture.';
 if(prompt.length>1000)throw Error('Bounded same-action direction required');
 const projection={kind:'actual_last_retained_native_frame_projection',parentAttemptId:parentId,parentClipId:selected.id,sourceRaw:raw,sourceRawSha256:decision.sourceSha256,nativeFrameIndex:239,endingImagePath:image,endingImageSha256:hash(image),exactFullFrameRgbUnchanged:true,fullFrameRgbSha256:createHash('sha256').update(actual).digest('hex'),originalKeyframeAttemptId:'706e1acd-cdba-4c7d-8dad-69ad325955e9',providerCalls:0};
 writeFileSync(folder+'/prepared.json',JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,briefHash:plan.brief_hash,projection,prompt,reason,durationSeconds:5,proposedSelectedFrames:108,proposedSourceWindowFrames:[132,240],proposedSourceGlobalMs:[121689,126189],noNewNarrative:true,paidFallback:false,qualityApproval:false},null,2));
 if(!execute){console.log(JSON.stringify({status:'prepared_actual_native_endpoint_only',imageAsset,prompt,providerCalls:0}));}
 else{
  const journal=read(root+'/native-generation/execution.json'),q=read(root+'/allowance-snapshot.json'),age=Date.now()-Date.parse(q.observedAt);
  if(!process.env.LTX_TOKEN||journal.entries.length!==61||journal.entries.some((e:any)=>e.status!=='returned_unreviewed')||q.source!=='actual_host_get_usage_limits'||q.ordinaryUsageAllowed!==true||!Number.isFinite(q.usedPercent)||q.usedPercent<0||q.usedPercent>100||age<0||age>60000)throw Error('Settled native61 and fresh actual allowance required');
  const requestNoteId=randomUUID(),pin={kind:'same_approved_action',runId:plan.id,briefHash:plan.brief_hash,acceptedAttemptId:parentId,reason};
  db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(requestNoteId,project,shot,'Production Director approved source coverage v1:'+JSON.stringify(pin),Date.now());requireCurrentPlan(db,data,project);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELEVENLABS_API_KEY','FAL_KEY','KLING_ACCESS_KEY','KLING_SECRET_KEY'])delete process.env[k];
  writeFileSync(folder+'/request.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,shotId:shot,requestNoteId,reason,projection,productionRunId:plan.id,briefHash:plan.brief_hash,newNativeMaximum:1,durationSeconds:5,freeWebEncoder:true,paidFallback:false},null,2),{flag:'wx'});
  const local=mark6NativeBudget(root).video(new LtxVideoProvider({dataDir:data,lazyLoadDownloadedFast:true}));
  const provider={generateFinal:(r:ShotRequest,o:Parameters<typeof local.generateFinal>[1])=>{writeFileSync(folder+'/native-prompt-compilation.json',JSON.stringify({sourceApprovedDirection:localMotionDirection(r.prompt),nativeMotionPrompt:prompt,startFrameOverride:projection,noNewNarrative:true},null,2),{flag:'wx'});return local.generateFinal({...r,prompt},{...o,startFrame:{path:imageAsset}});}};
  const blocked={generateFinal:async()=>{throw Error('Paid video route disabled')}},noDraft=async()=>{throw Error('No extra draft or fallback authorized')};
  const result=await generateNonSpeakingVideoCandidate(db,project,shot,{primaryBackend:'ltx',ltx:provider,veo:blocked,kling:blocked,draft:{generateDraft:noDraft,generateGuided:noDraft}},{durationSeconds:5,allowDraftFallback:false,additionalCoverage:{acceptedAttemptId:parentId,requestNoteId,reason}});
  writeFileSync(folder+'/result.json',JSON.stringify({at:new Date().toISOString(),result,projection},null,2),{flag:'wx'});console.log(JSON.stringify(result));
 }
}finally{sharedLtxTransport().reset();db.close();}
