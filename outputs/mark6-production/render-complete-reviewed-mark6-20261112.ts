import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {crewBriefHash,digest,loadCrewBrief,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {productionAuthorization} from '../../src/pipeline/creative-direction/crew-store.js';
import {planEditorialCut,resolveEditorialClip} from '../../src/pipeline/assembly/editorial-plan.js';
import {renderProducerReviewedCut,type ProducerReviewedCut} from '../../src/pipeline/assembly/render-editorial-cut.js';
const top='outputs/mark6-production',folder=top+'/complete-film-20261112',project='c457a815-d07d-4902-91b5-7b936b549856',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),data=getDataDir(),db=getDb();
try{
 const auth=productionAuthorization(db,data,project);auth.assertCurrent();
 const index=read(top+'/checkpoints/source-review-root-index-20261110.json'),draft=read(top+'/checkpoints/proposed-source-picture-editor-edits-through-healed263-20261112.json');
 if(read(top+'/native-generation/execution.json').entries.some((x:any)=>x.status!=='returned_unreviewed')||index.sourceClearStillMs!==796680||index.count!==83||draft.edits.length!==121||JSON.stringify(draft.sourceMs)!=='[0,796680]'||draft.sourceSamples24k!==19120320||!draft.pictureOnlyBoundaryReconciliations?.length)throw Error('Entire source/83root/121 reconciled explicit edits/nativeIDLE required');
 const final=read(top+'/complete-healed263-source-window-20261112/root-joined-review.json');
 if(final.sourceClearThroughMs!==796680||!final.actualAll190NormalAndFull188_189Viewed||!final.av.all12Clear||final.expectedFinalOutputPictures!==189)throw Error('Actual final263 accepted NORMAL/source/AV required');
 const brief=loadCrewBrief(db,data,project,'editing');
 if(brief.audio.length!==49||brief.audio[0]?.startMs!==0||brief.audio.at(-1)?.endMs!==796680||brief.retainedPerformanceMaster?.sha256!=='e48634f5f60d96ad2e5aa57e6d1b73edc29c378318c081b9787493c4879f0724'||brief.retainedPerformanceMaster.authorityId!=='mark6-retain-review-performance-master-v2-20261112'||(brief.editorialOpening?.at(-1)?.endMs??0)!==6500||(brief.editorialClosing?.at(-1)?.endMs??0)!==14000)throw Error('Exact current49 source intervals/revalidated unscored performance/6500opening/14000credits required');
 const roots=index.items.map((x:any)=>{if(!existsSync(x.root))throw Error('Missing retained root evidence');return {path:x.root,sha256:digest(readFileSync(x.root))};});
 const indexedRoots=new Set(index.items.map((x:any)=>resolve(x.root).toLowerCase()));const physical=[];
 for(const [i,e] of draft.edits.entries()){
  const clip=resolveEditorialClip(brief.shots.find(s=>s.id===e.shotId),e.clipId);
  if(!clip||clip.path!==e.exactEditorMediaPath||!existsSync(e.reviewEvidence)||!indexedRoots.has(resolve(e.reviewEvidence).toLowerCase()))throw Error('Accepted exact explicit EDITOR and retained root required '+i);
  const path=productionAssetPath(data,clip.path),streams=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',path],{encoding:'utf8',windowsHide:true})).streams,v=streams.find((s:any)=>s.codec_type==='video');
  if(!v||v.r_frame_rate!=='24/1'||!Number.isSafeInteger(Number(v.nb_read_frames))||Math.round(e.sourceStartMs*24/1000)+e.expectedOutputFrames>Number(v.nb_read_frames))throw Error('Physical frame capacity without cloning required '+i);
  physical.push({i,clipId:clip.id,path:clip.path,sha256:digest(readFileSync(path)),actualFrames:Number(v.nb_read_frames),usedFrames:e.expectedOutputFrames,sourceStartMs:e.sourceStartMs,reviewEvidence:e.reviewEvidence});
 }
 const contribution={summary:'Complete source-faithful Mark6 review cut from121 explicit accepted assembled choices, original source clock and approved fixed opening/credits. Actual wholefilm QC and portable proof still pending.',decision:'approve' as const,directions:[],findings:[],coverageRequests:[],edits:draft.edits.map((e:any)=>({shotId:e.shotId,clipId:e.clipId,sourceStartMs:e.sourceStartMs,durationMs:e.durationMs})),pauses:[],acceptanceChecks:{status:'clear' as const,evidence:'Input-only admission: all83 retained root reviews,121 current accepted explicit media choices, real frame capacities and entire19120320 source samples verified. Accepted review-only alignment uncertainty retained; no native-language or final-film certification.'}};
 const cut=planEditorialCut(brief,contribution);let frames=0,sourceIndex=0;
 for(const t of cut.timeline){const n=Math.round(t.endMs*24/1000)-Math.round(t.startMs*24/1000);frames+=n;if(t.shotId!==null){const actual=physical[sourceIndex++];if(!actual||actual.clipId!==t.clipId||actual.sourceStartMs!==t.sourceStartMs||actual.usedFrames!==n)throw Error('Timeline differs from the exact reviewed media/frame sequence');}}
 if(cut.durationMs!==817180||cut.audioMap.length!==49||sourceIndex!==121||frames!==19612||cut.audioMap[0]?.startMs!==6500||cut.audioMap.at(-1)?.endMs!==803180)throw Error('Whole source/opening/credits/global24fps placement required');
 mkdirSync(folder,{recursive:true});const review:ProducerReviewedCut={id:'mark6-complete-review-picture-v1-20261112',reviewer:'Codex under Dan delegated autonomous review-production authority',evidence:'Current exact source/canon/accepted media and saved direct+independent root reviews through final263, existing accepted review alignment and retained boundary uncertainty. Approved original dialogue/voices/narrator reports unchanged. Picture-only nominal1/7ms reconciliation preserves every actual global frame cut. Full film and portable project remain subject to actual output QC; no publishing authority.',briefHash:crewBriefHash(brief,'editing'),contribution};
 if(existsSync(folder+'/picture-render-result.json'))throw Error('Existing full render result: inspect/reuse, never repeat blindly');
 for(const [name,value] of [['editing-brief.json',brief],['picture-producer-review.json',review],['picture-input-proof.json',{at:new Date().toISOString(),roots,physical,cut,sourceSamples24k:19120320,sourceAudioChanged:false,frameCloningRequired:false,wholeFilmReady:false}] ] as const)writeFileSync(folder+'/'+name,JSON.stringify(value,null,2),{flag:'wx'});
 auth.assertCurrent();const result=renderProducerReviewedCut(db,data,project,review);
 writeFileSync(folder+'/picture-render-result.json',JSON.stringify({at:new Date().toISOString(),...result,sha256:digest(readFileSync(productionAssetPath(data,result.path))),scope:'Complete actual executable picture+unscored dialogue base; approved separate music finishing/wholefilmQC/portable proof pending',providerCalls:0,wholeFilmReady:false},null,2),{flag:'wx'});console.log(JSON.stringify(result));
}finally{db.close();}
