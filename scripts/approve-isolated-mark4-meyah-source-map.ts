/** Record Dan's explicit source-map approval and advance only the isolated
 * Meyah Mark 4 edition through scene materialization. */
import {createHash} from "node:crypto";
import {existsSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {backup,DatabaseSync} from "node:sqlite";
import {sourceReviewHashes,attestSourceAlignment,hasCurrentSourceReview} from "../src/pipeline/ingestion/source-review.js";
import {appliedSourceRowReconciliation,readListeningReview} from "../src/pipeline/ingestion/source-listening-review.js";
import {materializeEditionScenes} from "../src/pipeline/language-edition-stages.js";

if(process.argv.slice(2).join(" ")!=="--apply")throw Error("Use exactly --apply for the isolated source approval.");
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=realpathSync(join(checkout,"output","mark4-donor-20261024"));
if(!root.startsWith(checkout+"\\")&&!root.startsWith(checkout+"/"))throw Error("Approval root must stay inside the isolated checkout.");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const sourceHash="7947e9038f1cc0e74df68d934b0dbeba271a2ea27481165021ae207b2751b2c6";
const alignmentHash="97cac1b52db6f9cd16018d4aebdae6e142f6f91a0f7ce8a7c76a4d8c329929b8";
const reconciliationId="f8c8883a-0c3c-4ac2-adaa-c0f78a0808d1";
const dbPath=join(root,"db","heartword.sqlite");
const backupPath=join(root,"review","heartword.before-source-approval.sqlite");
const receiptPath=join(root,"review","meyah-mark4-source-map-approval.json");
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const db=new DatabaseSync(dbPath);
try{
 const hashes=sourceReviewHashes(db,projectId,root),reconciliation=appliedSourceRowReconciliation(db,projectId);
 const verse=readListeningReview(db,root,projectId,"verse"),speech=readListeningReview(db,root,projectId,"speech");
 const v38=verse.items.find(item=>item.id==="v38"),disciples=speech.items.find(item=>item.id==="speech-disciples-v38");
 if(hashes.sourceHash!==sourceHash||hashes.alignmentHash!==alignmentHash||reconciliation?.id!==reconciliationId||
    verse.verifiedCount!==12||speech.verifiedCount!==13||
    v38?.current?.startMs!==746679||v38.current.endMs!==754957||
    disciples?.current?.startMs!==746695||disciples.current.endMs!==754976||
    speech.items.find(item=>item.id==="speech-jesus-v39")?.resolution?.treatment!=="narration")
   throw Error("The approved isolated source map or retained listening evidence changed.");
 const sourceReviews=db.prepare("SELECT COUNT(*) AS n FROM source_alignment_reviews WHERE project_id=?").get(projectId) as {n:number};
 const sceneCount=db.prepare("SELECT COUNT(*) AS n FROM scenes WHERE project_id=?").get(projectId) as {n:number};
 if(sourceReviews.n||sceneCount.n||existsSync(backupPath)||existsSync(receiptPath))throw Error("An approval, target scene, backup or receipt already exists; reconcile before replay.");
 const donorId="8a5659a4-b033-4d5f-80e2-904b217cf8a0";
 const donorBefore=JSON.stringify(db.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY sequence,id").all(donorId));
 await backup(db,backupPath);
 const snapshot=new DatabaseSync(backupPath,{readOnly:true});
 try{if((snapshot.prepare("PRAGMA quick_check").get() as {quick_check:string}).quick_check!=="ok")throw Error("The pre-approval backup failed SQLite integrity check.");}
 finally{snapshot.close();}
 const evidence="Dan directly answered on 2026-10-25: 'Approve the map for scene planning.' This approves the current 40-row Meyah Mark 4 source map for scene planning with approximate internal verse edges. The separate verified 4:38 quotation windows are 746.679–754.957 s (verse review) and 746.695–754.976 s (speech turn); the broader 723.776–755.248 s source row includes narration. Reviewed speech cutoffs, seven word matches, two unspoken reference-only markers and narrated 4:39 remain separate evidence. Reconciliation f8c8883a-0c3c-4ac2-adaa-c0f78a0808d1. This is source approval, not voice, picture or film approval.";
 const reviewId=attestSourceAlignment(db,{projectId,reviewerName:"Dan",attestation:"Approve the map for scene planning",evidence});
 if(!hasCurrentSourceReview(db,projectId,root))throw Error("The source approval was not saved against the current inputs.");
 const scenes=materializeEditionScenes(db,root,projectId);
 if(!scenes.ok)throw Error("Source approval was saved, but scene materialization held: "+scenes.reasoning);
 const donorAfter=JSON.stringify(db.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY sequence,id").all(donorId));
 if(donorAfter!==donorBefore)throw Error("Donor scene records changed unexpectedly.");
 const targetScenes=db.prepare("SELECT id,sequence,verse_start,verse_end FROM scenes WHERE project_id=? ORDER BY sequence,id").all(projectId);
 if((db.prepare("PRAGMA quick_check").get() as {quick_check:string}).quick_check!=="ok")throw Error("The isolated database failed SQLite integrity check.");
 const receipt={projectId,reviewId,reviewerName:"Dan",attestation:"Approve the map for scene planning",evidence,sourceHash,alignmentHash,reconciliationId,backupPath,backupSha256:digest(readFileSync(backupPath)),sceneResult:scenes,targetScenes,donorScenesUnchanged:true,createdAt:new Date().toISOString()};
 writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({reviewId,sourceHash,alignmentHash,sceneCount:targetScenes.length,backupPath,receiptPath}));
}finally{db.close();}
