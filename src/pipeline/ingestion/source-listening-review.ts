import {createHash,randomUUID} from "node:crypto";
import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,isAbsolute,join,relative,resolve,sep} from "node:path";
import type {DatabaseSync} from "node:sqlite";
import {sourceReviewHashes} from "./source-review.js";

export interface ListeningItem {
 id:string;kind:"character"|"narration"|"alignment";verseRef:string;title:string;
 textHatam:string;englishContext:string;speakerName:string;characterId:string|null;
 voiceName:string|null;startMs:number;endMs:number;initialClipPath:string;contextClipPath:string;
 warnings:string[];
 timingConfidence?:number|null;speakerConfidence?:number|null;geminiMatchConfidence?:number|null;
 geminiAnchorStartMs?:number|null;geminiAnchorEndMs?:number|null;
}
export interface ListeningManifest {
 version:1;projectId:string;title:string;sourceHash:string;alignmentHash:string;
 originalAudioPath:string;originalAudioSha256:string;pcmPath:string;pcmSha256:string;
 durationMs:number;sampleRate:number;channels:number;items:ListeningItem[];
}
export type ListeningScope="verse"|"speech";
export const listeningManifestName=(scope:ListeningScope)=>scope==="speech"?"speech-manifest.json":"manifest.json";
export interface ListeningRevision {
 id:string;itemId:string;manifestHash:string;sourceHash:string;alignmentHash:string;
 itemHash:string;requestId:string;reviewerName:string;note:string;startMs:number;endMs:number;
 verified:boolean;createdAt:number;clipPath:string;clipSha256:string;previousRevision:string|null;
 speakerLabel?:string;
}
export interface ListeningResolution {itemId:string;treatment:"covered"|"narration";coveredBy?:string;evidence:string}
export interface ListeningNarrationDecision {
 id:string;itemId:string;manifestHash:string;sourceHash:string;alignmentHash:string;
 reviewId:string;reviewerName:string;evidence:string;createdAt:number;treatment:"narration";
}
export const listeningNarrationDecisionPrefix="Source listening narration decision v1\n";
export interface ListeningApplication {
 id:string;manifestHash:string;sourceHash:string;originalAlignmentHash:string;appliedAlignmentHash:string;
 reviewerName:string;evidence:string;createdAt:number;reviewIds:string[];resolutions:ListeningResolution[];
 windows:Array<{itemId:string;reviewId:string;segmentId:string;runId:string;startMs:number;endMs:number}>;
 beforeSegments:unknown[];afterSegments:unknown[];backupPath:string;
}
export const listeningApplicationPrefix="Source listening application v1\n";
export interface SourceRowReconciliation {
 id:string;projectId:string;sourceHash:string;originalAlignmentHash:string;appliedAlignmentHash:string;
 manifestHashes:{verse:string;speech:string};reviewIds:{verse:string[];speech:string[]};
 reviewerName:string;evidence:string;createdAt:number;backupPath:string;
 beforeSegments:unknown[];afterSegments:unknown[];boundaryRevisions:Array<{afterItemId:string;fromMs:number;toMs:number;basis:string}>;
}
export const sourceRowReconciliationPrefix="Source row reconciliation v1\n";
export interface ListeningReconciliationRevision {
 id:string;reconciliationId:string;manifestHash:string;sourceHash:string;appliedAlignmentHash:string;
 scope:ListeningScope;itemId:string;fromReviewId:string|null;toReviewId:string;createdAt:number;
}
export const listeningReconciliationRevisionPrefix="Source listening reconciliation revision v1\n";
function reconciliationRevisions(db:DatabaseSync,projectId:string,reconciliationId:string):ListeningReconciliationRevision[] {
 return db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='project' AND subject_id=? AND source='qc' AND note LIKE ? ORDER BY created_at,rowid").all(projectId,projectId,listeningReconciliationRevisionPrefix+"%")
  .map(row=>JSON.parse(String(row.note).slice(listeningReconciliationRevisionPrefix.length)) as ListeningReconciliationRevision)
  .filter(row=>row.reconciliationId===reconciliationId);
}
export function appliedSourceRowReconciliation(db:DatabaseSync,projectId:string):SourceRowReconciliation|null {
 const rows=db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='project' AND subject_id=? AND source='qc' AND note LIKE ? ORDER BY created_at,rowid").all(projectId,projectId,sourceRowReconciliationPrefix+"%");
 return rows.map(r=>JSON.parse(String(r.note).slice(sourceRowReconciliationPrefix.length)) as SourceRowReconciliation).at(-1)??null;
}
export function appliedListeningReview(db:DatabaseSync,projectId:string,manifestHash:string):ListeningApplication|null {
 const rows=db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='project' AND subject_id=? AND source='qc' AND note LIKE ? ORDER BY created_at,rowid").all(projectId,projectId,listeningApplicationPrefix+"%");
 return rows.map(r=>JSON.parse(String(r.note).slice(listeningApplicationPrefix.length)) as ListeningApplication).filter(r=>r.manifestHash===manifestHash).at(-1)??null;
}
const prefix="Source listening review v1\n";
export const listeningHash=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
export function listeningFolder(root:string,projectId:string) {
 if(!/^[a-zA-Z0-9-]{1,128}$/.test(projectId))throw Error("Invalid chapter identifier.");
 return join(root,"assets","source-listening-review",projectId);
}
function assetPath(root:string,path:string) {
 const base=resolve(root,"assets"),full=resolve(base,path);
 if(!path||isAbsolute(relative(base,full))||relative(base,full).startsWith(".."+sep)||relative(base,full)===".."||full===base)throw Error("Review asset is outside the asset directory.");
 return full;
}
export function pcmWaveInfo(wav:Buffer) {
 if(wav.toString("ascii",0,4)!=="RIFF"||wav.toString("ascii",8,12)!=="WAVE")throw Error("Review audio must be a PCM WAV.");
 let sampleRate=0,channels=0,blockAlign=0,dataOffset=0,dataBytes=0,format=0,bits=0;
 for(let at=12;at+8<=wav.length;){const id=wav.toString("ascii",at,at+4),size=wav.readUInt32LE(at+4),start=at+8;
  if(start+size>wav.length)throw Error("Review WAV is truncated.");
  if(id==="fmt "){if(size<16)throw Error("Invalid WAV format.");format=wav.readUInt16LE(start);channels=wav.readUInt16LE(start+2);sampleRate=wav.readUInt32LE(start+4);blockAlign=wav.readUInt16LE(start+12);bits=wav.readUInt16LE(start+14);}
  if(id==="data"){dataOffset=start;dataBytes=size;}
  at=start+size+(size%2);
 }
 if(format!==1||bits!==16||![1,2].includes(channels)||!sampleRate||sampleRate%1000!==0||blockAlign!==channels*2||!dataOffset||dataBytes%blockAlign)throw Error("Review WAV must be 16-bit PCM at a sample rate supporting exact milliseconds.");
 return {sampleRate,channels,blockAlign,dataOffset,dataBytes,frames:dataBytes/blockAlign,durationMs:dataBytes/blockAlign/sampleRate*1000};
}
export function pcmWindow(wav:Buffer,startMs:number,endMs:number) {
 const info=pcmWaveInfo(wav);
 if(!Number.isInteger(startMs)||!Number.isInteger(endMs)||startMs<0||endMs<=startMs||endMs>info.durationMs+.001)throw Error("Use valid start/end times in 0.001-second increments.");
 const first=Math.round(startMs/1000*info.sampleRate),last=Math.round(endMs/1000*info.sampleRate);
 const data=wav.subarray(info.dataOffset+first*info.blockAlign,info.dataOffset+last*info.blockAlign);
 const h=Buffer.alloc(44);h.write("RIFF");h.writeUInt32LE(36+data.length,4);h.write("WAVEfmt ",8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(info.channels,22);h.writeUInt32LE(info.sampleRate,24);h.writeUInt32LE(info.sampleRate*info.blockAlign,28);h.writeUInt16LE(info.blockAlign,32);h.writeUInt16LE(16,34);h.write("data",36);h.writeUInt32LE(data.length,40);
 return Buffer.concat([h,data]);
}
function prepared(db:DatabaseSync,root:string,projectId:string,scope:ListeningScope="verse") {
 if(!db.prepare("SELECT id FROM projects WHERE id=?").get(projectId))throw Error("Chapter not found.");
 if(scope!=="verse"&&scope!=="speech")throw Error("Unknown listening review scope.");
 const path=join(listeningFolder(root,projectId),listeningManifestName(scope));
 if(!existsSync(path))throw Error("Source listening clips have not been prepared for this chapter.");
 const bytes=readFileSync(path),manifest=JSON.parse(bytes.toString("utf8")) as ListeningManifest;
 if(manifest.version!==1||manifest.projectId!==projectId||!Array.isArray(manifest.items)||!manifest.items.length)throw Error("Invalid prepared source review.");
 const current=sourceReviewHashes(db,projectId,root),manifestHash=listeningHash(bytes),application=appliedListeningReview(db,projectId,manifestHash),record=appliedSourceRowReconciliation(db,projectId);
 const reconciliation=record&&record.sourceHash===current.sourceHash&&record.originalAlignmentHash===manifest.alignmentHash&&record.appliedAlignmentHash===current.alignmentHash&&record.manifestHashes[scope]===manifestHash?record:null;
 if(current.sourceHash!==manifest.sourceHash||(current.alignmentHash!==manifest.alignmentHash&&(!application||application.sourceHash!==current.sourceHash||application.originalAlignmentHash!==manifest.alignmentHash||application.appliedAlignmentHash!==current.alignmentHash)&&!reconciliation))throw Error("Source or alignment changed. Preserve these reviews and prepare a reconciled listening set.");
 if(application){const latest=revisions(db,projectId).filter(r=>r.manifestHash===manifestHash),ids=manifest.items.flatMap(i=>{const r=latest.filter(r=>r.itemId===i.id).at(-1);return r?[r.id]:[];});if(JSON.stringify(ids.sort())!==JSON.stringify([...application.reviewIds].sort()))throw Error("Applied review decisions changed; reconcile the source bindings before continuing.");}
 if(reconciliation){
  const history=revisions(db,projectId).filter(r=>r.manifestHash===manifestHash),expected=new Map<string,string>();
  for(const id of reconciliation.reviewIds[scope]){const r=history.find(row=>row.id===id);if(!r||!manifest.items.some(i=>i.id===r.itemId)||expected.has(r.itemId))throw Error("Reconciled listening history is invalid.");expected.set(r.itemId,id);}
  for(const bridge of reconciliationRevisions(db,projectId,reconciliation.id).filter(r=>r.scope===scope)){
   const next=history.find(r=>r.id===bridge.toReviewId);
   if(bridge.manifestHash!==manifestHash||bridge.sourceHash!==current.sourceHash||bridge.appliedAlignmentHash!==current.alignmentHash||!next||next.itemId!==bridge.itemId||next.previousRevision!==bridge.fromReviewId||(expected.get(bridge.itemId)??null)!==bridge.fromReviewId||!manifest.items.some(i=>i.id===bridge.itemId))throw Error("A post-reconciliation listening revision is invalid.");
   expected.set(bridge.itemId,bridge.toReviewId);
  }
  const latest=new Map<string,string>();for(const r of history)latest.set(r.itemId,r.id);
  if(JSON.stringify([...latest].sort())!==JSON.stringify([...expected].sort()))throw Error("A listening revision changed after source-row reconciliation; prepare a new source-binding revision.");
 }
 return {manifest,manifestHash,application,reconciliation};
}
function revisions(db:DatabaseSync,projectId:string):ListeningRevision[] {
 return db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='project' AND subject_id=? AND source='human' AND note LIKE ? ORDER BY created_at,rowid").all(projectId,projectId,prefix+"%").map(row=>{try{return JSON.parse(String(row.note).slice(prefix.length)) as ListeningRevision;}catch{throw Error("A saved listening review is unreadable; inspect its retained record.");}});
}
function narrationDecisions(db:DatabaseSync,projectId:string):ListeningNarrationDecision[] {
 return db.prepare("SELECT note FROM review_notes WHERE project_id=? AND subject_type='project' AND subject_id=? AND source='qc' AND note LIKE ? ORDER BY created_at,rowid").all(projectId,projectId,listeningNarrationDecisionPrefix+"%").map(row=>JSON.parse(String(row.note).slice(listeningNarrationDecisionPrefix.length)) as ListeningNarrationDecision);
}
export function readListeningReview(db:DatabaseSync,root:string,projectId:string,scope:ListeningScope="verse") {
 const {manifest,manifestHash,application,reconciliation}=prepared(db,root,projectId,scope),history=revisions(db,projectId),decisions=narrationDecisions(db,projectId);
 const rows=reconciliation&&scope==="verse"?reconciliation.afterSegments as Array<{start_ms:number;end_ms:number;verse_ref:string|null}>:null;
 if(rows&&rows.length!==manifest.items.length)throw Error("Reconciled source-row history does not match the retained verse archive.");
 const items=manifest.items.map((item,index)=>{const records=history.filter(r=>r.itemId===item.id&&r.manifestHash===manifestHash);
  const current=records.at(-1)??null;
  const decision=decisions.filter(d=>d.itemId===item.id&&d.manifestHash===manifestHash&&d.reviewId===current?.id).at(-1);
  const row=rows?.[index];
  return {...item,current,sourceRow:row?{startMs:row.start_ms,endMs:row.end_ms,verseRef:row.verse_ref}:null,resolution:application?.resolutions.find(r=>r.itemId===item.id)??(decision?{itemId:item.id,treatment:"narration" as const,evidence:decision.evidence}:null),history:records.map(r=>({id:r.id,startMs:r.startMs,endMs:r.endMs,verified:r.verified,reviewerName:r.reviewerName,speakerLabel:r.speakerLabel??null,createdAt:r.createdAt})),staleHistory:history.some(r=>r.itemId===item.id&&r.manifestHash!==manifestHash)};
 });
 return {projectId,title:manifest.title,scope,manifestHash,sourceHash:manifest.sourceHash,durationMs:manifest.durationMs,sampleRate:manifest.sampleRate,pcmUrl:"/media/"+manifest.pcmPath.split(/[\\/]/).map(encodeURIComponent).join("/"),items,verifiedCount:items.filter(i=>i.current?.verified).length,resolvedCount:items.filter(i=>i.current?.verified||i.resolution).length,application:application?{id:application.id,createdAt:application.createdAt,reviewerName:application.reviewerName,evidence:application.evidence}:null,reconciliation:reconciliation?{id:reconciliation.id,createdAt:reconciliation.createdAt,reviewerName:reconciliation.reviewerName,evidence:reconciliation.evidence}:null};
}
/** Record a producer's explicit content correction without impersonating a
 * listening verification or changing the immutable prepared manifest. */
export function recordListeningNarrationDecision(db:DatabaseSync,root:string,projectId:string,input:{
 itemId:string;manifestHash:string;reviewId:string;reviewerName:string;evidence:string;scope?:ListeningScope;
}):ListeningNarrationDecision {
 if(!input?.reviewerName?.trim()||!input.evidence?.trim()||!input.itemId||!input.reviewId)throw Error("Named narration decision and exact review evidence are required.");
 const {manifest,manifestHash,application,reconciliation}=prepared(db,root,projectId,input.scope??"verse");
 if(application||reconciliation||manifestHash!==input.manifestHash||!manifest.items.some(i=>i.id===input.itemId))throw Error("Narration decision does not match the current prepared review.");
 db.exec("BEGIN IMMEDIATE");
 try{
  const review=revisions(db,projectId).filter(r=>r.itemId===input.itemId&&r.manifestHash===manifestHash).at(-1);
  if(!review?.verified||review.id!==input.reviewId)throw Error("Narration decision needs the current verified listening revision.");
  const earlier=narrationDecisions(db,projectId).filter(d=>d.itemId===input.itemId&&d.manifestHash===manifestHash).at(-1);
  if(earlier?.reviewId===review.id){if(earlier.reviewerName===input.reviewerName.trim()&&earlier.evidence===input.evidence.trim()){db.exec("COMMIT");return earlier;}throw Error("A different narration decision already exists for this listening revision; reconcile it explicitly.");}
  const decision:ListeningNarrationDecision={id:randomUUID(),itemId:input.itemId,manifestHash,sourceHash:manifest.sourceHash,alignmentHash:manifest.alignmentHash,reviewId:review.id,reviewerName:input.reviewerName.trim(),evidence:input.evidence.trim(),createdAt:Date.now(),treatment:"narration"};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'qc',?,0,?)").run(decision.id,projectId,projectId,listeningNarrationDecisionPrefix+JSON.stringify(decision),decision.createdAt);
  db.exec("COMMIT");return decision;
 }catch(error){if(db.isTransaction)db.exec("ROLLBACK");throw error;}
}
export function saveListeningReview(db:DatabaseSync,root:string,projectId:string,itemId:string,input:{
 startMs:number;endMs:number;action:"draft"|"verify";reviewerName:string;note:string;speakerLabel?:string;
 baseRevision:string|null;requestId:string;manifestHash:string;attestation?:string;scope?:ListeningScope;
}) {
 if(!input||!["draft","verify"].includes(input.action)||!input.reviewerName?.trim()||input.reviewerName.length>160||typeof input.note!=="string"||input.note.length>8000||(input.speakerLabel!==undefined&&(typeof input.speakerLabel!=="string"||input.speakerLabel.length>160))||!/^[a-zA-Z0-9-]{1,100}$/.test(input.requestId??"")||!(input.baseRevision===null||typeof input.baseRevision==="string"))throw Error("Reviewer, valid request and draft/verification action are required.");
 if(input.action==="verify"&&input.attestation!=="confirm")throw Error("Verify explicitly confirms that you listened to this exact window.");
 const {manifest,manifestHash,application,reconciliation}=prepared(db,root,projectId,input.scope??"verse"),item=manifest.items.find(i=>i.id===itemId);
 if(application)throw Error("These reviewed windows have been applied; prepare a source-binding revision before changing a retained review; history is read-only.");
 if(!item||input.manifestHash!==manifestHash)throw Error("The prepared item changed. Reload before saving.");
 if(!Number.isInteger(input.startMs)||!Number.isInteger(input.endMs)||input.startMs<0||input.endMs<=input.startMs||input.endMs>manifest.durationMs)throw Error("Start/end must be valid chapter times in 0.001-second increments.");
 const wav=readFileSync(assetPath(root,manifest.pcmPath));
 if(listeningHash(wav)!==manifest.pcmSha256)throw Error("Prepared listening audio changed; no review was saved.");
 const itemHash=listeningHash(JSON.stringify(item));
 db.exec("BEGIN IMMEDIATE");
 try {
  const all=revisions(db,projectId),duplicate=all.find(r=>r.requestId===input.requestId);
  if(duplicate){if(duplicate.itemId!==itemId||duplicate.manifestHash!==manifestHash||duplicate.startMs!==input.startMs||duplicate.endMs!==input.endMs||duplicate.verified!==(input.action==="verify")||duplicate.reviewerName!==input.reviewerName.trim()||duplicate.note!==input.note.trim()||(duplicate.speakerLabel??"")!==(input.speakerLabel?.trim()??""))throw Error("This request identifier belongs to a different review.");if(all.filter(r=>r.itemId===itemId&&r.manifestHash===manifestHash).at(-1)?.id!==duplicate.id)throw Error("Another review was saved after this request. Reload before continuing.");db.exec("COMMIT");return duplicate;}
  const previous=all.filter(r=>r.itemId===itemId&&r.manifestHash===manifestHash).at(-1)??null;
  if((previous?.id??null)!==input.baseRevision)throw Error("Another review was saved for this clip. Reload before saving your changes.");
  const id=randomUUID(),clipPath=relative(join(root,"assets"),join(listeningFolder(root,projectId),"reviews",id+".wav")).replaceAll("\\","/");
  const bytes=pcmWindow(wav,input.startMs,input.endMs),full=assetPath(root,clipPath);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,bytes,{flag:"wx"});
  const record:ListeningRevision={id,itemId,manifestHash,sourceHash:manifest.sourceHash,alignmentHash:manifest.alignmentHash,itemHash,requestId:input.requestId,reviewerName:input.reviewerName.trim(),note:input.note.trim(),startMs:input.startMs,endMs:input.endMs,verified:input.action==="verify",createdAt:Date.now(),clipPath,clipSha256:listeningHash(bytes),previousRevision:previous?.id??null,...(input.speakerLabel!==undefined?{speakerLabel:input.speakerLabel.trim()}:{})};
  db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'human',?,0,?)").run(id,projectId,projectId,prefix+JSON.stringify(record),record.createdAt);
  if(reconciliation){
   const bridge:ListeningReconciliationRevision={id:randomUUID(),reconciliationId:reconciliation.id,manifestHash,sourceHash:manifest.sourceHash,appliedAlignmentHash:reconciliation.appliedAlignmentHash,scope:input.scope??"verse",itemId,fromReviewId:previous?.id??null,toReviewId:id,createdAt:record.createdAt};
   db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'project',?,'qc',?,0,?)").run(bridge.id,projectId,projectId,listeningReconciliationRevisionPrefix+JSON.stringify(bridge),bridge.createdAt);
  }
  db.exec("COMMIT");return record;
 } catch(e){db.exec("ROLLBACK");throw e;}
}
export function readListeningClip(db:DatabaseSync,root:string,projectId:string,itemId:string,scope:ListeningScope="verse") {
 const {manifest,manifestHash}=prepared(db,root,projectId,scope),item=manifest.items.find(i=>i.id===itemId);if(!item)throw Error("Clip not found.");
 const current=revisions(db,projectId).filter(r=>r.itemId===itemId&&r.manifestHash===manifestHash).at(-1);
 const path=current?.clipPath??item.initialClipPath,bytes=readFileSync(assetPath(root,path));
 if(current&&listeningHash(bytes)!==current.clipSha256)throw Error("The saved clip changed.");
 return bytes;
}
