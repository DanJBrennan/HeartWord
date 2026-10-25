/** Rebuild approximate verse-navigation rows around retained listening evidence.
 * Exact speech windows remain separate; this never assigns words or speakers. */
import {randomUUID} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {join} from "node:path";
import type {DatabaseSync} from "node:sqlite";
import {sourceReviewHashes} from "./source-review.js";
import {appliedSourceRowReconciliation,listeningFolder,listeningHash,listeningManifestName,readListeningClip,readListeningReview,sourceRowReconciliationPrefix,type ListeningManifest,type SourceRowReconciliation} from "./source-listening-review.js";

export interface SourceRowBoundary {afterItemId:string;toMs:number;basis:string}
interface OriginalRow {id:string;project_id:string;layer:string;source_path:string;start_ms:number;end_ms:number;speaker_character_id:string|null;verse_ref:string|null;confidence:number|null;created_at:number}
const originalRows=(db:DatabaseSync,projectId:string)=>db.prepare("SELECT * FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(projectId) as unknown as OriginalRow[];

export function reconcileSourceRows(db:DatabaseSync,root:string,input:{
 projectId:string;verseManifestHash:string;speechManifestHash:string;sourceHash:string;originalAlignmentHash:string;
 boundaries:SourceRowBoundary[];reviewerName:string;evidence:string;backupPath:string;
}):SourceRowReconciliation {
 const {projectId,reviewerName,evidence}=input;
 if(!reviewerName?.trim()||!evidence?.trim()||!input.backupPath?.trim()||!existsSync(input.backupPath))throw Error("Named source-row decision, evidence and retained backup are required.");
 const prior=appliedSourceRowReconciliation(db,projectId),hashes=sourceReviewHashes(db,projectId,root);
 if(prior){
  if(prior.sourceHash===hashes.sourceHash&&prior.appliedAlignmentHash===hashes.alignmentHash&&prior.originalAlignmentHash===input.originalAlignmentHash&&prior.manifestHashes.verse===input.verseManifestHash&&prior.manifestHashes.speech===input.speechManifestHash&&prior.reviewerName===reviewerName.trim()&&prior.evidence===evidence.trim()&&prior.backupPath===input.backupPath&&JSON.stringify(prior.boundaryRevisions.map(({afterItemId,toMs,basis})=>({afterItemId,toMs,basis})))===JSON.stringify(input.boundaries))return prior;
  throw Error("A different source-row reconciliation already exists; preserve it and prepare a new source-binding revision.");
 }
 if(hashes.sourceHash!==input.sourceHash||hashes.alignmentHash!==input.originalAlignmentHash)throw Error("Source or provisional alignment changed before reconciliation.");
 const verse=readListeningReview(db,root,projectId,"verse"),speech=readListeningReview(db,root,projectId,"speech");
 if(verse.manifestHash!==input.verseManifestHash||speech.manifestHash!==input.speechManifestHash||verse.sourceHash!==input.sourceHash||speech.sourceHash!==input.sourceHash)throw Error("The prepared listening evidence changed.");
 if(speech.items.some(i=>!i.current?.verified&&!i.resolution))throw Error("Every proposed speech turn needs a current listening decision before source-row reconciliation.");
 const manifest=JSON.parse(readFileSync(join(listeningFolder(root,projectId),listeningManifestName("verse")),"utf8")) as ListeningManifest;
 for(const scope of ["verse","speech"] as const){
  const review=scope==="verse"?verse:speech;
  const saved=JSON.parse(readFileSync(join(listeningFolder(root,projectId),listeningManifestName(scope)),"utf8")) as ListeningManifest;
  for(const item of review.items)if(item.current){
   const original=saved.items.find(i=>i.id===item.id);
   if(!original||item.current.itemHash!==listeningHash(JSON.stringify(original)))throw Error("A saved listening item changed: "+item.id);
   readListeningClip(db,root,projectId,item.id,scope);
  }
 }
 const before=originalRows(db,projectId),sourcePaths=new Set(before.map(r=>r.source_path));
 if(before.length!==manifest.items.length||sourcePaths.size!==1||before[0]?.start_ms!==0||before.some((r,n)=>r.end_ms<=r.start_ms||(n>0&&r.start_ms!==before[n-1]!.end_ms)||r.speaker_character_id!==null))throw Error("Provisional source rows must be contiguous and uncast before replacement.");
 const sourceEnd=before.at(-1)!.end_ms;
 if(sourceEnd<manifest.durationMs||sourceEnd-manifest.durationMs>100)throw Error("The decoded source tail needs explicit review before rebuilding rows.");
 const project=db.prepare("SELECT status FROM projects WHERE id=?").get(projectId) as {status:string}|undefined;
 if(!project||!["not_started","held"].includes(project.status))throw Error("Source-row reconciliation requires an unproduced, held or not-started chapter.");
 if(db.prepare("SELECT 1 FROM scenes WHERE project_id=? LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM audio_segments WHERE project_id=? AND layer<>'original_reading' LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM source_alignment_reviews WHERE project_id=? LIMIT 1").get(projectId)||db.prepare("SELECT 1 FROM review_notes WHERE project_id=? AND source='human' AND subject_type='audio_segment' LIMIT 1").get(projectId))throw Error("Dependent production or human source review exists; reconcile it before replacing rows.");
 for(const table of ["source_alignment_corrections","source_alignment_speaker_attributions","source_alignment_boundary_overrides","source_alignment_segment_splits","source_alignment_segment_merges","source_alignment_editorial_classifications"])if(db.prepare(`SELECT 1 FROM ${table} WHERE project_id=? LIMIT 1`).get(projectId))throw Error("An existing source edit needs explicit remapping before replacement.");
 if(db.prepare("SELECT 1 FROM shot_utterance_bindings b JOIN audio_segments a ON a.id=b.source_audio_segment_id WHERE a.project_id=? LIMIT 1").get(projectId))throw Error("An approved utterance binding prevents source-row replacement.");
 const ids=manifest.items.map(i=>i.id),index=new Map(ids.map((id,n)=>[id,n])),boundaryById=new Map<string,SourceRowBoundary>();
 for(const boundary of input.boundaries){const n=index.get(boundary.afterItemId);if(n===undefined||n===ids.length-1||boundaryById.has(boundary.afterItemId)||!Number.isInteger(boundary.toMs)||!boundary.basis?.trim())throw Error("Each changed boundary needs one named item, millisecond time and evidence.");boundaryById.set(boundary.afterItemId,boundary);}
 const planned: Array<{itemId:string;verseRef:string|null;startMs:number;endMs:number}>=[];
 const revisions:SourceRowReconciliation["boundaryRevisions"]=[];
 let start=0;
 for(const [n,item] of manifest.items.entries()){
  const change=boundaryById.get(item.id),end=n===ids.length-1?sourceEnd:change?.toMs??item.endMs;
  if(end<=start||end>sourceEnd)throw Error("Proposed source rows must remain contiguous and positive.");
  if(change)revisions.push({afterItemId:item.id,fromMs:item.endMs,toMs:end,basis:change.basis.trim()});
  const reviewed=verse.items[n]!.current;
  if(reviewed?.verified&&(reviewed.startMs<start||reviewed.endMs>end))throw Error("A verified verse-archive window would fall outside its proposed row: "+item.id);
  planned.push({itemId:item.id,verseRef:item.id==="chapter-heading"?null:item.verseRef,startMs:start,endMs:end});start=end;
 }
 if(start!==sourceEnd||planned.length!==before.length)throw Error("Proposed rows do not cover the complete original recording.");
 const reviewIds={verse:verse.items.flatMap(i=>i.current?[i.current.id]:[]),speech:speech.items.flatMap(i=>i.current?[i.current.id]:[])};
 const id=randomUUID(),now=Date.now();
 db.exec("BEGIN IMMEDIATE");
 try{
  if(JSON.stringify(originalRows(db,projectId))!==JSON.stringify(before)||JSON.stringify(sourceReviewHashes(db,projectId,root))!==JSON.stringify(hashes))throw Error("Source changed before the row decision was applied.");
  const path=before[0]!.source_path,insert=db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES(?,?,'original_reading',?,?,?,NULL,?,NULL,?)");
  for(const row of planned)insert.run(randomUUID(),projectId,path,row.startMs,row.endMs,row.verseRef,now);
  const remove=db.prepare("DELETE FROM audio_segments WHERE id=?");for(const row of before)remove.run(row.id);
  const after=originalRows(db,projectId),afterHashes=sourceReviewHashes(db,projectId,root);
  if(after.length!==planned.length||afterHashes.sourceHash!==hashes.sourceHash||after.some((r,n)=>r.start_ms!==planned[n]!.startMs||r.end_ms!==planned[n]!.endMs||r.verse_ref!==planned[n]!.verseRef))throw Error("Reconciled rows failed source coverage verification.");
  const record:SourceRowReconciliation={id,projectId,sourceHash:hashes.sourceHash,originalAlignmentHash:hashes.alignmentHash,appliedAlignmentHash:afterHashes.alignmentHash,manifestHashes:{verse:verse.manifestHash,speech:speech.manifestHash},reviewIds,reviewerName:reviewerName.trim(),evidence:evidence.trim(),createdAt:now,backupPath:input.backupPath,beforeSegments:before,afterSegments:after,boundaryRevisions:revisions};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'qc',?,0,?)").run(id,projectId,projectId,sourceRowReconciliationPrefix+JSON.stringify(record),now);
  db.exec("COMMIT");return record;
 }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
}
