/** Reconcile verified listening windows through ingestion's existing split,
 * merge, correction and continuous-speech operations. No provider dispatch. */
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import type {DatabaseSync} from "node:sqlite";
import {recordSegmentSplit} from "./segment-splits.js";
import {recordSegmentMerge} from "./segment-merges.js";
import {confirmContinuousSpeech,readConfirmedSpeechRuns,verseNumbers} from "./continuous-speech.js";
import {recordSourceAlignmentCorrection} from "./source-alignment-corrections.js";
import {sourceReviewHashes} from "./source-review.js";
import {appliedListeningReview,listeningFolder,listeningHash,listeningApplicationPrefix,pcmWindow,readListeningReview,type ListeningApplication,type ListeningManifest,type ListeningResolution} from "./source-listening-review.js";

interface Segment {id:string;project_id:string;layer:string;source_path:string;start_ms:number;end_ms:number;speaker_character_id:string|null;verse_ref:string|null;confidence:number|null;created_at:number}
const segments=(db:DatabaseSync,p:string)=>db.prepare("SELECT * FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(p) as unknown as Segment[];
/** Speaker treatment of retained original material outside verified character
 * windows, not another human listening attestation or a word-alignment claim. */
export function confirmRemainingOriginalNarration(db:DatabaseSync,projectId:string,evidence:string) {
 const runs=readConfirmedSpeechRuns(db,projectId);
 if(!evidence.trim()||!runs.some(r=>r.characterId!==null))throw Error("Apply the verified character windows before deriving retained original narration.");
 const members=new Set(runs.flatMap(r=>r.members.map(m=>m.id)));
 const remaining=segments(db,projectId).filter(s=>s.speaker_character_id===null&&!members.has(s.id)).map(s=>({segment:s,ref:s.verse_ref??(s.end_ms-s.start_ms<=5?runs.find(r=>r.characterId===null&&r.sourcePath===s.source_path&&(r.startMs===s.end_ms||r.endMs===s.start_ms))?.verseRef:null)})).filter(s=>s.ref);
 const ids:string[]=[],ownsTransaction=!db.isTransaction;if(ownsTransaction)db.exec("BEGIN IMMEDIATE");
 try{for(const {segment,ref} of remaining)ids.push(confirmContinuousSpeech(db,{projectId,audioSegmentIds:[segment.id],characterId:null,verseRef:ref!.replace(/^mark /i,"Mark "),internalVerseTiming:"approximate",reviewerName:"Codex — applying Dan's reviewed speech-window decisions",evidence:"Retain unchanged original narration/pause outside the exact verified character windows. Unlabelled rounding remnants of at most 5 ms inherit only an immediately adjoining confirmed narrator run's context. Speaker treatment only; no new human listening or whole-chapter linguistic attestation is claimed. "+evidence,idempotencyKey:`retained-narration:${projectId}:${segment.id}`}).id);if(ownsTransaction)db.exec("COMMIT");return ids;}catch(e){if(ownsTransaction)db.exec("ROLLBACK");throw e;}
}
export function applyListeningReview(db:DatabaseSync,root:string,input:{projectId:string;reviewerName:string;evidence:string;backupPath:string;resolutions:ListeningResolution[]}):ListeningApplication {
 const {projectId,reviewerName,evidence,resolutions}=input;
 if(!reviewerName.trim()||!evidence.trim()||!input.backupPath.trim())throw Error("Named producer authorization, evidence and a retained backup are required.");
 const review=readListeningReview(db,root,projectId),prior=appliedListeningReview(db,projectId,review.manifestHash);
 if(prior){if(prior.reviewerName!==reviewerName||prior.evidence!==evidence||JSON.stringify(prior.resolutions)!==JSON.stringify(resolutions))throw Error("These windows were already applied with different decisions. Reconcile a new revision explicitly.");return prior;}
 if(db.prepare("SELECT status FROM projects WHERE id=?").get(projectId)?.status!=="held")throw Error("Retain the producer's film hold before applying this preparation.");
 if(db.prepare("SELECT 1 FROM scenes WHERE project_id=? LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM audio_segments WHERE project_id=? AND layer<>'original_reading' LIMIT 1").get(projectId))throw Error("This chapter already has downstream production; reconcile dependent bindings before changing source intervals.");
 for(const table of ["source_alignment_corrections","source_alignment_speaker_attributions","source_alignment_boundary_overrides","source_alignment_segment_splits","source_alignment_segment_merges"])if(db.prepare(`SELECT 1 FROM ${table} WHERE project_id=? LIMIT 1`).get(projectId))throw Error("Existing source edits require explicit reconciliation; no earlier decision was replaced.");
 if(db.prepare("SELECT 1 FROM edit_commands WHERE project_id=? AND command_type='confirm_continuous_speech' LIMIT 1").get(projectId))throw Error("Existing confirmed speech must be reconciled explicitly.");
 if(new Set(resolutions.map(r=>r.itemId)).size!==resolutions.length)throw Error("Resolve each retained item once.");
 for(const resolution of resolutions){
  const item=review.items.find(i=>i.id===resolution.itemId);
  if(!item||item.kind==="character"||item.current?.verified||!resolution.evidence.trim())throw Error("A resolution must explicitly address one unresolved non-character item.");
  if(resolution.treatment==="covered"){
   const parent=review.items.find(i=>i.id===resolution.coveredBy);
   if(!parent?.current?.verified||parent.current.startMs>item.startMs||parent.current.endMs<item.endMs)throw Error("A merged fragment must be fully covered by its verified parent window.");
  }else if(resolution.treatment!=="narration")throw Error("Unknown source resolution.");
 }
 for(const item of review.items){if(!item.current?.verified&&!resolutions.some(r=>r.itemId===item.id))throw Error("Unresolved listening item: "+item.id);if(item.kind==="character"&&(!item.current?.verified||!item.characterId))throw Error("Every character quotation needs a verified window and selected canon speaker.");}
 const manifest=JSON.parse(readFileSync(join(listeningFolder(root,projectId),"manifest.json"),"utf8")) as ListeningManifest;
 const pcm=readFileSync(join(root,"assets",manifest.pcmPath));if(listeningHash(pcm)!==manifest.pcmSha256)throw Error("Prepared source audio changed.");
 for(const item of review.items)if(item.current){const original=manifest.items.find(i=>i.id===item.id)!;if(item.current.itemHash!==listeningHash(JSON.stringify(original))||item.current.clipSha256!==listeningHash(pcmWindow(pcm,item.current.startMs,item.current.endMs))||listeningHash(readFileSync(join(root,"assets",item.current.clipPath)))!==item.current.clipSha256)throw Error("Saved listening evidence changed: "+item.id);}
 const characters=review.items.filter(i=>i.kind==="character").sort((a,b)=>a.current!.startMs-b.current!.startMs);
 for(let n=1;n<characters.length;n++)if(characters[n]!.current!.startMs<characters[n-1]!.current!.endMs)throw Error("Reviewed character windows overlap.");
 const before=segments(db,projectId),sourcePaths=new Set(before.map(s=>s.source_path));
 if(!before.length||sourcePaths.size!==1||before.some((s,n)=>s.end_ms<=s.start_ms||(n>0&&s.start_ms<before[n-1]!.end_ms)))throw Error("Source intervals need one non-overlapping original recording.");
 const sourcePath=before[0]!.source_path,id=randomUUID(),now=Date.now(),originalHashes=sourceReviewHashes(db,projectId,root);
 const insert=(start:number,end:number,verse:string|null)=>{const segmentId=randomUUID();db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES(?,?,'original_reading',?,?,?,NULL,?,NULL,?)").run(segmentId,projectId,sourcePath,start,end,verse,now);return segmentId;};
 function exactRange(start:number,end:number,reason:string,verse:string):string {
  for(const boundary of [start,end]){
   const parent=segments(db,projectId).find(s=>s.start_ms<boundary&&s.end_ms>boundary);
   if(parent){const split=recordSegmentSplit(db,{projectId,audioSegmentId:parent.id,splitAtMs:boundary,reviewerName,evidence:reason});db.prepare("UPDATE audio_segments SET verse_ref=? WHERE id IN (?,?)").run(parent.verse_ref,split.firstSegmentId,split.secondSegmentId);}
  }
  let inside=segments(db,projectId).filter(s=>s.start_ms>=start&&s.end_ms<=end);
  if(!inside.length)insert(start,end,verse);
  else {if(inside[0]!.start_ms>start)insert(start,inside[0]!.start_ms,verse);if(inside.at(-1)!.end_ms<end)insert(inside.at(-1)!.end_ms,end,verse);}
  inside=segments(db,projectId).filter(s=>s.start_ms>=start&&s.end_ms<=end);
  let first=inside[0]!.id;
  for(const next of inside.slice(1))first=recordSegmentMerge(db,{projectId,firstSegmentId:first,secondSegmentId:next.id,reviewerName,evidence:reason}).mergedSegmentId;
  return first;
 }
 const windows:ListeningApplication["windows"]=[];
 db.exec("BEGIN IMMEDIATE");
 try {
  const lockedReview=readListeningReview(db,root,projectId);
  if(lockedReview.manifestHash!==review.manifestHash||JSON.stringify(lockedReview.items.map(i=>i.current?.id??null))!==JSON.stringify(review.items.map(i=>i.current?.id??null)))throw Error("A listening decision changed before application; reload the latest saved reviews.");
  if(db.prepare("SELECT status FROM projects WHERE id=?").get(projectId)?.status!=="held"||db.prepare("SELECT 1 FROM scenes WHERE project_id=? LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM audio_segments WHERE project_id=? AND layer<>'original_reading' LIMIT 1").get(projectId))throw Error("The held preparation state changed before source application.");
  if(JSON.stringify(segments(db,projectId))!==JSON.stringify(before)||sourceReviewHashes(db,projectId,root).alignmentHash!==originalHashes.alignmentHash)throw Error("Source changed before application.");
  const work=review.items.filter(i=>i.kind!=="alignment").map(i=>({item:i,start:i.current!.startMs,end:i.current!.endMs,reviewId:i.current!.id,characterId:i.characterId,reason:`Dan's verified listening revision ${i.current!.id}, ${i.verseRef}. ${evidence}`}));
  for(const r of resolutions.filter(r=>r.treatment==="narration")){const item=review.items.find(i=>i.id===r.itemId)!;work.push({item,start:item.startMs,end:item.endMs,reviewId:"producer-decision:"+id,characterId:null,reason:r.evidence+" "+evidence});}
  for(const w of work.sort((a,b)=>a.start-b.start)){
   const priorRefs=before.filter(s=>s.start_ms<w.end&&s.end_ms>w.start).flatMap(s=>verseNumbers(s.verse_ref));
   const contextRef=priorRefs.length?`Mark ${Number(w.item.verseRef.match(/ (\d+):/)![1])}:${Math.min(...priorRefs)}${Math.max(...priorRefs)>Math.min(...priorRefs)?"-"+Math.max(...priorRefs):""}`:w.item.verseRef;
   const verse=w.characterId?w.item.verseRef:contextRef;
   const segmentId=exactRange(w.start,w.end,w.reason,verse);
   // Character text is precisely the reviewed quote. Narrated windows retain
   // the original broader verse context; a thought window is not a verse aligner.
   db.prepare("UPDATE audio_segments SET verse_ref=?,confidence=NULL WHERE id=?").run(verse,segmentId);
   windows.push({itemId:w.item.id,reviewId:w.reviewId,segmentId,runId:"",startMs:w.start,endMs:w.end});
  }
  for(const window of windows){
   const item=review.items.find(i=>i.id===window.itemId)!,row=segments(db,projectId).find(s=>s.id===window.segmentId)!;
   const reason=`Applied exact window ${window.startMs}–${window.endMs} ms from ${window.reviewId}. ${resolutions.find(r=>r.itemId===item.id)?.evidence??""} ${evidence}`;
   if(item.kind==="character")recordSourceAlignmentCorrection(db,{projectId,audioSegmentId:row.id,verseRef:item.verseRef,assignedText:item.textHatam,reviewerName,evidence:reason});
   window.runId=confirmContinuousSpeech(db,{projectId,audioSegmentIds:[row.id],characterId:item.kind==="character"?item.characterId:null,verseRef:row.verse_ref!,internalVerseTiming:"approximate",reviewerName,evidence:reason,idempotencyKey:`listening-${id}-${item.id}`}).id;
  }
  confirmRemainingOriginalNarration(db,projectId,evidence);
  const after=segments(db,projectId);
  if(after.some((s,n)=>n>0&&s.start_ms<after[n-1]!.end_ms))throw Error("Applied source intervals overlap.");
  for(const s of before){let at=s.start_ms;for(const a of after){if(a.end_ms<=at)continue;if(a.start_ms>at)break;at=Math.max(at,a.end_ms);if(at>=s.end_ms)break;}if(at<s.end_ms)throw Error("A retained source interval would be lost.");}
  const finalHashes=sourceReviewHashes(db,projectId,root);
  if(finalHashes.sourceHash!==review.sourceHash)throw Error("Original source bytes changed.");
  const application:ListeningApplication={id,manifestHash:review.manifestHash,sourceHash:review.sourceHash,originalAlignmentHash:originalHashes.alignmentHash,appliedAlignmentHash:finalHashes.alignmentHash,reviewerName,evidence,createdAt:now,reviewIds:review.items.flatMap(i=>i.current?[i.current.id]:[]),resolutions,windows,beforeSegments:before,afterSegments:after,backupPath:input.backupPath};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'qc',?,0,?)").run(id,projectId,projectId,listeningApplicationPrefix+JSON.stringify(application),now);
  db.exec("COMMIT");return application;
 }catch(e){db.exec("ROLLBACK");throw e;}
}
