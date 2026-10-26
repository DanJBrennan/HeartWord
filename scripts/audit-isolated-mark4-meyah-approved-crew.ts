/** Independent read-only gate audit before target image/video handoff. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { CrewResult } from "../src/pipeline/creative-direction/crew-types.js";

const checkout=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const root=resolve(checkout,"output","mark4-donor-20261024"),rel=relative(checkout,root);
if(rel===".."||rel.startsWith(`..${sep}`)||root.toLowerCase().includes("heartworddata"))
  throw new Error("The Meyah crew audit must stay inside the isolated worktree");
process.env.HEARTWORD_DATA_DIR=root;
const projectId="a5a40890-8bb0-4856-aacb-1dcad97074bb";
const [{getDb},{requireCurrentPlan,productionRecordForRun},{readLanguageEditionPlan},{checkFilmSpend}]=await Promise.all([
  import("../src/db/client.js"),import("../src/pipeline/creative-direction/crew-store.js"),
  import("../src/pipeline/language-edition.js"),import("../src/pipeline/voice-lipsync/performance-direction.js")]);
const db=getDb(),plan=readLanguageEditionPlan(db,projectId),run=requireCurrentPlan(db,root,projectId);
if(!plan?.revision||plan.revision.reviewer!=="Dan"||plan.hash!==
  "34bdfedd82b4b7dead32019850877115e69a7935c578b42b988ec90d17c696e7")
  throw new Error("The producer-approved edition map changed");
const result=JSON.parse(run.result_json!) as CrewResult,record=productionRecordForRun(db,run);
if(run.status!=="approved"||result.productionRecord?.status!=="accepted"||record?.status!=="accepted"||
  result.contributions.production_director?.decision!=="approve"||
  result.contributions.production_director.acceptanceChecks?.status!=="clear"||
  record.objections.some(item=>item.status==="open"&&item.severity==="blocking"))
  throw new Error("The corrected whole-chapter plan is not accepted");
const source=db.prepare("SELECT speaker_character_id,start_ms,end_ms FROM audio_segments WHERE project_id=? AND layer='original_reading' AND verse_ref='Mark 4:39'")
  .all(projectId) as Array<{speaker_character_id:string|null;start_ms:number;end_ms:number}>;
if(source.length!==1||source[0]!.speaker_character_id!==null||source[0]!.start_ms!==755248||source[0]!.end_ms!==776241)
  throw new Error("Meyah 4:39 is no longer narrator-only");
const v39=db.prepare("SELECT sh.id,sh.needs_lip_sync,sh.dialogue_character_id FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND sh.verse_ref='Mark 4:39'")
  .all(projectId) as Array<{id:string;needs_lip_sync:number;dialogue_character_id:string|null}>;
if(v39.length!==4||v39.some(shot=>shot.needs_lip_sync!==0||shot.dialogue_character_id!==null))
  throw new Error("A narrated 4:39 target shot acquired visible speech");
const mapped=JSON.parse(String((db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='materialize_edition_shots' ORDER BY sequence DESC LIMIT 1")
  .get(projectId) as {payload:string}).payload)) as {planHash:string;shots:Array<{targetShotId:string|null;treatment:string}>};
const v39Ids=new Set(v39.map(shot=>shot.id));
if(mapped.planHash!==plan.hash||mapped.shots.filter(item=>item.targetShotId&&v39Ids.has(item.targetShotId))
  .some(item=>item.treatment==="replace_avatar"))throw new Error("Narrated 4:39 acquired an Avatar placement");
const current=Object.entries(result.contributions).filter(([,value])=>Boolean(value));
const findings=current.flatMap(([role,value])=>(value?.findings??[]).map(finding=>({role,...finding})));
const coverageRequests=current.flatMap(([role,value])=>(value?.coverageRequests??[]).map(request=>({role,...request})));
if(findings.length||coverageRequests.length)throw new Error("The accepted corrected crew retained new findings or coverage requests");
const pauses=result.contributions.creative_director?.emotionalTreatment?.pauses??[];
const pauseTotal=pauses.reduce((sum,pause)=>sum+pause.durationMs,0);
const preference=readFileSync(join(root,"assets","review","meyah-mark4-crew-pause-review-20261025","report.json"),"utf8");
if(JSON.parse(preference).addedDurationMs!==pauseTotal)throw new Error("The separately reviewed pause proposal changed");
const budget=checkFilmSpend(db,projectId,0);
const report={kind:"isolated_meyah_mark4_approved_crew_goal_guardian_preflight",projectId,runId:run.id,
  runStatus:run.status,productionRecordStatus:record.status,reviewedShots:145,sourceRows:54,
  producerPlanHash:plan.hash,acceptedFirstPassRoles:current.length,newFindings:findings.length,
  newCoverageRequests:coverageRequests.length,openBlockingObjections:0,
  narratedV39:{sourceStartMs:755248,sourceEndMs:776241,targetShots:v39.length,avatarPlacements:0},
  proposedPauseMs:pauseTotal,proposedPausesApplied:false,
  filmCostRemainingUsd:budget.remainingUsd,liveDatabaseOpened:false,databaseWrites:0,providerRequests:0};
writeFileSync(join(root,"review","meyah-mark4-approved-crew-gate-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
