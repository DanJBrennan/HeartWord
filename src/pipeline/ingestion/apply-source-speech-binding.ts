/** Apply producer-approved, exact character turns after verse-row reconciliation.
 * This is an ingestion revision of one source map, not a new pipeline stage. */
import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import type {DatabaseSync} from "node:sqlite";
import {confirmContinuousSpeech} from "./continuous-speech.js";
import {sourceReviewHashes} from "./source-review.js";
import {appliedSourceRowReconciliation,appliedSourceSpeechBinding,readListeningClip,readListeningReview,sourceSpeechBindingPrefix,type SourceSpeechBinding} from "./source-listening-review.js";

type Row={id:string;project_id:string;layer:string;source_path:string;start_ms:number;end_ms:number;speaker_character_id:string|null;verse_ref:string|null;confidence:number|null;created_at:number};
export interface SpeechBindingWindow {itemId:string;reviewId:string;startMs:number;endMs:number;characterId:string|null;treatment:"character"|"original"}
const rows=(db:DatabaseSync,id:string)=>db.prepare("SELECT * FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(id) as unknown as Row[];
const verseRange=(first:string,last:string)=>{
 const a=first.match(/^(.+ \d+):(\d+)(?:-\d+)?$/),b=last.match(/^(.+ \d+):\d+(?:-(\d+))?$/);
 if(!a||!b||a[1]!==b[1])throw Error("Speech turn has an invalid chapter verse range.");
 const end=Number(b[2]??last.match(/:(\d+)/)![1]);
 return `${a[1]}:${a[2]}${end===Number(a[2])?"":"-"+end}`;
};

export function applySourceSpeechBinding(db:DatabaseSync,root:string,input:{
 projectId:string;sourceHash:string;previousAlignmentHash:string;verseManifestHash:string;speechManifestHash:string;
 windows:SpeechBindingWindow[];expectedRowCount:number;reviewerName:string;evidence:string;backupPath:string;
}):SourceSpeechBinding {
 const {projectId}=input;
 if(!input.reviewerName?.trim()||!input.evidence?.trim()||!input.backupPath?.trim()||!existsSync(input.backupPath))throw Error("Named approval evidence and a retained database backup are required.");
 if(appliedSourceSpeechBinding(db,projectId))throw Error("A source speech binding already exists; preserve it and plan a separate revision.");
 const reconciliation=appliedSourceRowReconciliation(db,projectId),hashes=sourceReviewHashes(db,projectId,root);
 if(!reconciliation||hashes.sourceHash!==input.sourceHash||hashes.alignmentHash!==input.previousAlignmentHash||reconciliation.appliedAlignmentHash!==hashes.alignmentHash)throw Error("Approved 40-row source reconciliation changed.");
 const verse=readListeningReview(db,root,projectId,"verse"),speech=readListeningReview(db,root,projectId,"speech");
 if(verse.manifestHash!==input.verseManifestHash||speech.manifestHash!==input.speechManifestHash||speech.items.length!==input.windows.length)throw Error("Retained listening manifest or speech-turn count changed.");
 const sorted=[...input.windows].sort((a,b)=>a.startMs-b.startMs);
 const itemById=new Map(speech.items.map(item=>[item.id,item]));
 if(new Set(sorted.map(w=>w.itemId)).size!==speech.items.length||sorted.some(w=>!itemById.has(w.itemId)))throw Error("A speech turn is missing or duplicated.");
 for(const [index,w] of sorted.entries()){
  const item=itemById.get(w.itemId)!;
  if(!item.current?.verified||item.current.id!==w.reviewId||item.current.startMs!==w.startMs||item.current.endMs!==w.endMs||!Number.isInteger(w.startMs)||!Number.isInteger(w.endMs)||w.startMs<0||w.endMs<=w.startMs||(index>0&&sorted[index-1]!.endMs>w.startMs)||w.endMs>speech.durationMs)throw Error("Speech turn differs from its current exact listening review: "+w.itemId);
  if((w.treatment==="character")!==(w.characterId!==null))throw Error("Original performance and character voice treatments must be explicit.");
  readListeningClip(db,root,projectId,w.itemId,"speech");
 }
 const before=rows(db,projectId);
 const sourceEnd=before.at(-1)?.end_ms;
 if(before.length!==(reconciliation.afterSegments as unknown[]).length||before[0]?.start_ms!==0||sourceEnd===undefined||sourceEnd<speech.durationMs||sourceEnd-speech.durationMs>100||before.some((r,i)=>r.end_ms<=r.start_ms||(i>0&&r.start_ms!==before[i-1]!.end_ms)||r.speaker_character_id!==null)||db.prepare("SELECT 1 FROM audio_segments WHERE project_id=? AND layer<>'original_reading' LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM source_alignment_speaker_attributions WHERE project_id=? LIMIT 1").get(projectId))throw Error("Expected the reconciled uncast contiguous source rows and no dependent cast audio.");
 if(!db.prepare("SELECT 1 FROM scenes WHERE project_id=? LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=? LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM shot_utterance_bindings b JOIN audio_segments a ON a.id=b.source_audio_segment_id WHERE a.project_id=? LIMIT 1").get(projectId))throw Error("Stage-2 scenes are required; target shots and utterance bindings must still be absent.");
 for(const table of ["source_alignment_corrections","source_alignment_boundary_overrides","source_alignment_segment_splits","source_alignment_segment_merges","source_alignment_editorial_classifications","composite_audio_source_map"]){
  const query=table==="composite_audio_source_map"?"SELECT 1 FROM composite_audio_source_map c JOIN audio_segments a ON a.id=c.original_segment_id WHERE a.project_id=? LIMIT 1":`SELECT 1 FROM ${table} WHERE project_id=? LIMIT 1`;
  if(db.prepare(query).get(projectId))throw Error("Existing source edit or composite dependency needs explicit remapping: "+table);
 }
 const boundaries=new Set<number>();for(const w of sorted)if(w.characterId){boundaries.add(w.startMs);boundaries.add(w.endMs);}
 const planned=before.flatMap(original=>{
  const edges=[original.start_ms,...[...boundaries].filter(t=>t>original.start_ms&&t<original.end_ms).sort((a,b)=>a-b),original.end_ms];
  return edges.slice(1).map((end,i)=>({source_path:original.source_path,start_ms:edges[i]!,end_ms:end,verse_ref:original.verse_ref,confidence:original.confidence,characterId:sorted.find(w=>w.characterId&&w.startMs<=edges[i]!&&w.endMs>=end)?.characterId??null}));
 });
 if(!Number.isInteger(input.expectedRowCount)||planned.length!==input.expectedRowCount||planned.some((r,i)=>r.end_ms<=r.start_ms||(i>0&&r.start_ms!==planned[i-1]!.end_ms))||planned[0]!.start_ms!==0||planned.at(-1)!.end_ms!==sourceEnd)throw Error("Speech projection must have the approved number of contiguous rows covering the recording.");
 for(const w of sorted.filter(w=>w.characterId)){
  const covered=planned.filter(r=>r.start_ms>=w.startMs&&r.end_ms<=w.endMs);
  if(!covered.length||covered[0]!.start_ms!==w.startMs||covered.at(-1)!.end_ms!==w.endMs||covered.some(r=>r.characterId!==w.characterId))throw Error("Character quote does not align exactly with projected rows: "+w.itemId);
 }
 const id=randomUUID(),now=Date.now();db.exec("BEGIN IMMEDIATE");
 try{
  if(JSON.stringify(rows(db,projectId))!==JSON.stringify(before)||JSON.stringify(sourceReviewHashes(db,projectId,root))!==JSON.stringify(hashes))throw Error("Source changed before speech binding was applied.");
  const insert=db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES(?,?,'original_reading',?,?,?,NULL,?,?,?)");
  for(const row of planned)insert.run(randomUUID(),projectId,row.source_path,row.start_ms,row.end_ms,row.verse_ref,row.confidence,now);
  const remove=db.prepare("DELETE FROM audio_segments WHERE id=?");for(const row of before)remove.run(row.id);
  const projected=rows(db,projectId),runIds:string[]=[];
  const actor=sorted.filter(w=>w.characterId);
  const groups:Array<typeof actor>=[];
  for(const w of actor){const prior=groups.at(-1);if(prior&&prior.at(-1)!.endMs===w.startMs&&prior.at(-1)!.characterId===w.characterId)prior.push(w);else groups.push([w]);}
  for(const group of groups){
   const first=group[0]!,last=group.at(-1)!,segments=projected.filter(r=>r.start_ms>=first.startMs&&r.end_ms<=last.endMs);
   const run=confirmContinuousSpeech(db,{projectId,audioSegmentIds:segments.map(r=>r.id),characterId:first.characterId,verseRef:verseRange(itemById.get(first.itemId)!.verseRef,itemById.get(last.itemId)!.verseRef),internalVerseTiming:"approximate",reviewerName:input.reviewerName,evidence:`Producer-approved exact source-listening revisions ${group.map(w=>w.reviewId).join(", ")}. ${input.evidence}`,idempotencyKey:`speech-binding:${id}:${group.map(w=>w.itemId).join(":")}`});
   runIds.push(run.id);
  }
  const after=rows(db,projectId),afterHashes=sourceReviewHashes(db,projectId,root);
  if(afterHashes.sourceHash!==hashes.sourceHash||after.length!==planned.length||after.some((r,i)=>r.start_ms!==planned[i]!.start_ms||r.end_ms!==planned[i]!.end_ms||r.verse_ref!==planned[i]!.verse_ref||r.speaker_character_id!==planned[i]!.characterId))throw Error("Applied speaker rows differ from the approved projection.");
  const record:SourceSpeechBinding={id,projectId,reconciliationId:reconciliation.id,sourceHash:hashes.sourceHash,previousAlignmentHash:hashes.alignmentHash,appliedAlignmentHash:afterHashes.alignmentHash,manifestHashes:{verse:verse.manifestHash,speech:speech.manifestHash},reviewIds:speech.items.map(i=>i.current!.id),reviewerName:input.reviewerName.trim(),evidence:input.evidence.trim(),createdAt:now,backupPath:input.backupPath,beforeSegments:before,afterSegments:after,windows:sorted,runIds};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'qc',?,0,?)").run(id,projectId,projectId,sourceSpeechBindingPrefix+JSON.stringify(record),now);
  db.exec("COMMIT");return record;
 }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
}
