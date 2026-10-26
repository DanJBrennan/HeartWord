/** Run the existing complete chapter planning crew, as Dan selected. */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("The full Meyah crew must run inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD="2";
if(!process.env.GEMINI_API_KEY)throw new Error("Gemini crew review is unavailable; no paid request was made");
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [{getDb},{loadCrewBrief},{runProductionCrew},{checkFilmSpend},{readLanguageEditionPlan,editionPlanIsOrderOnlySuccessor}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-context.js"),
  import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/pipeline/voice-lipsync/performance-direction.js"),import("../src/pipeline/language-edition.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId);
if(!plan?.revision||plan.revision.reviewer!=="Dan")throw new Error("The producer-approved target correspondence is missing");
const approvedAudio=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='approve_edition_cast_audio' AND undone=0")
  .get(projectId) as {payload:string}|undefined;
if(!approvedAudio||!editionPlanIsOrderOnlySuccessor(db,projectId,JSON.parse(approvedAudio.payload).planHash))
  throw new Error("The producer-approved target cast audio is missing or stale");
const brief=loadCrewBrief(db,root,projectId,"planning");
if(brief.shots.length!==145||brief.audio.length!==54)throw new Error("The whole-chapter crew brief changed");
const existing=db.prepare("SELECT id,status,result_json FROM production_runs WHERE project_id=? AND phase='planning' ORDER BY created_at DESC,rowid DESC LIMIT 1")
  .get(projectId) as {id:string;status:string;result_json:string|null}|undefined;
const correction=db.prepare("SELECT note FROM review_notes WHERE id=? AND project_id=? AND source='human'")
  .get("meyah-mark4-producer-crew-correction-20261025",projectId) as {note:string}|undefined;
const orderRerun=process.argv.includes("--after-approved-order-repair");
if(orderRerun){
  if(existing?.id!=="cb3359cb-fdbd-44c9-9273-a66794bda1da"||existing.status!=="incomplete")
    throw new Error("The interrupted crew run changed; inspect before starting a fresh crew");
  const repaired=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reconcile_edition_shot_order' AND undone=0 ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  if(!repaired||JSON.parse(repaired.payload).newPlanHash!==plan.hash)
    throw new Error("The approved source-clock order repair is not current");
}
const continuing=!orderRerun && existing?.status==="incomplete" && Boolean(existing.result_json) &&
  (existing.id==="0a52e4dd-b723-4e1a-94bf-41e0ecaae65f" ||
    Boolean(correction?.note.includes("Dan confirmed that 4:39 is narrated action")));
const correctedRerun=existing?.id==="0a52e4dd-b723-4e1a-94bf-41e0ecaae65f" &&
  existing.status==="held" && Boolean(correction?.note.includes("Dan confirmed that 4:39 is narrated action"));
const metadataRerun=process.argv.includes("--after-added-beat-correction");
if(metadataRerun){
  if(existing?.id!=="f88ea439-307c-4370-9d6d-dec4697d6e30"||existing.status!=="approved")
    throw new Error("The approved prior crew run changed; inspect before a metadata rerun");
  const saved=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key='meyah-mark4-added-beat-metadata-correction-20261026' AND command_type='correct_edition_added_beat_metadata' AND undone=0")
    .get(projectId) as {payload:string}|undefined;
  if(!saved||JSON.parse(saved.payload).changedShots!==34)
    throw new Error("The reviewed 34-shot correction has not been applied");
}
const johnRerun=process.argv.includes("--after-john-clean-canon");
if(johnRerun){
  if(existing?.id!=="635718ea-884a-4e8c-afd2-f76d23c2ebd2"||existing.status!=="approved")
    throw new Error("The producer-approved pre-John crew run changed; inspect before rerunning");
  const currentJohn=db.prepare("SELECT id FROM character_versions WHERE character_id=? AND status='approved'")
    .all("3179d3c7-201d-4365-9a41-0e7ef0c49257") as Array<{id:string}>;
  if(currentJohn.length!==1||currentJohn[0]!.id!=="fd85079a-0f1c-57de-9f7f-9e69c0418744")
    throw new Error("Dan's isolated clean-shaven John version is not current");
  const revision=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='approve_isolated_character_version' AND undone=0 ORDER BY sequence DESC LIMIT 1")
    .get(projectId) as {payload:string}|undefined;
  if(!revision||JSON.parse(revision.payload).newVersionId!==currentJohn[0]!.id)
    throw new Error("The reviewed John canon promotion is missing");
}
if(existing && !continuing && !correctedRerun && !metadataRerun && !orderRerun && !johnRerun){
  console.log(JSON.stringify({projectId,runId:existing.id,status:existing.status,
    summary:existing.result_json?JSON.parse(existing.result_json).summary:null,
    action:"Existing planning run retained; inspect before any repeat."},null,2));
  process.exit(0);
}
checkFilmSpend(db,projectId,2);
const dbPath=join(root,"db","heartword.sqlite"),backup=join(root,"review",continuing?
  `pre-standard-crew-continuation-${existing!.id}.sqlite`:orderRerun?
  "pre-approved-order-standard-crew-20261026.sqlite":johnRerun?
  "pre-john-clean-canon-standard-crew-20261026.sqlite":metadataRerun?
  "pre-added-beat-corrected-standard-crew-20261026.sqlite":correctedRerun?
  "pre-corrected-standard-crew-20261025.sqlite":"pre-standard-crew-20261025.sqlite");
if(!existsSync(backup))execFileSync("python",["-c","import sqlite3,sys; a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",dbPath,backup]);
console.log(`${continuing?"Continuing the saved":orderRerun?"Running a new crew after the approved source-clock repair":johnRerun?"Rerunning after Dan's clean-shaven John canon approval":metadataRerun?"Rerunning after the reviewed 34-shot metadata correction":correctedRerun?"Rerunning the corrected":"Running the existing"} planning crew against all ${brief.shots.length} reviewed Meyah shots; each Gemini call has a conservative USD 2 reservation.`);
const result=await runProductionCrew(projectId,"planning",{db,dataDir:root,maxCalls:30,
  ...(continuing?{resumeRunId:existing!.id}:{})});
const ledger=Number((db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS n FROM cost_ledger_entries WHERE project_id=?").get(projectId) as {n:number}).n);
const report={kind:"isolated_meyah_mark4_standard_whole_chapter_crew",projectId,runId:result.runId,
  status:result.status,summary:result.summary,calls:result.calls,reviewedShots:brief.shots.length,
  productionRecordStatus:result.productionRecord?.status??null,
  continuedSavedRun:Boolean(continuing),
  correctedPriorHeldRun:Boolean(correctedRerun),
  correctedAddedBeatMetadata:Boolean(metadataRerun),
  correctedApprovedPictureOrder:Boolean(orderRerun),
  correctedJohnCanon:Boolean(johnRerun),
  openBlockingObjections:result.productionRecord?.objections.filter(item=>item.status==="open"&&item.severity==="blocking").length??null,
  recordedModelSpendUsd:ledger,callUpperBoundUsd:2,
  response:"Retained for producer/Goal Guardian review before new keyframes or LTX video",
  liveDatabaseOpened:false};
writeFileSync(join(root,"review",continuing?`meyah-mark4-standard-crew-continuation-${existing!.id}.json`:orderRerun?
  "meyah-mark4-approved-order-crew-result.json":johnRerun?
  "meyah-mark4-john-clean-crew-result.json":metadataRerun?
  "meyah-mark4-added-beat-corrected-crew-result.json":correctedRerun?
  "meyah-mark4-corrected-crew-result.json":"meyah-mark4-standard-crew-result.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
