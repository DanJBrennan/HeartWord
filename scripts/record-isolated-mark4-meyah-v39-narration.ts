/** Record Dan's explicit 2026-10-25 answer in the isolated Meyah source review.
 * The verified listening revision and original source segments remain intact. */
import {realpathSync} from "node:fs";
import {join,resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {readListeningReview,recordListeningNarrationDecision} from "../src/pipeline/ingestion/source-listening-review.js";

const checkout=realpathSync(resolve(import.meta.dirname,".."));
const root=realpathSync(join(checkout,"output","mark4-donor-20261024"));
if(!root.startsWith(checkout+"\\")&&!root.startsWith(checkout+"/"))throw Error("Review root must stay inside the isolated checkout.");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const db=new DatabaseSync(join(root,"db","heartword.sqlite"));
try{
 const review=readListeningReview(db,root,projectId,"speech"),item=review.items.find(i=>i.id==="speech-jesus-v39");
 if(review.manifestHash!=="f0e917304d3ed9d7c8076a7f7d50a2b14cbfa6e9ad9ce5c97b3f8cf3b3b7eed7"||
    item?.current?.id!=="00d42481-87a7-4f37-a3fd-9dc60bc1e6f5"||!item.current.verified)
   throw Error("The producer-reviewed v39 evidence changed; reconcile before recording narration.");
 const decision=recordListeningNarrationDecision(db,root,projectId,{
  itemId:item.id,manifestHash:review.manifestHash,reviewId:item.current.id,scope:"speech",
  reviewerName:"Codex recording Dan's answer",
  evidence:"Dan answered the targeted 2026-10-25 source question: 'Narrator describes the action.' The supplied Meyah Mark 4:39 describes Jesus rebuking the wind and the calm; it does not provide direct quoted words for a Jesus voice clip. Retain this recorded passage in the original narrator voice. This is a content decision, not a new listening attestation."
 });
 console.log(JSON.stringify({decisionId:decision.id,reviewId:decision.reviewId,treatment:decision.treatment,sourceRowsChanged:false}));
}finally{db.close();}
