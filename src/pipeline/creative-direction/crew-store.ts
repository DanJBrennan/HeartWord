import { randomUUID } from "node:crypto";
import { beginObservedWork } from "../observed-work.js";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir, getDb } from "../../db/client.js";
import { generateJsonWithImagesMetered, GEMINI_TEXT_MODEL } from "../../providers/gemini-text.js";
import { crewBriefHash, loadCrewBrief } from "./crew-context.js";
import { runCrew, type CrewRunnerOptions } from "./crew.js";
import type { CrewBrief, CrewPhase, CrewResult, CrewContribution } from "./crew-types.js";
import { saveDeliberationExport } from "./deliberation-export.js";
import { canonReferenceMedia, acceptedCoverageMedia } from "./visual-reference-media.js";
import { acceptedFilmDirection, newProductionRecord, same, type ProductionRecord } from "./production-record.js";
import { emotionalDirection, validateEmotionalTreatment } from "./emotional-treatment.js";
import { reserveCrewModelSpend, settleCrewModelSpend } from "./model-spend.js";
import { assertEditionInputsCurrent } from "../language-edition.js";

export interface StoredCrewRun { id: string; project_id: string; phase: CrewPhase; brief_hash: string;
  brief_json: string; status: string; result_json: string | null; created_at: number }
export function latestCrewRun(db: DatabaseSync, projectId: string, phase: CrewPhase): StoredCrewRun | undefined {
  return db.prepare("SELECT * FROM production_runs WHERE project_id = ? AND phase = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId, phase) as unknown as StoredCrewRun | undefined;
}
export function savedProductionRecord(run: StoredCrewRun | undefined): ProductionRecord | undefined {
  if (!run?.result_json) return undefined;
  const record = (JSON.parse(run.result_json) as CrewResult).productionRecord;
  if (record && record.version !== 1) throw new Error("Unsupported saved production record version.");
  return record;
}
/** Read-only hydration catches replies arriving after a producer successor was
 * saved. Their evidence stays visible without rewriting that accepted row. */
export function productionRecordForRun(db:DatabaseSync,run:StoredCrewRun|undefined):ProductionRecord|undefined {
  const saved=savedProductionRecord(run);if(!saved||!run)return saved;
  const record=structuredClone(saved),known=new Set(record.history.map(h=>h.id));
  const events=db.prepare(`SELECT e.output_json FROM production_events e JOIN production_runs r ON r.id=e.run_id
    WHERE r.project_id=? AND r.phase=? AND e.output_json IS NOT NULL ORDER BY e.created_at,e.rowid`).all(run.project_id,run.phase);
  for(const event of events){const output=JSON.parse(String(event.output_json)) as CrewContribution;
    for(const contribution of output.exchange??[]){
      if(known.has(contribution.id))continue;known.add(contribution.id);record.history.push(contribution);
      if(contribution.kind==="objection"&&contribution.finding){
        const index=Number(contribution.id.split(":finding:").at(-1)),finding=output.findings[index];
        if(finding)record.objections.push({...finding,id:contribution.id,owner:contribution.owner,status:"open"});
      }
      if(contribution.inputBriefSha256===record.briefHash&&contribution.inputRevision===record.inputRevision)for(const disposition of contribution.resolution?.objectionDispositions??[]){
        const objection=record.objections.find(o=>o.id===disposition.objectionId);
        if(objection&&objection.owner===contribution.owner&&disposition.outcome==="resolved"){objection.status="resolved";objection.resolutionId=contribution.id;}
      }
    }
  }
  return record;
}
export async function runProductionCrew(projectId: string, phase: CrewPhase, options: {
  db?: DatabaseSync; dataDir?: string; maxCalls?: number; call?: CrewRunnerOptions["call"];
  brief?: CrewBrief; media?: CrewRunnerOptions["media"]; resumeRunId?: string;
} = {}): Promise<CrewResult & { runId: string }> {
  const db = options.db ?? getDb();
  const dataDir = options.dataDir ?? getDataDir();
  const brief = options.brief ?? loadCrewBrief(db, dataDir, projectId, phase);
  const previous = latestCrewRun(db, projectId, phase);
  const planning = phase === "planning" ? previous : latestCrewRun(db, projectId, "planning");
  const prior = productionRecordForRun(db,previous);
  const accepted = db.prepare("SELECT * FROM production_runs WHERE project_id=? AND phase=? AND status='approved' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId, phase) as unknown as StoredCrewRun | undefined;
  const active = db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running' LIMIT 1").get(projectId);
  if (active) throw new Error("A production crew run is already active. Recover an interrupted run before restarting.");
  const hash = crewBriefHash(brief, phase);
  const resume = options.resumeRunId ? previous : undefined;
  if (options.resumeRunId && (phase !== "planning" || resume?.id !== options.resumeRunId ||
      resume.status !== "incomplete" || resume.brief_hash !== hash))
    throw new Error("Planning continuation requires the latest incomplete run and unchanged creative brief.");
  const priorResult = resume?.result_json ? JSON.parse(resume.result_json) as CrewResult : undefined;
  const priorEvents = resume ? db.prepare("SELECT role,round,error FROM production_events WHERE run_id=? ORDER BY sequence")
    .all(resume.id) as Array<{role:string;round:number;error:string|null}> : [];
  const completedEvents=priorEvents.filter(event=>!event.error);
  if (resume && (!priorResult?.productionRecord || priorResult.productionRecord.revision !== resume.id ||
      priorResult.calls !== priorEvents.length || !priorEvents.at(-1)?.error || priorEvents.some(event=>event.round!==1) ||
      Object.keys(priorResult.contributions).length!==completedEvents.length))
    throw new Error("Planning continuation lacks an exact saved first-pass failure.");
  let previousError=priorEvents.at(-1)?.error ?? "";
  if(resume && previousError.startsWith("Emotional pause")){
    const last=db.prepare("SELECT output_json FROM production_events WHERE run_id=? ORDER BY sequence DESC LIMIT 1")
      .get(resume.id) as {output_json:string|null}|undefined;
    const rejected=last?.output_json ? (JSON.parse(last.output_json) as {rejectedOutput?:{emotionalTreatment?:{
      pauses?:Array<{afterSegmentId:string|null;coverageShotIds:string[]}>}}}).rejectedOutput : undefined;
    const pauses=rejected?.emotionalTreatment?.pauses??[];
    if(previousError.includes("complete known source segment")){
      const known=new Set(brief.audio.map(segment=>segment.id));
      const invalid=[...new Set(pauses.map(pause=>pause.afterSegmentId).filter((id):id is string=>Boolean(id&&!known.has(id))))];
      if(invalid.length)previousError+=` Rejected afterSegmentId(s) absent from this crew's audio rows: ${invalid.join(", ")}. Omit these pauses or use verified complete source rows.`;
    }
    if(previousError.includes("wordless coverage")){
      const silent=new Set(brief.shots.filter(shot=>!shot.needsLipSync).map(shot=>shot.id));
      const invalid=[...new Set(pauses.flatMap(pause=>pause.coverageShotIds??[]).filter(id=>!silent.has(id)))];
      if(invalid.length)previousError+=` Rejected speaking or unknown coverageShotIds: ${invalid.join(", ")}. Choose planned wordless shots only.`;
    }
  }
  if(resume && previousError.includes("Only the original objector")){
    const last=db.prepare("SELECT output_json FROM production_events WHERE run_id=? ORDER BY sequence DESC LIMIT 1")
      .get(resume.id) as {output_json:string|null}|undefined;
    const rejected=last?.output_json ? (JSON.parse(last.output_json) as {rejectedOutput?:{
      objectionResponses?:Array<{objectionId:string}>}}).rejectedOutput : undefined;
    const owners=new Map(priorResult!.productionRecord!.objections.map(objection=>[objection.id,objection.owner]));
    const role=priorEvents.at(-1)!.role;
    const foreign=[...new Set((rejected?.objectionResponses??[]).map(response=>response.objectionId)
      .filter(id=>owners.get(id)!==role))];
    if(foreign.length)previousError+=` ${role} cannot resolve these other owners' retained objections: ${foreign.map(id=>`${id} (owner ${owners.get(id)??"unknown"})`).join(", ")}. Leave them in history and return no response for them.`;
  }
  const resumeFirstPass: CrewRunnerOptions["resumeFirstPass"] | undefined = resume && priorResult ? {
    contributions:priorResult.contributions,
    completedRoles:completedEvents.map(event=>event.role as keyof CrewResult["contributions"]),
    calls:priorEvents.length,failedRole:priorEvents.at(-1)!.role as keyof CrewResult["contributions"],
    previousError } : undefined;
  const id = resume?.id ?? randomUUID();
  const productionRecord = resume ? structuredClone(priorResult!.productionRecord!) :
    newProductionRecord(brief, id, hash, savedProductionRecord(accepted));
  if (resume) productionRecord.status="proposed";
  // New guidance changes the review context, but does not delete previously
  // accepted facts when the actual source/canon/shot inputs are unchanged.
  if(!resume && accepted?.result_json){
    const oldBrief=JSON.parse(accepted.brief_json) as CrewBrief,oldRecord=savedProductionRecord(accepted);
    const creativeInputs=(b:CrewBrief)=>({project:b.project,source:b.source,canon:b.canon,audio:b.audio,shots:b.shots.map(s=>({...s,clip:null}))});
    if(oldRecord&&same(creativeInputs(oldBrief),creativeInputs(brief)))for(const snapshot of productionRecord.snapshots){
      const old=oldRecord.snapshots.find(s=>s.context.sceneId===snapshot.context.sceneId);
      if(old)for(const layer of ["world","states","shots"] as const)snapshot[layer]=structuredClone(old[layer]);
    }
  }
  // Retain unresolved and resolved history across held runs and phases. No
  // historical row is rewritten or given invented lifecycle decisions.
  for (const context of resume ? [] : [productionRecordForRun(db,planning), prior]) if (context) {
    productionRecord.history = [...new Map([...productionRecord.history, ...context.history].map(h => [h.id, h])).values()];
    productionRecord.objections = [...new Map([...productionRecord.objections, ...context.objections].map(o => [o.id, o])).values()];
  }
  const seenContributions: CrewResult["contributions"] = structuredClone(resumeFirstPass?.contributions ?? {});
  const openingResult={status:"incomplete",summary:resume ? "Continuing the exact saved first-pass failure; earlier replies remain retained." :
    "Crew review started; retained objections remain current until explicitly resolved.",
    calls:resumeFirstPass?.calls ?? 0,contributions:seenContributions,productionRecord,emotionalTreatmentRequired:phase==="planning"?true:undefined};
  if(resume){
    const updated=db.prepare("UPDATE production_runs SET status='running',result_json=?,completed_at=NULL,worker_pid=? WHERE id=? AND status='incomplete'")
      .run(JSON.stringify(openingResult),process.pid,id);
    if(updated.changes!==1)throw new Error("The saved crew run changed before continuation.");
  }else db.prepare(`INSERT INTO production_runs (id, project_id, phase, brief_hash, brief_json, status, result_json, created_at, worker_pid)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`).run(id, projectId, phase, hash, JSON.stringify(brief),JSON.stringify(openingResult),Date.now(),process.pid);
  const stopObserving = beginObservedWork(projectId, phase === "planning" ? "casting" : phase === "editing" ? "assembly" : "qc", id);
  let sequence = priorEvents.length;
  const eventIdFor=(role:string,round:number)=>{
    const base=`${id}:${role}:${round}`;
    return db.prepare("SELECT id FROM production_events WHERE id=?").get(base) ? `${base}:retry${sequence+1}` : base;
  };
  let result: CrewResult;
  // Set only by the real default `call` below, from Gemini's own reported
  // usageMetadata -- reset before each attempt so a failed call never
  // inherits the previous call's cost, and read once by `log` immediately
  // after, since `runCrew` always calls `log` exactly once per `call`
  // before making the next one (see crew.ts). Stays null for a
  // caller-supplied `call` (tests, recovery), same as before this change.
  let lastCallCostUsd: number | null = null;
  let callReservation: {id:string;eventId:string} | null = null;
  try {
    const configuredBound = Number(process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD);
    result = await runCrew({ phase, brief, maxCalls: options.maxCalls, media: options.media, productionRecord, creativeFeedback: true,
      resumeFirstPass,
      callUpperBoundUsd: options.call ? null : Number.isFinite(configuredBound) && configuredBound > 0 ? configuredBound : null,
      coverageMedia: phase === "editing" ? acceptedCoverageMedia(dataDir,brief) : [],
      visualMedia: canonReferenceMedia(db, dataDir, brief),
      call: async (prompt, schema, media) => {
        lastCallCostUsd = null;
        if (latestCrewRun(db, projectId, phase)?.id !== id || (!options.brief && crewBriefHash(loadCrewBrief(db, dataDir, projectId, phase), phase) !== hash)) {
          throw new Error("Production inputs/revision changed during review; stale work is retained and no further call is authorized.");
        }
        if (options.call) return options.call(prompt,schema,media);
        const role = prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ", "_");
        const round = prompt.match(/pass (\d)\/2/)![1]!;
        const eventId = eventIdFor(role,Number(round));
        lastCallCostUsd = 0; // A local pre-submission hold incurs no provider charge.
        callReservation = {id:reserveCrewModelSpend(db,projectId,eventId),eventId};
        lastCallCostUsd = null; // Submission/result/usage may now be uncertain.
        const metered = await generateJsonWithImagesMetered(prompt, media, schema);
        lastCallCostUsd = metered.usage?.totalTokenCount > 0 ? metered.costUsd : null;
        return metered.result;
      },
      log: event => {
        const costUsd = lastCallCostUsd;
        lastCallCostUsd = null;
        const eventId=callReservation?.eventId ?? eventIdFor(event.role,event.round);
        db.prepare(`INSERT INTO production_events
          (id, run_id, sequence, role, round, prompt, output_json, error, model, cost_usd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(eventId, id, ++sequence, event.role,
            event.round, event.prompt, event.output ? JSON.stringify(event.output) : event.rejectedOutput===undefined ? null : JSON.stringify({summary:"Rejected malformed role reply; not a contribution or approval.",directions:[],findings:[],rejectedOutput:event.rejectedOutput}), event.error, GEMINI_TEXT_MODEL, costUsd, Date.now());
        if(event.output)seenContributions[event.role]=event.output;
        db.prepare("UPDATE production_runs SET result_json=? WHERE id=? AND status='running'").run(JSON.stringify({status:"incomplete",summary:"Review in progress; saved exchanges are not approval.",calls:sequence,contributions:seenContributions,productionRecord,emotionalTreatmentRequired:phase==="planning"?true:undefined}),id);
        if (costUsd !== null) db.prepare(`INSERT INTO cost_ledger_entries (id, project_id, generation_attempt_id, amount_usd, created_at) VALUES (?, ?, NULL, ?, ?)`)
          .run(randomUUID(), projectId, costUsd, Date.now());
        if (callReservation) settleCrewModelSpend(db,projectId,callReservation.id,callReservation.eventId,costUsd);
        callReservation = null;
      } });
    // Reject a model result produced against inputs changed by another request.
    if ((!options.brief && crewBriefHash(loadCrewBrief(db, dataDir, projectId, phase), phase) !== hash) || latestCrewRun(db, projectId, phase)?.id !== id) {
      result = { ...result, status: "held", summary: "Production inputs changed during review. Run the crew against the current brief." };
    }
  } catch (error) {
    result = { status: "incomplete", summary: (error as Error).message, calls: sequence, contributions:seenContributions, productionRecord, emotionalTreatmentRequired:phase==="planning"?true:undefined };
  } finally { stopObserving(); }
  db.exec("BEGIN IMMEDIATE");
  try {
    if (latestCrewRun(db,projectId,phase)?.id !== id || (!options.brief && crewBriefHash(loadCrewBrief(db,dataDir,projectId,phase),phase) !== hash)) {
      result = {...result,status:"held",summary:"Production inputs/revision changed during review. Reconcile against the current saved revision."};
    }
    if (result.productionRecord && result.status !== "approved" && result.status !== "awaiting_assets") result.productionRecord.status = "held";
    db.prepare("UPDATE production_runs SET status = ?, result_json = ?, completed_at = ? WHERE id = ? AND status='running'")
      .run(result.status, JSON.stringify(result), Date.now(), id);
    db.exec("COMMIT");
  } catch(error) { db.exec("ROLLBACK"); throw error; }
  // Best-effort: a chapter's deliberation is worth saving for future
  // visualization the moment it happens, at whatever status it actually
  // reached -- but a failure here must never take down the real run above.
  try { saveDeliberationExport(db, options.dataDir ?? getDataDir(), projectId, phase, id, brief, result.status); }
  catch (error) { console.error(`Deliberation export failed for ${projectId}/${phase}/${id}:`, error); }
  return { ...result, runId: id };
}

export function recoverInterruptedCrew(db: DatabaseSync, projectId: string, runId: string): void {
  const run = db.prepare("SELECT worker_pid,status,result_json FROM production_runs WHERE id=? AND project_id=?").get(runId, projectId);
  if (!run || run.status !== "running") throw new Error("This run is not awaiting recovery.");
  if (run.worker_pid) {
    try { process.kill(Number(run.worker_pid), 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      const calls = Number(db.prepare("SELECT COUNT(*) AS n FROM production_events WHERE run_id=?").get(runId)!.n);
      const prior=run.result_json?JSON.parse(String(run.result_json)) as CrewResult:undefined;
      if(prior?.productionRecord)prior.productionRecord.status="held";
      const result: CrewResult = { status: "incomplete", summary: "The worker stopped before this review completed. Saved exchanges were retained; start a new review when ready.", calls, contributions:prior?.contributions??{},productionRecord:prior?.productionRecord,emotionalTreatmentRequired:prior?.emotionalTreatmentRequired };
      db.prepare("UPDATE production_runs SET status='incomplete',result_json=?,completed_at=? WHERE id=? AND status='running'").run(JSON.stringify(result), Date.now(), runId);
      return;
    } throw error; }
    throw new Error("The worker is still running; its review cannot be recovered as interrupted.");
  }
  throw new Error("This historical run has no worker identity; inspect it before recovery.");
}

export function requireCurrentPlan(db: DatabaseSync, dataDir: string, projectId: string): StoredCrewRun {
  assertEditionInputsCurrent(db,dataDir,projectId);
  const run = latestCrewRun(db, projectId, "planning");
  if (!run || run.status !== "approved") throw new Error("Run the production crew and resolve its findings before generating new media.");
  if (crewBriefHash(loadCrewBrief(db, dataDir, projectId, "planning"), "planning") !== run.brief_hash) throw new Error("The production plan is stale; review the changed source, canon or shot plan first.");
  const result = JSON.parse(run.result_json!) as CrewResult;
  if (!result?.contributions?.creative_director?.emotionalTreatment) throw new Error("Review an advance emotional treatment before generating new media; existing film assets and history remain retained.");
  validateEmotionalTreatment(result.contributions.creative_director.emotionalTreatment, JSON.parse(run.brief_json) as CrewBrief);
  const record = productionRecordForRun(db,run);
  if (record && (record.revision !== run.id || record.briefHash !== run.brief_hash || record.status !== "accepted" || record.objections.some(o => o.status === "open" && o.severity === "blocking"))) {
    throw new Error("The saved production revision is not accepted or has unresolved blocking objections.");
  }
  return run;
}

/**
 * Producer override for requireCurrentPlan's staleness check (Dan's
 * explicit request, 2026-09-22): when Dan directly edits a shot's or
 * scene's creative fields through the producer-edit routes in
 * projects.ts, his edit IS the human review -- it should not also require
 * the crew to re-review its own prior recommendation before media
 * generation can run against it. Append an immutable successor to the last
 * approved planning run. Preserve its brief/result, specialist decisions,
 * protected source/canon inputs and any unresolved objections. The producer's
 * changed shots use saved edited fields rather than the old Director prose.
 * No approval is invented when no reviewed plan exists.
 */
export function reapproveCurrentPlanAfterProducerEdit(db: DatabaseSync, dataDir: string, projectId: string): boolean {
  db.exec("SAVEPOINT producer_plan_revision");
  try { const result=appendProducerPlanRevision(db,dataDir,projectId); db.exec("RELEASE producer_plan_revision"); return result; }
  catch(error) { db.exec("ROLLBACK TO producer_plan_revision"); db.exec("RELEASE producer_plan_revision"); throw error; }
}
function appendProducerPlanRevision(db: DatabaseSync, dataDir: string, projectId: string): boolean {
  const run = db.prepare("SELECT * FROM production_runs WHERE project_id=? AND phase='planning' AND status='approved' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId) as unknown as StoredCrewRun | undefined;
  if (!run?.result_json) return false;
  const brief = loadCrewBrief(db, dataDir, projectId, "planning");
  const before = JSON.parse(run.brief_json) as CrewBrief;
  // Producer creative edits cannot re-stamp a changed source/canon/performance.
  const protectedInputs = (b: CrewBrief) => ({ project:b.project, source:b.source, canon:b.canon, audio:b.audio,
    shots:b.shots.map(s => ({id:s.id,sceneId:s.sceneId,verseRef:s.verseRef,characters:s.characterIds,dialogue:s.dialogueCharacterId,needsLipSync:s.needsLipSync,sourceSegmentId:s.sourceSegmentId,utterance:s.utterance,beats:s.beats})) });
  if (!same(protectedInputs(before), protectedInputs(brief))) throw new Error("Source, canon or performance changed; a producer creative edit cannot approve those changes.");
  const hash = crewBriefHash(brief, "planning");
  if (run.brief_hash === hash) return true;
  const id = randomUUID(), result = JSON.parse(run.result_json) as CrewResult;
  const previous = savedProductionRecord(run);
  const latestRecord = productionRecordForRun(db,latestCrewRun(db,projectId,"planning"));
  const record = newProductionRecord(brief, id, hash, previous);
  if (latestRecord) { record.history=structuredClone(latestRecord.history); record.objections=structuredClone(latestRecord.objections); }
  record.parentRevision = run.id; record.inputRevision = run.id;
  for(const snapshot of record.snapshots){snapshot.inputRevision=run.id;snapshot.parentRevision=`${run.id}:${snapshot.context.sceneId}`;}
  const changed = brief.shots.filter(s => !same({ ...s, clip:null }, { ...before.shots.find(old => old.id === s.id), clip:null })).map(s => s.id);
  record.producerOverrideShotIds = [...new Set([...(previous?.producerOverrideShotIds ?? []), ...changed])];
  // Retain each unaffected specialist fact, even within an edited shot.
  if (previous) for (const snapshot of record.snapshots) {
    const old = previous.snapshots.find(s => s.context.sceneId === snapshot.context.sceneId);
    if (old) for (const layer of ["states", "shots"] as const) for (const entity of snapshot[layer]) {
      const shotId = layer === "states" ? entity.id.slice("state:".length) : entity.id;
      const priorEntity=old[layer].find(e=>e.id===entity.id),beforeShot=before.shots.find(s=>s.id===shotId),afterShot=brief.shots.find(s=>s.id===shotId);
      if(priorEntity&&beforeShot&&afterShot){
        const fields:Record<string,keyof CrewBrief["shots"][number]>=layer==="states"?{performance:"action","light.direction":"lighting"}:{framing:"framing",cameraPosition:"spatialView",cameraMovement:"cameraMovement",continuity:"continuity",crowdDensity:"crowdDensity"};
        for(const [name,fact] of Object.entries(priorEntity.facts))if(!fields[name]||same(beforeShot[fields[name]!],afterShot[fields[name]!]))entity.facts[name]=structuredClone(fact);
      }
    }
  }
  for (const snapshot of record.snapshots) for (const layer of ["states", "shots"] as const) for (const entity of snapshot[layer]) for (const fact of Object.values(entity.facts)) {
    if (fact.status === "proposed") { fact.status = "approved"; fact.approvalRecord = `production_runs:${id}:producer-edit`; }
  }
  record.status = "accepted";
  result.productionRecord = record; result.calls = 0; result.summary = "Producer edit accepted; previous brief, contributions and decisions retained in the parent revision.";
  // An edit does not erase an independent unresolved concern.
  const held = record.objections.some(o => o.status === "open" && o.severity === "blocking");
  if (held) { record.status = "held"; result.status = "held"; }
  else result.status = "approved";
  db.prepare(`INSERT INTO production_runs(id,project_id,phase,brief_hash,brief_json,status,result_json,created_at,completed_at)
    VALUES (?,?,'planning',?,?,?,?,?,?)`).run(id,projectId,hash,JSON.stringify(brief),result.status,JSON.stringify(result),Date.now(),Date.now());
  return true;
}

/** Shared producer/API edit, including history and revision in one transaction. */
export function applyProducerCreativeEdit(db:DatabaseSync,dataDir:string,projectId:string,input:{
  kind:"shot"|"scene"; subjectId:string; fields:Record<string,string|null>; note:string;
  idempotencyKey?:string; expectedRevision?:string|null;
}): { revision:string|null; replayed:boolean } {
  const allowed=input.kind === "shot" ? ["action","continuity_notes","crowd_density","spatial_view"] : ["lighting_continuity"];
  const keys=Object.keys(input.fields);
  if (!keys.length || keys.some(k=>!allowed.includes(k))) throw new Error("Unsupported producer edit field.");
  const request={kind:input.kind,subjectId:input.subjectId,fields:input.fields,note:input.note,expectedRevision:input.expectedRevision};
  const key=input.idempotencyKey ? `producer-edit:${projectId}:${input.idempotencyKey}` : `producer-edit:${randomUUID()}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    const prior=db.prepare("SELECT payload FROM edit_commands WHERE idempotency_key=? AND project_id=?").get(key,projectId);
    if(prior){const saved=JSON.parse(String(prior.payload));if(!same(saved.request,request))throw new Error("Idempotency key reused with different producer edit.");db.exec("COMMIT");return {revision:saved.revision,replayed:true};}
    const current=latestCrewRun(db,projectId,"planning");
    if(input.expectedRevision!==undefined && input.expectedRevision!==(current?.id??null))throw new Error("Producer edit is stale; reload the current revision.");
    const table=input.kind === "shot" ? "shots" : "scenes";
    const before=input.kind === "shot" ? db.prepare("SELECT sh.* FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id WHERE sh.id=? AND sc.project_id=?").get(input.subjectId,projectId)
      : db.prepare("SELECT * FROM scenes WHERE id=? AND project_id=?").get(input.subjectId,projectId);
    if(!before)throw new Error("Producer edit subject is not in this chapter.");
    db.prepare(`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(",")} WHERE id=?`).run(...keys.map(k=>input.fields[k]!),input.subjectId);
    db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,?,?, 'human',?,1,?)")
      .run(randomUUID(),projectId,input.kind === "shot" ? "shot" : "project",input.kind === "shot" ? input.subjectId : projectId,`Producer edit to ${input.kind} ${input.subjectId}: ${input.note}`,Date.now());
    const attempt=input.kind === "shot" ? db.prepare("SELECT * FROM generation_attempts WHERE shot_id=? AND operation='generate' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(input.subjectId) : undefined;
    if(attempt && ["accepted","hold_for_review","escalate"].includes(String(attempt.status)))db.prepare("UPDATE generation_attempts SET status='retry_modified' WHERE id=?").run(String(attempt.id));
    reapproveCurrentPlanAfterProducerEdit(db,dataDir,projectId);
    const revision=latestCrewRun(db,projectId,"planning")?.id??null;
    const after=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(input.subjectId);
    const sequence=Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
    db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,'producer_creative_edit',?,?,?)")
      .run(randomUUID(),projectId,sequence,JSON.stringify({request,inputRevision:current?.id??null,revision,before,after,previousAttempt:attempt??null}),key,Date.now());
    db.exec("COMMIT");return {revision,replayed:false};
  }catch(error){db.exec("ROLLBACK");throw error;}
}

export function productionAuthorization(db:DatabaseSync,dataDir:string,projectId:string) {
  const plan=requireCurrentPlan(db,dataDir,projectId);
  return {runId:plan.id,briefHash:plan.brief_hash,assertCurrent:()=>{
    const current=requireCurrentPlan(db,dataDir,projectId);
    if(current.id!==plan.id || current.brief_hash!==plan.brief_hash)throw new Error("Production revision changed after preparation; stale generation is held.");
  }};
}

export function bindAttemptRevision(db:DatabaseSync,projectId:string,attemptId:string,authorization:{runId:string;briefHash:string}):void {
  const key=`production-revision:${attemptId}`;
  db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,'generation_production_revision',?,?,? FROM edit_commands WHERE project_id=?`)
    .run(randomUUID(),projectId,JSON.stringify({attemptId,runId:authorization.runId,briefHash:authorization.briefHash}),key,Date.now(),projectId);
}
export function recordMediaAcceptance(db:DatabaseSync,projectId:string,attemptId:string,reviewNoteId:string):void {
  const sequence=Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 n FROM edit_commands WHERE project_id=?").get(projectId)!.n);
  db.prepare("INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at) VALUES(?,?,?,'accept_media_candidate',?,?,?)")
    .run(randomUUID(),projectId,sequence,JSON.stringify({attemptId,reviewNoteId}),`media-acceptance:${attemptId}`,Date.now());
}
export function validateAttemptRevision(db:DatabaseSync,dataDir:string,projectId:string,attemptId:string):void {
  const saved=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND idempotency_key=?").get(projectId,`production-revision:${attemptId}`);
  if(!saved){
    const newUnbound=db.prepare(`SELECT ga.id FROM generation_attempts ga JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id
      WHERE ga.id=? AND sc.project_id=? AND ga.created_at >= (SELECT MIN(created_at) FROM production_runs WHERE project_id=? AND phase='planning' AND json_extract(result_json,'$.productionRecord.version')=1)`)
      .get(attemptId,projectId,projectId);
    if(newUnbound)throw new Error("New candidate is missing its accepted production revision binding; retain it for reconciliation.");
    return; // Retained historical assets acquire no fabricated provenance.
  }
  const binding=JSON.parse(String(saved.payload)),current=requireCurrentPlan(db,dataDir,projectId);
  if(current.id!==binding.runId || current.brief_hash!==binding.briefHash)throw new Error("Candidate belongs to an earlier production revision; retain it for explicit reuse review.");
}
/** New handoffs require the exact current accepted plan pinned at preparation. */
export function validateHandoffPlan(db: DatabaseSync, dataDir: string, projectId: string, preparedRunId?: string): void {
  if (requireCurrentPlan(db, dataDir, projectId).id !== preparedRunId) throw new Error("Production direction changed after preparation. Prepare a new brief.");
}
export function directionsFromRun(run: StoredCrewRun, shotId: string, beatId?: string): string {
  const brief = JSON.parse(run.brief_json) as CrewBrief;
  const shot = brief.shots.find(s => s.id === shotId);
  if (!shot) throw new Error("Shot is not in the reviewed production plan.");
  const beat = beatId ? shot.beats.find(b => b.id === beatId) : null;
  if (beatId && !beat) throw new Error("Coverage beat is not in the reviewed plan.");
  const result = JSON.parse(run.result_json!) as CrewResult;
  const record = result.productionRecord;
  // The Production Director's own direction is the sole authoritative
  // instruction sent to media generation -- see docs/plans/CURRENT_GOAL.md,
  // 2026-09-19. Every other role's direction remains retained evidence in
  // this run's own contributions (still fully inspectable via
  // GET .../production/runs/:runId), just no longer forwarded into the live
  // generation prompt, where 13 roles' potentially contradictory
  // instructions previously had to be reconciled by the image/video model
  // itself. crew.ts now requires the Director to cover every shot, so this
  // should never be missing for an approved plan.
  const direction = result.contributions.production_director?.directions.find(d => d.shotId === shotId);
  if (!direction) throw new Error("The Production Director did not direct this shot.");
  return `\n\nAPPROVED FILM DIRECTION (${run.id}):\n` +
    (record?.producerOverrideShotIds.includes(shotId) ? `Producer's saved edit controls this shot. ${shot.action}\n${shot.continuity ?? ""}\n${shot.lighting ?? ""}\n` : `production director: ${direction.instruction}\nPurpose: ${direction.scriptureBasis}\n`) +
    (record ? acceptedFilmDirection(record, shotId) : "") +
    (record?.producerOverrideShotIds.includes(shotId) ? "\nEmotional treatment remains in history; the producer's saved shot edit takes precedence.\n" : emotionalDirection(result.contributions.creative_director?.emotionalTreatment, shotId)) +
    (beat ? `This is coverage beat ${beat.id}, not the whole parent action. Show only: ${beat.notes ?? beat.id}. Chosen subject: ${beat.characterId ?? "no singled-out character"}. Apply parent continuity only where visible in this angle.\n` : "");
}
