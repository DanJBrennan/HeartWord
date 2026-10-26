/** Reconcile the isolated Meyah edition to Dan's approved source-clock picture.
 * Dry-run by default. --apply retains every target shot ID and old command.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";
import { assertEditionInputsCurrent, readLanguageEditionPlan, reviseLanguageEdition, type EditionPlanRevision, type EditionShotCorrespondence } from "../src/pipeline/language-edition.js";
import { assertEditionVoiceAuditionApproved } from "../src/pipeline/language-edition-audition.js";
import { materializeEditionCasting } from "../src/pipeline/language-edition-stages.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))throw Error("Wrong isolated data root");
if(process.argv.slice(2).some(value=>value!=="--apply"))throw Error("Usage: repair-isolated-mark4-meyah-approved-order.ts [--apply]");
const apply=process.argv.includes("--apply"),projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const dbPath=join(root,"db","heartword.sqlite"),review=join(root,"review");
const backupPath=join(review,"heartword.before-approved-order-repair-20261026.sqlite");
const scratchPath=join(review,"heartword.approved-order-rehearsal-20261026.sqlite");
const receiptPath=join(review,"meyah-mark4-approved-order-repair-20261026.json");
const mainPath=join(root,"assets","review","meyah-mark4-main-shot-review-20261025","proposal.json");
const stormPath=join(root,"assets","review","meyah-mark4-storm-shot-review-20261025","assembly-ready-proposal.json");
const auditPath=join(root,"assets","review","meyah-mark4-approved-order-audit-20261026","report.json");
const sha=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
type MapRow={donorShotId:string;targetShotId:string|null;treatment:string;targetSegmentId:string|null;reason:string;voiceIdentitySource?:string};
type MapPayload={planHash:string;donorRenderId:string;shots:MapRow[]};
type Approved={donorShotId:string;pipelineTreatment:string;targetStartMs:number;targetEndMs:number;action:string;
  addedForEdition?:boolean;targetSpeech?:{startMs:number;endMs:number};picture?:{kind:string;attemptId?:string}};
const main=JSON.parse(readFileSync(mainPath,"utf8")) as {rows:Approved[]};
const storm=JSON.parse(readFileSync(stormPath,"utf8")) as {rows:Approved[]};
const approved=[...main.rows,...storm.rows];
const audit=JSON.parse(readFileSync(auditPath,"utf8")) as {projectId:string;status:string;savedPlanHash:string;
  approvedMainProposalSha256:string;approvedToCurrentPlacement:number[];differentDonorPositions:number;
  speakingShotsAtDifferentSourceWindows:number;ambiguousRepeatedDonorMatches:unknown[];perDonorOriginalFrameOrderPreserved:boolean};
if(approved.length!==147||audit.projectId!==projectId||audit.status!=="production_hold"||
  audit.approvedMainProposalSha256!==sha(readFileSync(mainPath))||audit.differentDonorPositions!==40||
  audit.speakingShotsAtDifferentSourceWindows!==8||audit.ambiguousRepeatedDonorMatches.length!==0||
  !audit.perDonorOriginalFrameOrderPreserved||audit.approvedToCurrentPlacement.length!==147||
  new Set(audit.approvedToCurrentPlacement).size!==147||
  audit.approvedToCurrentPlacement.some(i=>!Number.isInteger(i)||i<1||i>147))throw Error("The approved order audit changed");
let cursor=0;
for(const row of approved){if(row.targetStartMs!==cursor||row.targetEndMs<cursor)throw Error("Approved source clock has a gap or reversal");cursor=row.targetEndMs;}
if(cursor!==805685)throw Error("Approved source clock changed");

const db=new DatabaseSync(dbPath);
const saved=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' AND undone=0 ORDER BY sequence DESC LIMIT 1")
  .get(projectId) as {payload:string}|undefined;
const oldMap=saved?JSON.parse(saved.payload) as MapPayload:null;
const oldPlan=readLanguageEditionPlan(db,projectId);
if(!oldMap||!oldPlan?.revision||oldPlan.hash!==audit.savedPlanHash||oldMap.planHash!==oldPlan.hash||oldMap.shots.length!==147)
  throw Error("The isolated target is no longer at the audited plan");
const oldPlanHash=oldPlan.hash;
assertEditionInputsCurrent(db,root,projectId);
const oldCorr=oldPlan.revision.correspondence;
const correspondence:EditionShotCorrespondence[]=audit.approvedToCurrentPlacement.map(i=>oldCorr[i-1]!);
const newMap:MapPayload={...oldMap,shots:audit.approvedToCurrentPlacement.map(i=>oldMap.shots[i-1]!)};
const oldIds=oldMap.shots.map(item=>item.targetShotId).filter((id):id is string=>id!==null).sort();
const newIds=newMap.shots.map(item=>item.targetShotId).filter((id):id is string=>id!==null).sort();
if(oldIds.length!==145||JSON.stringify(oldIds)!==JSON.stringify(newIds))throw Error("Target shot identities changed");
const sceneOrder=new Map<string,string[]>();
let lastScene=0;
for(const [index,item] of correspondence.entries()){
  const proposed=approved[index]!,mapped=newMap.shots[index]!;
  if(item.donorShotId!==proposed.donorShotId||item.treatment!==proposed.pipelineTreatment||
      mapped.donorShotId!==item.donorShotId||mapped.treatment!==item.treatment||
      Boolean(item.addedForEdition)!==Boolean(proposed.addedForEdition))throw Error(`Approved placement ${index+1} changed`);
  if(proposed.addedForEdition&&item.addedAction!==proposed.action)throw Error(`New beat ${index+1} changed action`);
  const speech=proposed.targetSpeech;
  if(speech ? item.targetStartMs!==speech.startMs||item.targetEndMs!==speech.endMs :
      item.targetStartMs!==null||item.targetEndMs!==null)throw Error(`Speech placement ${index+1} changed`);
  if(proposed.picture?.kind==="accepted_handle"&&item.pictureReuse?.attemptId!==proposed.picture.attemptId)
    throw Error(`Picture handle ${index+1} changed`);
  if(mapped.targetShotId){
    const target=db.prepare("SELECT sh.scene_id,sc.sequence,sh.needs_lip_sync,sh.action FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?")
      .get(mapped.targetShotId,projectId) as {scene_id:string;sequence:number;needs_lip_sync:number;action:string}|undefined;
    if(!target||target.sequence<lastScene)throw Error(`Narrative scene order changed at ${index+1}`);
    lastScene=target.sequence;
    if(item.addedForEdition&&target.action!==item.addedAction)throw Error(`Target action changed at ${index+1}`);
    if(target.needs_lip_sync===1){
      const binding=db.prepare("SELECT source_audio_segment_id,source_start_ms,source_end_ms FROM shot_utterance_bindings WHERE shot_id=?")
        .get(mapped.targetShotId) as {source_audio_segment_id:string;source_start_ms:number;source_end_ms:number}|undefined;
      if(!binding||binding.source_audio_segment_id!==item.targetSegmentId||binding.source_start_ms!==item.targetStartMs||
          binding.source_end_ms!==item.targetEndMs)throw Error(`Speaking shot ${index+1} lost its reviewed audio`);
    }
    const ids=sceneOrder.get(target.scene_id)??[];ids.push(mapped.targetShotId);sceneOrder.set(target.scene_id,ids);
  }
}
if(sceneOrder.size!==7||Number((db.prepare("SELECT COUNT(*) n FROM shot_utterance_bindings b JOIN shots sh ON sh.id=b.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=?").get(projectId) as {n:number}).n)!==29)
  throw Error("Target scene or speaking-binding count changed");
const protectedRows=()=>sha(JSON.stringify({
  donorShots:db.prepare("SELECT sh.* FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id<>(?) ORDER BY sh.id").all(projectId),
  targetAudio:db.prepare("SELECT * FROM audio_segments WHERE project_id=? ORDER BY id").all(projectId),
  targetCast:db.prepare("SELECT * FROM composite_audio_source_map WHERE composite_segment_id IN (SELECT id FROM audio_segments WHERE project_id=?) ORDER BY composite_segment_id").all(projectId),
  targetAttempts:db.prepare("SELECT ga.* FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? ORDER BY ga.id").all(projectId),
}));
const protectedBefore=protectedRows();
const request={requestId:"meyah-mark4-approved-source-clock-repair-20261026",expectedParentHash:oldPlan.hash,
  correspondence,reviewer:"Dan",
  evidence:`Dan delegated story-first editorial judgment on 2026-10-26. Restore his approved source-clock picture map ${sha(readFileSync(mainPath))}, retain the approved storm refinement ${sha(readFileSync(stormPath))}, preserve all target shot IDs, speech windows, voice/audio and keyframes. Read-only discrepancy audit ${sha(readFileSync(auditPath))}. Reuse retained picture when it serves the story; review new coverage separately.`};
const append=(target:DatabaseSync,type:string,payload:unknown,key:string)=>{
  const sequence=Number((target.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId) as {n:number}).n);
  target.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(),projectId,sequence,type,JSON.stringify(payload),key,Date.now());
};
function reconcile(target:DatabaseSync,revision:EditionPlanRevision,insertRevision:boolean){
  target.exec("BEGIN IMMEDIATE");
  try{
    if(insertRevision)append(target,"revise_language_edition",revision,`language-edition:${projectId}:revision:${request.requestId}`);
    for(const ids of sceneOrder.values())for(const [index,id] of ids.entries())target.prepare("UPDATE shots SET sequence=? WHERE id=?").run(-1000-index,id);
    for(const ids of sceneOrder.values())for(const [index,id] of ids.entries())target.prepare("UPDATE shots SET sequence=? WHERE id=?").run(index+1,id);
    append(target,"materialize_edition_shots",{...newMap,planHash:revision.revisionHash},
      `language-edition:${projectId}:materialize_edition_shots:approved-order-20261026`);
    append(target,"reconcile_edition_shot_order",{kind:"approved_source_clock_order_repair",projectId,
      oldPlanHash,newPlanHash:revision.revisionHash,
      approvedMainProposalSha256:sha(readFileSync(mainPath)),approvedStormProposalSha256:sha(readFileSync(stormPath)),
      auditSha256:sha(readFileSync(auditPath)),approvedToPriorPlacement:audit.approvedToCurrentPlacement,
      targetShotIdsPreserved:true,sourceAudioChanged:false,donorRowsChanged:false,providerRequests:0,
      producerDirection:"Dan: The story is king; align picture with the story, reusing footage whenever it serves the flow."},
      `language-edition:${projectId}:reconcile_edition_shot_order:20261026`);
    target.exec("COMMIT");
  }catch(error){target.exec("ROLLBACK");throw error;}
}
const validate=(target:DatabaseSync,revision:EditionPlanRevision)=>{
  if(readLanguageEditionPlan(target,projectId)?.hash!==revision.revisionHash)throw Error("Revision chain changed");
  if(!materializeEditionCasting(target,root,projectId).ok)throw Error("Stage 3 does not retain the corrected map");
  assertEditionInputsCurrent(target,root,projectId);
  assertEditionVoiceAuditionApproved(target,root,projectId);
  const current=JSON.parse((target.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' ORDER BY sequence DESC LIMIT 1").get(projectId) as {payload:string}).payload) as MapPayload;
  if(current.planHash!==revision.revisionHash||JSON.stringify(current.shots.map(x=>x.targetShotId))!==JSON.stringify(newMap.shots.map(x=>x.targetShotId)))
    throw Error("Corrected target map changed");
  for(const ids of sceneOrder.values())for(const [index,id] of ids.entries()){
    const row=target.prepare("SELECT sequence FROM shots WHERE id=?").get(id) as {sequence:number};
    if(row.sequence!==index+1)throw Error("Target sequence changed");
  }
  if(target.prepare("PRAGMA quick_check").get()?.quick_check!=="ok")throw Error("SQLite quick_check failed");
};
if(existsSync(scratchPath))throw Error("Old rehearsal database needs inspection");
try{
  if(!existsSync(backupPath))await backup(db,backupPath);
  copyFileSync(backupPath,scratchPath);
  const scratch=new DatabaseSync(scratchPath);
  let revision:EditionPlanRevision;
  try{
    revision=reviseLanguageEdition(scratch,projectId,request,root).revision;
    reconcile(scratch,revision,false);validate(scratch,revision);
  }finally{scratch.close();}
  const report={kind:"isolated_meyah_mark4_approved_order_repair",projectId,
    status:apply?"applied":"rehearsed_only",oldPlanHash:oldPlan.hash,newPlanHash:revision.revisionHash,
    backupPath,backupSha256:sha(readFileSync(backupPath)),targetShots:oldIds.length,
    speakerBindings:29,approvedPlacements:approved.length,sourceDurationMs:cursor,
    movedDonorPositions:audit.differentDonorPositions,unchangedTargetShotIds:true,
    voiceAuditionCurrent:true,protectedRowsUnchanged:true,liveDatabaseOpened:false,providerRequests:0};
  if(apply){
    reconcile(db,revision,true);validate(db,revision);
    if(protectedRows()!==protectedBefore)throw Error("A protected donor, source, cast or media row changed");
    writeFileSync(receiptPath,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
}finally{db.close();if(existsSync(scratchPath))unlinkSync(scratchPath);}
