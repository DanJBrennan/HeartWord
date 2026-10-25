/** Apply the seven reviewed-evidence navigation boundaries only to the
 * isolated Meyah Mark 4 project, after a consistent SQLite backup. */
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {backup,DatabaseSync} from "node:sqlite";
import {reconcileSourceRows,type SourceRowBoundary} from "../src/pipeline/ingestion/reconcile-source-rows.js";
import {appliedSourceRowReconciliation,readListeningReview} from "../src/pipeline/ingestion/source-listening-review.js";
import {sourceReviewHashes} from "../src/pipeline/ingestion/source-review.js";

if(process.argv.slice(2).join(" ")!=="--apply")throw Error("Use exactly --apply for isolated source-row reconciliation.");
const checkout=resolve(import.meta.dirname,".."),root=resolve(checkout,"output","mark4-donor-20261024");
if(!root.startsWith(checkout+"\\")&&!root.startsWith(checkout+"/"))throw Error("Source-row target must stay inside this isolated checkout.");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",dbPath=join(root,"db","heartword.sqlite"),backupPath=join(root,"review","heartword.before-source-row-reconciliation.sqlite");
const sourceHash="7947e9038f1cc0e74df68d934b0dbeba271a2ea27481165021ae207b2751b2c6",alignmentHash="c01572ecb92dde388500c31bab5613df600a0b8bb832deb74a8aa35fe8966217";
const verseManifestHash="ad61775feba7e8f8d65f9914cf6d47b1ca58385a728cdbcaf4bddcc85c60ad4c",speechManifestHash="f0e917304d3ed9d7c8076a7f7d50a2b14cbfa6e9ad9ce5c97b3f8cf3b3b7eed7";
const candidate=join(checkout,"docs","production","mark4-meyah-source-review-2026-10-25","source-row-reconciliation-candidate.md"),contentRecord=join(checkout,"docs","production","mark4-meyah-source-review-2026-10-25","targeted-word-review.json");
const boundaries:SourceRowBoundary[]=[
 {afterItemId:"v5",toMs:92729,basis:"Midpoint of Dan-reviewed v5 end 92504 ms and v7 start 92954 ms; printed v6 is unspoken."},
 {afterItemId:"v7",toMs:109580,basis:"Dan-reviewed v7 end; v7-v8 model phrase has approximate internal verse timing."},
 {afterItemId:"v14",toMs:278515,basis:"Midpoint of Dan-reviewed v14 end 278194 ms and first v15 model anchor 278835 ms."},
 {afterItemId:"v33",toMs:651038,basis:"Midpoint of Dan-reviewed v33 end 650718 ms and first v34 model anchor 651358 ms."},
 {afterItemId:"v36",toMs:702410,basis:"Midpoint of Dan-reviewed v36 end 702203 ms and v37 start 702617 ms."},
 {afterItemId:"v38",toMs:755248,basis:"Midpoint of disciples quote end 754976 ms and narrator-only v39 start 755519 ms."},
 {afterItemId:"v39",toMs:776241,basis:"Midpoint of narrated v39 end 775486 ms and first v40 model anchor 776996 ms."}
];
const db=new DatabaseSync(dbPath);
try{
 const prior=appliedSourceRowReconciliation(db,projectId);
 if(prior){console.log(JSON.stringify({status:"already_applied",id:prior.id,alignmentHash:prior.appliedAlignmentHash}));process.exitCode=0;}
 else{
  if(createHash("sha256").update(readFileSync(candidate)).digest("hex")!=="201753de4f31afd60cad8f495e3639351407011eca12f2bd1e070c6b1b220bc5")throw Error("The reviewed source-row candidate changed.");
  const hashes=sourceReviewHashes(db,projectId,root),verse=readListeningReview(db,root,projectId,"verse"),speech=readListeningReview(db,root,projectId,"speech");
  if(hashes.sourceHash!==sourceHash||hashes.alignmentHash!==alignmentHash||verse.manifestHash!==verseManifestHash||speech.manifestHash!==speechManifestHash||verse.verifiedCount!==12||speech.verifiedCount!==13||speech.items.find(i=>i.id==="speech-jesus-v39")?.resolution?.treatment!=="narration")throw Error("The isolated source or reviewed listening evidence changed.");
  const content=JSON.parse(readFileSync(contentRecord,"utf8")) as {sourceHash:string;verseManifestHash:string;wordMatch:{answer:string;reviewedClips:Array<{itemId:string;reviewId:string;clipSha256:string}>};referenceOnlyMarkers:{answer:string;supportingClips:Array<{itemId:string;reviewId:string;clipSha256:string}>}};
  if(content.sourceHash!==sourceHash||content.verseManifestHash!==verseManifestHash||content.wordMatch.answer!=="Yes, the words match"||content.referenceOnlyMarkers.answer!=="Neither marker is spoken")throw Error("The producer's targeted content answers changed.");
  for(const clip of [...content.wordMatch.reviewedClips,...content.referenceOnlyMarkers.supportingClips]){const current=verse.items.find(i=>i.id===clip.itemId)?.current;if(!current?.verified||current.id!==clip.reviewId||current.clipSha256!==clip.clipSha256)throw Error("A content-review listening revision changed: "+clip.itemId);}
  if(existsSync(backupPath))throw Error("A pre-existing source-row backup needs explicit reconciliation before reuse.");
  await backup(db,backupPath);
  const saved=new DatabaseSync(backupPath,{readOnly:true});try{if(saved.prepare("PRAGMA quick_check").get()?.quick_check!=="ok")throw Error("The retained source-row backup failed SQLite integrity check.");}finally{saved.close();}
  const result=reconcileSourceRows(db,root,{projectId,verseManifestHash,speechManifestHash,sourceHash,originalAlignmentHash:alignmentHash,boundaries,reviewerName:"Codex applying Dan's reviewed source evidence",evidence:"Retained Gemini verse-navigation manifest plus Dan's seven word-match confirmations, unspoken reference markers, reviewed speech turns and narrator-only 4:39 decision. Internal verse edges remain approximate. See source-row-reconciliation-candidate.md and targeted-word-review.json at code revision c6f918d.",backupPath});
  console.log(JSON.stringify({status:"applied",id:result.id,beforeRows:result.beforeSegments.length,afterRows:result.afterSegments.length,boundaryRevisions:result.boundaryRevisions.length,sourceHash:result.sourceHash,alignmentHash:result.appliedAlignmentHash,backupPath}));
 }
}finally{db.close();}
