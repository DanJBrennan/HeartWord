/** Record Dan's named approval of the isolated 54-row map for shot planning. */
import {realpathSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=realpathSync(join(checkout,"output","mark4-donor-20261024"));
if(!root.startsWith(checkout+"\\")&&!root.startsWith(checkout+"/"))throw Error("Approval must stay in this worktree.");
process.env.HEARTWORD_DATA_DIR=root;
const {appliedSourceSpeechBinding,readListeningReview}=await import("../src/pipeline/ingestion/source-listening-review.js");
const {attestSourceAlignment,sourceReviewHashes,hasCurrentSourceReview}=await import("../src/pipeline/ingestion/source-review.js");
const db=new DatabaseSync(join(root,"db","heartword.sqlite"));db.exec("PRAGMA foreign_keys=ON");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb",expectedBindingId="6fbea6d4-b75e-43c5-bc09-b80921c7078a";
const reviewerName="Dan",attestation="Approve the map for shot planning";
const evidence=`Dan explicitly approved the graphical isolated Meyah Mark 4 54-row speaker map on 2026-10-25 with the answer “${attestation}”. Binding ${expectedBindingId} projects his previously verified Jesus and Peter quotation edges, retains original Meyah narration including 4:39 and group performance at 4:41, and keeps internal verse timing approximate. Approval is for shot planning; it does not approve target shots, a voice audition, Avatar footage, or the finished film.`;
try{
 const binding=appliedSourceSpeechBinding(db,projectId),hashes=sourceReviewHashes(db,projectId,root);
 if(!binding||binding.id!==expectedBindingId||binding.appliedAlignmentHash!==hashes.alignmentHash||binding.sourceHash!==hashes.sourceHash||binding.afterSegments.length!==54||!binding.backupPath.startsWith(root))throw Error("The approved isolated source binding changed.");
 if(readListeningReview(db,root,projectId,"speech").verifiedCount!==13||readListeningReview(db,root,projectId,"verse").items.length!==40)throw Error("Retained listening evidence is incomplete.");
 if(db.prepare("SELECT 1 FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? LIMIT 1").get(projectId))throw Error("Target shots already exist before source approval.");
 const prior=db.prepare("SELECT id,reviewer_name,reviewer_attestation,evidence FROM source_alignment_reviews WHERE project_id=? AND source_hash=? AND alignment_hash=? ORDER BY created_at,rowid").all(projectId,hashes.sourceHash,hashes.alignmentHash) as Array<{id:string;reviewer_name:string;reviewer_attestation:string;evidence:string}>;
 if(prior.some(row=>row.reviewer_name!==reviewerName||row.reviewer_attestation!==attestation||row.evidence!==evidence)||prior.length>1)throw Error("A different current approval already exists.");
 const reviewId=prior[0]?.id??attestSourceAlignment(db,{projectId,reviewerName,attestation,evidence});
 if(!hasCurrentSourceReview(db,projectId,root))throw Error("The named approval is not current.");
 const receipt={projectId,bindingId:binding.id,reviewId,reviewerName,attestation,evidence,sourceHash:hashes.sourceHash,alignmentHash:hashes.alignmentHash,scope:"shot_planning",targetShots:0};
 const path=join(root,"review","meyah-mark4-speaker-map-producer-approval.json");writeFileSync(path,JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({receiptPath:path,...receipt},null,2));
}finally{db.close();}
