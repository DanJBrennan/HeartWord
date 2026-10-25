/** Fixed-root executor for Dan's approved Mark 4 → Meyah 54-row source map.
 * Usage: tsx this-file.ts <database-path> <retained-backup-path> */
import {createHash} from "node:crypto";
import {realpathSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=realpathSync(join(checkout,"output","mark4-donor-20261024"));
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const databasePath=realpathSync(resolve(process.argv[2]??"")),backupPath=realpathSync(resolve(process.argv[3]??""));
const within=(path:string)=>path.startsWith(root+"\\")||path.startsWith(root+"/");
if(!within(databasePath)||!within(backupPath)||databasePath===backupPath||!databasePath.endsWith(".sqlite")||!backupPath.endsWith(".sqlite"))throw Error("Database and backup must be distinct SQLite files inside this isolated worktree.");
process.env.HEARTWORD_DATA_DIR=root;
const {applySourceSpeechBinding}=await import("../src/pipeline/ingestion/apply-source-speech-binding.js");
const {appliedSourceRowReconciliation,appliedSourceSpeechBinding,readListeningReview}=await import("../src/pipeline/ingestion/source-listening-review.js");
const {sourceReviewHashes,hasCurrentSourceReview}=await import("../src/pipeline/ingestion/source-review.js");
const {readConfirmedSpeechRuns}=await import("../src/pipeline/ingestion/continuous-speech.js");
const planPath=join(root,"review","meyah-mark4-speech-binding-preview.json");
const plan=JSON.parse(readFileSync(planPath,"utf8")) as {projectId:string;speechManifestHash:string;windows:Array<{itemId:string;reviewId:string;startMs:number;endMs:number;speakerCharacterId:string}>;rows:Array<{startMs:number;endMs:number;verseRef:string|null;speakerCharacterId:string|null}>;retainedOriginalAudio:Array<{itemId:string;reviewId:string}>};
if(plan.projectId!==projectId||plan.rows.length!==54||plan.windows.length!==11||plan.retainedOriginalAudio.length!==2)throw Error("The producer-approved projection is incomplete.");
const db=new DatabaseSync(databasePath);db.exec("PRAGMA foreign_keys=ON");
try{
 const reconciliation=appliedSourceRowReconciliation(db,projectId);
 if(!reconciliation)throw Error("Approved 40-row source archive is missing.");
 const before=sourceReviewHashes(db,projectId,root),verse=readListeningReview(db,root,projectId,"verse"),speech=readListeningReview(db,root,projectId,"speech");
 const windows=[...plan.windows.map(w=>({itemId:w.itemId,reviewId:w.reviewId,startMs:w.startMs,endMs:w.endMs,characterId:w.speakerCharacterId,treatment:"character" as const})),...plan.retainedOriginalAudio.map(w=>{const item=speech.items.find(i=>i.id===w.itemId);if(!item?.current)throw Error("An original-performance window is missing.");return {itemId:w.itemId,reviewId:w.reviewId,startMs:item.current.startMs,endMs:item.current.endMs,characterId:null,treatment:"original" as const};})];
 const record=appliedSourceSpeechBinding(db,projectId)??applySourceSpeechBinding(db,root,{projectId,sourceHash:before.sourceHash,previousAlignmentHash:before.alignmentHash,verseManifestHash:verse.manifestHash,speechManifestHash:plan.speechManifestHash,windows,expectedRowCount:plan.rows.length,reviewerName:"Codex applying Dan's approved source speaker map",evidence:"Dan explicitly approved the isolated projected 54-row Mark 4 → Meyah map at exact verified quotation edges. Original Meyah narration and 4:41 group performance are retained. This applies prior listening reviews; it does not assert a fresh human review of the resulting map.",backupPath});
 if(record.backupPath!==backupPath||record.projectId!==projectId||record.manifestHashes.speech!==plan.speechManifestHash||JSON.stringify(record.windows)!==JSON.stringify([...windows].sort((a,b)=>a.startMs-b.startMs)))throw Error("Saved speech binding does not match the approved projection or retained backup.");
 const actual=(db.prepare("SELECT start_ms,end_ms,verse_ref,speaker_character_id FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms,id").all(projectId) as Array<{start_ms:number;end_ms:number;verse_ref:string|null;speaker_character_id:string|null}>);
 if(JSON.stringify(actual.map(r=>({startMs:r.start_ms,endMs:r.end_ms,verseRef:r.verse_ref,speakerCharacterId:r.speaker_character_id})))!==JSON.stringify(plan.rows.map(r=>({startMs:r.startMs,endMs:r.endMs,verseRef:r.verseRef,speakerCharacterId:r.speakerCharacterId}))))throw Error("Applied source rows differ from approved preview: restore the retained backup before further work.");
 const retainedVerse=readListeningReview(db,root,projectId,"verse"),retainedSpeech=readListeningReview(db,root,projectId,"speech");
 const runs=readConfirmedSpeechRuns(db,projectId,root),durationBySpeaker=Object.fromEntries(["b78bed54-1d53-4b9f-9070-549dddb71b19","9cbc4222-b194-4db4-baa9-2ba7083e31f3"].map(id=>[id,actual.filter(r=>r.speaker_character_id===id).reduce((n,r)=>n+r.end_ms-r.start_ms,0)]));
 if(retainedVerse.items.length!==40||retainedSpeech.items.length!==13||runs.length!==10||durationBySpeaker["b78bed54-1d53-4b9f-9070-549dddb71b19"]!==561242||durationBySpeaker["9cbc4222-b194-4db4-baa9-2ba7083e31f3"]!==8281||hasCurrentSourceReview(db,projectId,root))throw Error("Applied review state differs from expected; inspect the source binding before proceeding.");
 const receipt={recordId:record.id,projectId,databasePath,backupPath,previousAlignmentHash:record.previousAlignmentHash,appliedAlignmentHash:record.appliedAlignmentHash,sourceHash:record.sourceHash,verseManifestHash:verse.manifestHash,speechManifestHash:speech.manifestHash,rows:actual.length,runs:runs.length,durationBySpeaker,oldAttestationCurrent:false,sourceArchiveRows:retainedVerse.items.length,speechReviewItems:retainedSpeech.items.length,planSha256:createHash("sha256").update(readFileSync(planPath)).digest("hex")};
 const suffix=databasePath===join(root,"db","heartword.sqlite")?"":"-dry-run";
 const receiptPath=join(root,"review",`meyah-mark4-speech-binding-applied${suffix}.json`);
 writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({receiptPath,...receipt},null,2));
}finally{db.close();}
