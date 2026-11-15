import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { generateCodexJson, CODEX_CREW_MODEL, parseCodexEvents, stripOptionalNulls } from "../../providers/codex-text.js";
import { appendReasoningReceipt, assertNoUncertainReasoning } from "./reasoning-receipts.js";
import { beginObservedWork } from "../observed-work.js";
import type { DatabaseSync } from "node:sqlite";
import { getDataDir, getDb } from "../../db/client.js";
import { generateJsonWithImagesMetered, GEMINI_TEXT_MODEL } from "../../providers/gemini-text.js";
import { crewBriefHash, loadCrewBrief } from "./crew-context.js";
import { runCrew, validateContribution, type CrewRunnerOptions } from "./crew.js";
import type { CrewBrief, CrewPhase, CrewResult, CrewContribution, CrewRole } from "./crew-types.js";
import { executableProductionRolesFor } from './role-registry.js';
import { saveDeliberationExport } from "./deliberation-export.js";
import { canonReferenceMedia, acceptedCoverageMedia } from "./visual-reference-media.js";
import { acceptedFilmDirection, newProductionRecord, same, type ProductionRecord } from "./production-record.js";
import { emotionalDirection, validateEmotionalTreatment } from "./emotional-treatment.js";
import { reserveCrewModelSpend, settleCrewModelSpend } from "./model-spend.js";
import { mergeShotTaskOutputs, normalizeTaskDirections } from "./crew-tasks.js";
import {verifyInitialCameraContinuation,verifyInitialSpecialistContinuation,rebaseVerifiedContinuation} from './crew-continuation.js';

export interface StoredCrewRun { id: string; project_id: string; phase: CrewPhase; brief_hash: string;
  brief_json: string; status: string; result_json: string | null; created_at: number }
export function latestCrewRun(db: DatabaseSync, projectId: string, phase: CrewPhase): StoredCrewRun | undefined {
  return db.prepare("SELECT * FROM production_runs WHERE project_id = ? AND phase = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId, phase) as unknown as StoredCrewRun | undefined;
}

/** Context for a fresh correction pass, never retained clearance. Every owner
 * is called again; only an explicit empty direction list retains its text. */
export function planningCorrectionProposals(db:DatabaseSync,projectId:string,brief:CrewBrief,runId:string){
 const source=db.prepare("SELECT * FROM production_runs WHERE id=? AND project_id=? AND phase='planning'").get(runId,projectId) as unknown as StoredCrewRun|undefined;
 const latest=latestCrewRun(db,projectId,'planning');
 // A fully rejected first reply changes no saved owner proposal. It must not
 // make the last complete held review unusable as context for a fresh retry.
 const later=db.prepare("SELECT r.id,r.status FROM production_runs r WHERE r.project_id=? AND r.phase='planning' AND r.rowid>(SELECT rowid FROM production_runs WHERE id=?)").all(projectId,runId) as Array<{id:string;status:string}>;
 if(!source||source.status!=='held'||!source.result_json||latest?.status==='running'||later.some(r=>r.status!=='incomplete'||db.prepare('SELECT 1 FROM production_events WHERE run_id=? AND output_json IS NOT NULL AND error IS NULL LIMIT 1').get(r.id)))throw Error('Correction context requires the latest completed held planning review');
 const before=JSON.parse(source.brief_json) as CrewBrief,saved=JSON.parse(source.result_json) as CrewResult,record=saved.productionRecord;
 const core=(b:CrewBrief)=>({project:b.project,source:b.source,audio:b.audio,canon:b.canon,shots:b.shots.map(s=>({...s,clip:null}))});
 if(source.brief_hash!==crewBriefHash(before,'planning')||!same(core(before),core(brief)))throw Error('Correction proposal source/canon/timed baseline changed; fresh directions required');
 const roles=[...executableProductionRolesFor('planning').filter(r=>r!=='production_director'),'fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'] as CrewRole[];
 if(!record||record.briefHash!==source.brief_hash||record.acceptedContributionIds.length||saved.contributions.production_director?.decision!=='hold'||Object.keys(saved.contributions).length!==roles.length)throw Error('Correction context lacks a complete nonaccepted owner review');
 const proposals:CrewResult['contributions']={};
 for(const role of roles){
  const output=saved.contributions[role],event=db.prepare('SELECT output_json,error FROM production_events WHERE run_id=? AND role=? ORDER BY round DESC,sequence DESC LIMIT 1').get(runId,role);
  if(!output||!event||event.error||!same(output,JSON.parse(String(event.output_json)))||!output.exchange?.length||output.exchange.some(h=>!record.history.some(x=>same(x,h)))||output.directions.length!==brief.shots.length||new Set(output.directions.map(d=>d.shotId)).size!==brief.shots.length||output.directions.some(d=>!brief.shots.some(s=>s.id===d.shotId)))throw Error('Correction context does not match complete saved role events');
  const {exchange,...body}=output;validateContribution(body,role,brief);proposals[role]=structuredClone(output);
 }
 return{proposals,provenance:{sourceRunId:runId,sourceResultSha256:createHash('sha256').update(source.result_json).digest('hex'),sourceBriefHash:source.brief_hash,coreInputsUnchanged:true,roleCount:roles.length,limitation:'Prior held proposals only. Every role must review current inputs afresh; no verdict, finding disposition or source/canon clearance is inherited.'}};
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
/** Recover a completed proposal only for the identical immutable input. It is
 * validated afresh, not treated as a fresh model call or a chapter approval. */
export function retainedInitialCreativeProposal(db:DatabaseSync,dataDir:string,projectId:string,brief:CrewBrief,sourceRunId:string){
  if(!/^[a-zA-Z0-9_-]+$/.test(sourceRunId))throw Error("Invalid retained proposal run ID");
  const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined;
  const hash=crewBriefHash(brief,'planning');
  if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)
    throw Error('Retained initial proposal requires the exact same project and immutable planning brief');
  const eventId=`${sourceRunId}:creative_director:1:task-1:evidence-0`;
  const folder=join(dataDir,'assets','preparation','crew-reasoning',projectId,eventId.replaceAll(':','_'));
  const requestBytes=readFileSync(join(folder,'request.json')),response=readFileSync(join(folder,'response.jsonl'),'utf8');
  const request=JSON.parse(requestBytes.toString('utf8')),receipt=JSON.parse(readFileSync(join(folder,'usage.json'),'utf8'));
  if(request.requestedModel!==CODEX_CREW_MODEL||receipt.requestedModel!==CODEX_CREW_MODEL||receipt.authentication!=='chatgpt'||receipt.reasoningEffort!=='medium')throw Error('Retained proposal provider/authentication evidence is invalid');
  const parsed=parseCodexEvents(response),raw=stripOptionalNulls(parsed.result,request.schema);
  const {contextRequests,...proposal}=raw;
  if(contextRequests?.length)throw Error('A retained evidence request is not a completed proposal');
  const reply=validateContribution(proposal,'creative_director',brief);
  validateEmotionalTreatment(reply.emotionalTreatment,brief);
  return {reply,provenance:{sourceRunId,sourceEventId:eventId,briefHash:hash,
    requestSha256:createHash('sha256').update(requestBytes).digest('hex'),responseSha256:createHash('sha256').update(response).digest('hex'),
    sourceUsagePath:join(folder,'usage.json'),requestedModel:CODEX_CREW_MODEL,newProviderCalls:0,
    limitation:'Exact-input retained initial proposal; normal current ownership/treatment/acceptance checks still apply. No fresh inference or human approval is claimed.'}};
}
/** Reuse the initial source review only for the same brief AND identical
 * upstream creative proposal. Later/downstream reviews are never skipped. */
export function retainedInitialScriptureProposal(db:DatabaseSync,projectId:string,brief:CrewBrief,sourceRunId:string,creative:CrewContribution){
  const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined;
  const hash=crewBriefHash(brief,'planning');
  if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)
    throw Error('Retained source review requires the exact same immutable planning brief');
  const prior=(JSON.parse(source.result_json??'{}') as CrewResult).contributions?.creative_director;
  const wire=(c:CrewContribution)=>{const {exchange:_record,...reply}=c;return reply;};
  if(!prior||!same(wire(prior),wire(creative)))throw Error('Retained source review requires the identical upstream creative proposal');
  const event=db.prepare("SELECT * FROM production_events WHERE run_id=? AND role='scripture_cultural_reviewer' AND round=1 AND error IS NULL").get(sourceRunId);
  if(!event||event.model!==`codex_cli:requested:${CODEX_CREW_MODEL}`||!event.output_json)throw Error('No completed original Codex source review is available');
  const raw=JSON.parse(String(event.output_json)),reply=validateContribution(wire(raw),'scripture_cultural_reviewer',brief);
  if(reply.treatmentReview?.status!=='clear'||reply.findings.some(f=>f.severity==='blocking'))throw Error('Retained source review did not clear this treatment');
  return {reply,provenance:{sourceRunId,sourceEventId:String(event.id),briefHash:hash,sourceOutputSha256:createHash('sha256').update(String(event.output_json)).digest('hex'),
    requestedModel:CODEX_CREW_MODEL,newProviderCalls:0,limitation:'Retained initial cultural review of identical upstream treatment, not a review of later changes or actual film. All later source/acceptance checks remain.'}};
}
/** Recover all completed initial camera tasks after a terminal aggregation
 * failure. Partial coverage, changed upstream input or fact edits cannot replay. */
export function retainedInitialCameraProposal(db:DatabaseSync,dataDir:string,projectId:string,brief:CrewBrief,sourceRunId:string,creative:CrewContribution,scripture:CrewContribution){
 if(!/^[a-zA-Z0-9_-]+$/.test(sourceRunId))throw Error('Invalid retained camera run ID');
 const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined,hash=crewBriefHash(brief,'planning');
 if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)throw Error('Retained camera tasks require identical immutable planning input and a terminal run');
 const upstream=(JSON.parse(source.result_json??'{}') as CrewResult).contributions,wire=(c:CrewContribution)=>{const {exchange:_record,...reply}=c;return reply;};
 if(!upstream?.creative_director||!upstream.scripture_cultural_reviewer||!same(wire(upstream.creative_director),wire(creative))||!same(wire(upstream.scripture_cultural_reviewer),wire(scripture)))throw Error('Retained camera tasks require identical upstream creative and cultural reviews');
 const failed=db.prepare("SELECT error FROM production_events WHERE run_id=? AND role='cinematographer' AND round=1").get(sourceRunId);
 if(!String(failed?.error).match(/^Conflicting (?:objectionResponses|ownerResponses) across shot tasks; no implicit overwrite$/))throw Error('Camera recovery requires a retained aggregation failure');
 const directory=join(dataDir,'assets','preparation','crew-reasoning',projectId),pattern=new RegExp(`^${sourceRunId}_cinematographer_1_task-(\\d+)_evidence-0$`);
 const folders=readdirSync(directory).flatMap(name=>{const m=name.match(pattern);return m?[{name,index:Number(m[1])}]:[];}).sort((a,b)=>a.index-b.index);
 if(!folders.length||folders.some((f,i)=>f.index!==i+1))throw Error('Retained camera task sequence is incomplete');
 const parts:CrewContribution[]=[],evidence=[];
 for(const folder of folders){
  const path=join(directory,folder.name),requestBytes=readFileSync(join(path,'request.json')),response=readFileSync(join(path,'response.jsonl'),'utf8'),usage=JSON.parse(readFileSync(join(path,'usage.json'),'utf8')),request=JSON.parse(requestBytes.toString('utf8'));
  if(request.requestedModel!==CODEX_CREW_MODEL||usage.requestedModel!==CODEX_CREW_MODEL||usage.authentication!=='chatgpt'||usage.reasoningEffort!=='medium')throw Error('Camera task provider provenance is invalid');
  if(!String(request.prompt).startsWith("You are HeartWord's cinematographer. Phase: planning;")||!String(request.prompt).includes(hash)||!request.input?.sha256||usage.inputSha256!==request.input.sha256)throw Error('Camera task immutable input provenance is invalid');
  const {contextRequests,...raw}=stripOptionalNulls(parseCodexEvents(response).result,request.schema);
  if(contextRequests?.length||raw.filmChanges?.length||raw.ownerResponses?.length||raw.withdrawals?.length)throw Error('Camera recovery supports completed direction/objection tasks only');
  parts.push(validateContribution(raw,'cinematographer',brief));
  evidence.push({task:folder.index,requestSha256:createHash('sha256').update(requestBytes).digest('hex'),responseSha256:createHash('sha256').update(response).digest('hex'),sourceUsagePath:join(path,'usage.json')});
 }
 const reply=mergeShotTaskOutputs(parts);
 if(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length)throw Error('Retained camera tasks do not cover every shot exactly once');
 return{reply,provenance:{sourceRunId,briefHash:hash,sourceRole:'cinematographer',completedTasks:evidence,newProviderCalls:0,
  limitation:'Complete exact-input retained initial camera tasks, merged without losing explanations and revalidated normally. Not a fresh inference, later-edit review or film acceptance.'}};
}
/** A completed initial choreography event survives a later persistence fault.
 * Its entire incoming initial prefix must still match; partial staging is not reused. */
export function retainedInitialChoreographyProposal(db:DatabaseSync,projectId:string,brief:CrewBrief,sourceRunId:string,creative:CrewContribution,scripture:CrewContribution,camera:CrewContribution){
 const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined,hash=crewBriefHash(brief,'planning');
 if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)throw Error('Retained choreography requires identical immutable input and a terminal run');
 const wire=(c:CrewContribution)=>{const {exchange:_record,...reply}=c;return reply;};
 for(const [role,current] of [['creative_director',creative],['scripture_cultural_reviewer',scripture],['cinematographer',camera]] as const){
  const prior=db.prepare('SELECT output_json FROM production_events WHERE run_id=? AND role=? AND round=1 AND error IS NULL').get(sourceRunId,role);
  if(!prior?.output_json||!same(wire(JSON.parse(String(prior.output_json))),wire(current)))throw Error('Retained choreography requires the identical complete initial upstream prefix');
 }
 const event=db.prepare("SELECT id,model,output_json FROM production_events WHERE run_id=? AND role='choreographer' AND round=1 AND error IS NULL").get(sourceRunId);
 if(!event?.output_json||event.model!==`codex_cli:requested:${CODEX_CREW_MODEL}`)throw Error('No completed original choreography event available');
 const reply=validateContribution(wire(JSON.parse(String(event.output_json))),'choreographer',brief);
 if(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length||reply.filmChanges?.length||reply.ownerResponses?.length||reply.withdrawals?.length)throw Error('Retained choreography requires complete direction/objection-only coverage');
 return{reply,provenance:{sourceRunId,sourceEventId:String(event.id),briefHash:hash,sourceOutputSha256:createHash('sha256').update(String(event.output_json)).digest('hex'),newProviderCalls:0,
  limitation:'Completed exact-input initial choreography with identical three-role upstream prefix; normal current validations still run. Not partial staging, fresh inference or film approval.'}};
}
/** Retain completed initial staging parts with one explicit final-batch repair.
 * The rejected original remains evidence; no identifier is silently corrected. */
export function retainedInitialStagingProposal(db:DatabaseSync,dataDir:string,projectId:string,brief:CrewBrief,sourceRunId:string,prefix:Partial<Record<'creative_director'|'scripture_cultural_reviewer'|'cinematographer'|'choreographer',CrewContribution>>){
 if(!/^[a-zA-Z0-9_-]+$/.test(sourceRunId))throw Error('Invalid retained staging run ID');
 const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined,hash=crewBriefHash(brief,'planning');
 if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)throw Error('Retained staging requires identical immutable input and a terminal run');
 const wire=(c:CrewContribution)=>{const {exchange:_record,...reply}=c;return reply;};
 for(const role of ['creative_director','scripture_cultural_reviewer','cinematographer','choreographer'] as const){
  const prior=db.prepare('SELECT output_json FROM production_events WHERE run_id=? AND role=? AND round=1 AND error IS NULL').get(sourceRunId,role);
  if(!prefix[role]||!prior?.output_json||!same(wire(JSON.parse(String(prior.output_json))),wire(prefix[role]!)))throw Error('Retained staging requires identical complete upstream prefix');
 }
 const failure=db.prepare("SELECT error FROM production_events WHERE run_id=? AND role='staging_designer' AND round=1").get(sourceRunId);
 if(failure?.error!=='Duplicate shot direction.')throw Error('Staging recovery requires the retained duplicate-direction failure');
 const directory=join(dataDir,'assets','preparation','crew-reasoning',projectId),pattern=new RegExp(`^${sourceRunId}_staging_designer_1_task-(\\d+)_evidence-0$`);
 const folders=readdirSync(directory).flatMap(name=>{const m=name.match(pattern);return m?[{name,index:Number(m[1])}]:[];}).sort((a,b)=>a.index-b.index);
 if(!folders.length||folders.some((f,i)=>f.index!==i+1))throw Error('Retained staging task sequence is incomplete');
 const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),parts:CrewContribution[]=[],evidence=[];
 for(const folder of folders){
  const original=join(directory,folder.name),originalRequest=readFileSync(join(original,'request.json')),originalResponse=readFileSync(join(original,'response.jsonl'),'utf8');
  const initial=JSON.parse(originalRequest.toString('utf8')),targets:string[]=initial.schema.properties.directions.items.properties.shotId.enum;
  let path=original;
  if(folder.index===folders.length){
   const {contextRequests:_requests,...bad}=stripOptionalNulls(parseCodexEvents(originalResponse).result,initial.schema);
   let rejected=false;try{validateContribution(bad,'staging_designer',brief);}catch(error){if((error as Error).message==='Duplicate shot direction.')rejected=true;else throw error;}
   if(!rejected)throw Error('Staging repair source is not the recorded malformed task');
   path=join(directory,`${sourceRunId}_staging_designer_1_task-${folder.index}_repair-1`);
  }
  const requestBytes=readFileSync(join(path,'request.json')),response=readFileSync(join(path,'response.jsonl'),'utf8'),request=JSON.parse(requestBytes.toString('utf8')),usage=JSON.parse(readFileSync(join(path,'usage.json'),'utf8'));
  if(path!==original&&(!same(request.recoveryOf,{requestSha256:sha(originalRequest),responseSha256:sha(originalResponse),originalDirectory:original})))throw Error('Staging repair does not bind exact rejected source evidence');
  if(request.requestedModel!==CODEX_CREW_MODEL||usage.requestedModel!==CODEX_CREW_MODEL||usage.authentication!=='chatgpt'||usage.reasoningEffort!=='medium'||usage.inputSha256!==request.input?.sha256)throw Error('Staging task provider provenance is invalid');
  if(!String(request.prompt).startsWith("You are HeartWord's staging designer. Phase: planning;")||!String(request.prompt).includes(hash))throw Error('Staging immutable input provenance is invalid');
  const {contextRequests,...raw}=stripOptionalNulls(parseCodexEvents(response).result,request.schema);
  if(contextRequests?.length||raw.filmChanges?.length||raw.ownerResponses?.length||raw.withdrawals?.length)throw Error('Staging recovery supports completed direction/objection tasks only');
  const reply=validateContribution(normalizeTaskDirections(raw,targets),'staging_designer',brief);
  if(reply.directions.length!==targets.length||reply.directions.some(d=>!targets.includes(d.shotId)))throw Error('Retained staging task coverage mismatch');
  parts.push(reply);evidence.push({task:folder.index,requestSha256:sha(requestBytes),responseSha256:sha(response),sourceUsagePath:join(path,'usage.json'),repaired:path!==original});
 }
 const reply=validateContribution(mergeShotTaskOutputs(parts),'staging_designer',brief);
 if(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length)throw Error('Retained staging does not cover every shot exactly once');
 return{reply,provenance:{sourceRunId,briefHash:hash,sourceRole:'staging_designer',completedTasks:evidence,newProviderCalls:0,limitation:'Exact initial staging parts plus separately charged final-batch repair; original rejection preserved. Normal current validation remains; not chapter or film approval.'}};
}
/** Preserve a complete initial Costume proposal after downstream failure.
 * Blocking findings remain blocking; this is reuse, never approval. */
export function retainedInitialCostumeProposal(db:DatabaseSync,projectId:string,brief:CrewBrief,sourceRunId:string,prefix:Partial<Record<'creative_director'|'scripture_cultural_reviewer'|'cinematographer'|'choreographer'|'staging_designer',CrewContribution>>){
 const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined,hash=crewBriefHash(brief,'planning');
 if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)throw Error('Retained costume requires identical immutable input and a terminal run');
 const wire=(c:CrewContribution)=>{const {exchange:_record,...reply}=c;return reply;};
 for(const role of ['creative_director','scripture_cultural_reviewer','cinematographer','choreographer','staging_designer'] as const){
  const prior=db.prepare('SELECT output_json FROM production_events WHERE run_id=? AND role=? AND round=1 AND error IS NULL').get(sourceRunId,role);
  if(!prefix[role]||!prior?.output_json||!same(wire(JSON.parse(String(prior.output_json))),wire(prefix[role]!)))throw Error('Retained costume requires identical complete five-role upstream prefix');
 }
 const event=db.prepare("SELECT id,model,output_json FROM production_events WHERE run_id=? AND role='costume_designer' AND round=1 AND error IS NULL").get(sourceRunId);
 if(!event?.output_json||event.model!==`codex_cli:requested:${CODEX_CREW_MODEL}`)throw Error('No completed original costume event available');
 const reply=validateContribution(wire(JSON.parse(String(event.output_json))),'costume_designer',brief);
 if(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length||reply.filmChanges?.length||reply.ownerResponses?.length||reply.withdrawals?.length)throw Error('Retained costume requires complete direction/objection-only coverage');
 return{reply,provenance:{sourceRunId,sourceEventId:String(event.id),briefHash:hash,sourceOutputSha256:createHash('sha256').update(String(event.output_json)).digest('hex'),newProviderCalls:0,
  limitation:'Completed exact-input initial Costume proposal and exact task prose; unresolved findings remain. Not fresh inference, Costume clearance, chapter approval or film acceptance.'}};
}

/** The completed initial Lighting review survives a later chapter-input hold.
 * Its six upstream role replies and immutable brief must still match exactly. */
export function retainedInitialLightingProposal(db:DatabaseSync,projectId:string,brief:CrewBrief,sourceRunId:string,prefix:Partial<CrewResult['contributions']>){
 const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined,hash=crewBriefHash(brief,'planning');
 if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)throw Error('Retained lighting requires identical immutable input and a terminal run');
 const wire=(c:CrewContribution)=>{const {exchange:_record,...reply}=c;return reply;};
 for(const role of ['creative_director','scripture_cultural_reviewer','cinematographer','choreographer','staging_designer','costume_designer'] as const){
  const prior=db.prepare('SELECT output_json FROM production_events WHERE run_id=? AND role=? AND round=1 AND error IS NULL').get(sourceRunId,role);
  if(!prefix[role]||!prior?.output_json||!same(wire(JSON.parse(String(prior.output_json))),wire(prefix[role]!)))throw Error('Retained lighting requires identical complete six-role upstream prefix');
 }
 const event=db.prepare("SELECT id,model,output_json FROM production_events WHERE run_id=? AND role='lighting_designer' AND round=1 AND error IS NULL").get(sourceRunId);
 if(!event?.output_json||event.model!==`codex_cli:requested:${CODEX_CREW_MODEL}`)throw Error('No completed original lighting event available');
 const reply=validateContribution(wire(JSON.parse(String(event.output_json))),'lighting_designer',brief);
 if(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length||reply.filmChanges?.length||reply.ownerResponses?.length||reply.withdrawals?.length)throw Error('Retained lighting requires complete direction/objection-only coverage');
 return{reply,provenance:{sourceRunId,sourceEventId:String(event.id),briefHash:hash,sourceOutputSha256:createHash('sha256').update(String(event.output_json)).digest('hex'),newProviderCalls:0,
  limitation:'Exact initial Lighting review retained; original evidence, findings and current acceptance gates remain. Not fresh inference or chapter approval.'}};
}
/** Continue an explicitly selected, direction-only initial prefix after the
 * existing seven-role recovery. Each role keeps its original actual-model
 * event and must match every already verified upstream reply byte-for-byte. */
export function retainedInitialPlanningDirectionProposals(db:DatabaseSync,projectId:string,brief:CrewBrief,sourceRunIds:Partial<Record<CrewRole,string>>,initialPrefix:Partial<CrewResult['contributions']>){
  const prefix={...initialPrefix},result:Partial<Record<CrewRole,ReturnType<typeof retainedInitialLightingProposal>>>={};
  const roles=executableProductionRolesFor('planning').filter(r=>r!=='production_director') as CrewRole[];
  const start=roles.indexOf('lighting_designer')+1,hash=crewBriefHash(brief,'planning');
  const wire=(c:CrewContribution)=>{const {exchange:_exchange,...reply}=c;return reply;};
  for(const role of Object.keys(sourceRunIds) as CrewRole[])if(!roles.slice(start).includes(role))throw Error('Additional initial recovery requires a post-lighting production role');
  for(const [index,role] of roles.entries()){
    const sourceRunId=sourceRunIds[role];if(!sourceRunId)continue;
    const source=db.prepare('SELECT * FROM production_runs WHERE id=?').get(sourceRunId) as unknown as StoredCrewRun|undefined;
    if(!source||source.project_id!==projectId||source.phase!=='planning'||source.status==='running'||source.brief_hash!==hash||crewBriefHash(JSON.parse(source.brief_json),'planning')!==hash)throw Error('Retained initial direction review requires identical immutable input and a terminal run');
    for(const previous of roles.slice(0,index)){
      const event=db.prepare('SELECT output_json FROM production_events WHERE run_id=? AND role=? AND round=1 AND error IS NULL').get(sourceRunId,previous);
      if(!prefix[previous]||!event?.output_json||!same(wire(JSON.parse(String(event.output_json))),wire(prefix[previous]!)))throw Error('Retained initial direction review requires the identical complete upstream prefix');
    }
    const event=db.prepare('SELECT id,model,output_json FROM production_events WHERE run_id=? AND role=? AND round=1 AND error IS NULL').get(sourceRunId,role);
    if(!event?.output_json||event.model!==`codex_cli:requested:${CODEX_CREW_MODEL}`)throw Error('Retained initial review requires its original completed Codex event');
    const reply=validateContribution(wire(JSON.parse(String(event.output_json))),role,brief);
    if(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length||reply.filmChanges?.length||reply.ownerResponses?.length||reply.withdrawals?.length||reply.edits?.length||reply.pauses?.length||reply.audioCues?.length||reply.generationRequests?.length)throw Error('Retained initial review requires complete direction/objection-only coverage');
    result[role]={reply,provenance:{sourceRunId,sourceEventId:String(event.id),briefHash:hash,sourceOutputSha256:createHash('sha256').update(String(event.output_json)).digest('hex'),newProviderCalls:0,limitation:'Exact original initial direction review retained; findings, ownership and normal acceptance gates remain. Not fresh inference or chapter approval.'}};
    prefix[role]=reply;
  }
  return result;
}
export async function runProductionCrew(projectId: string, phase: CrewPhase, options: {
  db?: DatabaseSync; dataDir?: string; maxCalls?: number; call?: CrewRunnerOptions["call"];
  brief?: CrewBrief; media?: CrewRunnerOptions["media"];
  boundedContext?: boolean; maxSuppliedTextBytes?: number;
  scopedContext?: boolean; maxReviewTextBytes?: number; maxInferenceCalls?: number;
  reasoningProvider?: "codex" | "gemini"; avReviewProvider?: "gemini";
  retainedInitialCreativeRunId?: string;
  resumeInitialCameraRunId?:string; maxShotTaskSize?:number;
  resumeFirstPassRunId?:string; resumeFailedRoleTaskSize?:number;
  planningCorrectionRunId?:string;
  retainedInitialScriptureRunId?: string;
  retainedInitialCameraRunId?: string;
  retainedInitialChoreographyRunId?: string;
  retainedInitialStagingRunId?: string;
  retainedInitialCostumeRunId?: string;
  retainedInitialLightingRunId?: string;
  retainedInitialPlanningRunIds?: Partial<Record<CrewRole,string>>;
  /** Host-controlled allowance permit; invoked serially before each real request. */
  beforeModelRequest?: (request: {eventId:string;role:string}) => Promise<void>;
} = {}): Promise<CrewResult & { runId: string }> {
  const db = options.db ?? getDb();
  const dataDir = options.dataDir ?? getDataDir();
  const reasoningProvider = options.reasoningProvider ?? process.env.HEARTWORD_CREW_REASONING_PROVIDER ?? "gemini";
  if (!["codex", "gemini"].includes(reasoningProvider)) throw new Error("Unsupported crew reasoning provider; select codex or gemini explicitly.");
  const avReviewProvider = options.avReviewProvider ?? process.env.HEARTWORD_CREW_AV_REVIEW_PROVIDER;
  if (avReviewProvider !== undefined && avReviewProvider !== "gemini") throw new Error("Unsupported audiovisual crew review provider.");
  if (!options.call) assertNoUncertainReasoning(db, projectId);
  const maxSuppliedTextBytes = options.maxSuppliedTextBytes ?? (reasoningProvider === "codex" ? 200_000 : undefined);
  const scopedContext=options.scopedContext??(reasoningProvider==="codex"&&options.boundedContext!==false);
  if(scopedContext&&reasoningProvider!=="codex"&&!options.call)throw new Error("Scoped crew execution is enabled only for the metered Codex route; no Gemini batching fallback");
  const maxReviewTextBytes=options.maxReviewTextBytes??options.maxSuppliedTextBytes??(reasoningProvider==="codex"?600_000:undefined);
  const brief = options.brief ?? loadCrewBrief(db, dataDir, projectId, phase);
  const previous = latestCrewRun(db, projectId, phase);
  const planning = phase === "planning" ? previous : latestCrewRun(db, projectId, "planning");
  const prior = productionRecordForRun(db,previous);
  const accepted = db.prepare("SELECT * FROM production_runs WHERE project_id=? AND phase=? AND status='approved' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(projectId, phase) as unknown as StoredCrewRun | undefined;
  const active = db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running' LIMIT 1").get(projectId);
  if (active) throw new Error("A production crew run is already active. Recover an interrupted run before restarting.");
  const id = randomUUID();
  const hash = crewBriefHash(brief, phase);
  if(options.resumeInitialCameraRunId&&options.resumeFirstPassRunId)throw Error('Select one continuation source');
  const resumeSource=options.resumeFirstPassRunId??options.resumeInitialCameraRunId;
  if(options.planningCorrectionRunId&&(phase!=='planning'||reasoningProvider!=='codex'||!scopedContext||resumeSource||options.call||Object.keys(options).some(k=>k.startsWith('retainedInitial')&&options[k as keyof typeof options])))throw Error('Planning correction requires a fresh native scoped Codex review without retained-role skips');
  const correction=options.planningCorrectionRunId?planningCorrectionProposals(db,projectId,brief,options.planningCorrectionRunId):undefined;
  if(resumeSource&&(phase!=='planning'||reasoningProvider!=='codex'||!scopedContext||options.call||Object.keys(options).some(k=>k.startsWith('retainedInitial')&&options[k as keyof typeof options])))throw Error('Technical continuation requires native scoped Codex planning without proposal-reuse options');
  const continuation=resumeSource?(options.resumeFirstPassRunId?verifyInitialSpecialistContinuation:verifyInitialCameraContinuation)(db,dataDir,projectId,brief,resumeSource,options.media??[],canonReferenceMedia(db,dataDir,brief,{compact:true,includeBody:true})):undefined;
  const rebound=continuation?rebaseVerifiedContinuation(continuation,brief,id):undefined;
  const resume=rebound?.resume;
  if(options.retainedInitialCreativeRunId&&(phase!=='planning'||reasoningProvider!=='codex'))throw Error('Initial proposal recovery requires Codex planning');
  const retained=options.retainedInitialCreativeRunId?retainedInitialCreativeProposal(db,dataDir,projectId,brief,options.retainedInitialCreativeRunId):undefined;
  if(options.retainedInitialScriptureRunId&&!retained)throw Error('Retained source review requires the verified retained initial creative proposal');
  const retainedScripture=options.retainedInitialScriptureRunId?retainedInitialScriptureProposal(db,projectId,brief,options.retainedInitialScriptureRunId,retained!.reply):undefined;
  if(options.retainedInitialCameraRunId&&!retainedScripture)throw Error('Retained camera tasks require verified initial creative and cultural recovery');
  const retainedCamera=options.retainedInitialCameraRunId?retainedInitialCameraProposal(db,dataDir,projectId,brief,options.retainedInitialCameraRunId,retained!.reply,retainedScripture!.reply):continuation?.completedCameraReply?
    {reply:continuation.completedCameraReply,provenance:{...continuation.provenance,sourceRole:'cinematographer',limitation:'Completed exact-input camera owner response recovered from retained successful CLI stream after known transport notices. Normal role validation applies; no new inference or chapter approval.'}}:undefined;
  if(options.retainedInitialChoreographyRunId&&!retainedCamera)throw Error('Retained choreography requires the verified initial three-role prefix');
  const retainedChoreography=options.retainedInitialChoreographyRunId?retainedInitialChoreographyProposal(db,projectId,brief,options.retainedInitialChoreographyRunId,retained!.reply,retainedScripture!.reply,retainedCamera!.reply):undefined;
  if(options.retainedInitialStagingRunId&&!retainedChoreography)throw Error('Retained staging requires verified four-role prefix');
  const retainedStaging=options.retainedInitialStagingRunId?retainedInitialStagingProposal(db,dataDir,projectId,brief,options.retainedInitialStagingRunId,{creative_director:retained!.reply,scripture_cultural_reviewer:retainedScripture!.reply,cinematographer:retainedCamera!.reply,choreographer:retainedChoreography!.reply}):undefined;
  if(options.retainedInitialCostumeRunId&&!retainedStaging)throw Error('Retained costume requires verified five-role prefix');
  const retainedCostume=options.retainedInitialCostumeRunId?retainedInitialCostumeProposal(db,projectId,brief,options.retainedInitialCostumeRunId,{creative_director:retained!.reply,scripture_cultural_reviewer:retainedScripture!.reply,cinematographer:retainedCamera!.reply,choreographer:retainedChoreography!.reply,staging_designer:retainedStaging!.reply}):undefined;
  if(options.retainedInitialLightingRunId&&!retainedCostume)throw Error('Retained lighting requires verified six-role prefix');
  const retainedLighting=options.retainedInitialLightingRunId?retainedInitialLightingProposal(db,projectId,brief,options.retainedInitialLightingRunId,{creative_director:retained!.reply,scripture_cultural_reviewer:retainedScripture!.reply,cinematographer:retainedCamera!.reply,choreographer:retainedChoreography!.reply,staging_designer:retainedStaging!.reply,costume_designer:retainedCostume!.reply}):undefined;
  if(options.retainedInitialPlanningRunIds&&(!retainedLighting||phase!=='planning'||reasoningProvider!=='codex'))throw Error('Additional initial recovery requires the verified seven-role Codex planning prefix');
  const retainedDirections:ReturnType<typeof retainedInitialPlanningDirectionProposals>=options.retainedInitialPlanningRunIds?retainedInitialPlanningDirectionProposals(db,projectId,brief,options.retainedInitialPlanningRunIds,{creative_director:retained!.reply,scripture_cultural_reviewer:retainedScripture!.reply,cinematographer:retainedCamera!.reply,choreographer:retainedChoreography!.reply,staging_designer:retainedStaging!.reply,costume_designer:retainedCostume!.reply,lighting_designer:retainedLighting!.reply}):{};
  const productionRecord = rebound?.record??newProductionRecord(brief, id, hash, savedProductionRecord(accepted));
  // New guidance changes the review context, but does not delete previously
  // accepted facts when the actual source/canon/shot inputs are unchanged.
  if(!continuation&&accepted?.result_json){
    const oldBrief=JSON.parse(accepted.brief_json) as CrewBrief,oldRecord=savedProductionRecord(accepted);
    const creativeInputs=(b:CrewBrief)=>({project:b.project,source:b.source,canon:b.canon,audio:b.audio,shots:b.shots.map(s=>({...s,clip:null}))});
    if(oldRecord&&same(creativeInputs(oldBrief),creativeInputs(brief)))for(const snapshot of productionRecord.snapshots){
      const old=oldRecord.snapshots.find(s=>s.context.sceneId===snapshot.context.sceneId);
      if(old)for(const layer of ["world","states","shots"] as const)snapshot[layer]=structuredClone(old[layer]);
    }
  }
  // Retain unresolved and resolved history across held runs and phases. No
  // historical row is rewritten or given invented lifecycle decisions.
  for (const context of continuation?[]:[productionRecordForRun(db,planning), prior]) if (context) {
    productionRecord.history = [...new Map([...productionRecord.history, ...context.history].map(h => [h.id, h])).values()];
    productionRecord.objections = [...new Map([...productionRecord.objections, ...context.objections].map(o => [o.id, o])).values()];
  }
  db.exec('BEGIN');
  try{
  db.prepare(`INSERT INTO production_runs (id, project_id, phase, brief_hash, brief_json, status, result_json, created_at, worker_pid)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`).run(id, projectId, phase, hash, JSON.stringify(brief),
      JSON.stringify({status:"incomplete",summary:"Crew review started; retained objections remain current until explicitly resolved.",calls:resume?.calls??0,inferenceCalls:resume?.inferenceCalls??0,contributions:resume?.contributions??{},productionRecord,emotionalTreatmentRequired:phase==="planning"?true:undefined}),Date.now(),process.pid);
  for(const [index,retained]of (rebound?.retained??[]).entries())db.prepare(`INSERT INTO production_events
    (id,run_id,sequence,role,round,prompt,output_json,error,model,cost_usd,created_at) VALUES(?,?,?,?,1,?,?,NULL,?,NULL,?)`).run(`${id}:${retained.role}:1`,id,index+1,retained.role,
      `Verified exact-input retained proposal from ${continuation!.provenance.sourceRunId}. Rebased through normal exchange validation; no new model call or source clearance. Original events/receipts remain in the continuation audit.`,JSON.stringify(retained.output),`codex_cli:retained:${CODEX_CREW_MODEL}`,Date.now());
  if(continuation)db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,'resume_crew_first_pass',?,?,? FROM edit_commands WHERE project_id=?`).run(randomUUID(),projectId,JSON.stringify({...continuation.provenance,runId:id,originalCalls:continuation.resume.calls,originalInferenceCalls:continuation.resume.inferenceCalls,rebasedCompletedRoles:resume!.completedRoles}),`resume-crew:${id}`,Date.now(),projectId);
  if(correction)db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
    SELECT ?,?,COALESCE(MAX(sequence),0)+1,'review_held_planning_proposals',?,?,? FROM edit_commands WHERE project_id=?`).run(randomUUID(),projectId,JSON.stringify({...correction.provenance,runId:id,currentBriefHash:hash}),`correction-crew:${id}`,Date.now(),projectId);
  db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  const stopObserving = beginObservedWork(projectId, phase === "planning" ? "casting" : phase === "editing" ? "assembly" : "qc", id);
  let sequence = rebound?.retained.length??0,observedCalls=0;
  const progressContributions=structuredClone(resume?.contributions??{});
  let result: CrewResult;
  // Set only by the real default `call` below, from Gemini's own reported
  // usageMetadata -- reset before each attempt so a failed call never
  // inherits the previous call's cost, and read once by `log` immediately
  // after, since `runCrew` always calls `log` exactly once per `call`
  // before making the next one (see crew.ts). Stays null for a
  // caller-supplied `call` (tests, recovery), same as before this change.
  let lastCallCostUsd: number | null = null;
  let lastCallModel = retained ? `codex_cli:retained:${CODEX_CREW_MODEL}` : "not_submitted";
  let callReservation: {id:string;eventId:string} | null = null;
  // Load exact role replies for bounded, on-demand retrieval; never append the
  // whole discussion to each prompt. Only this chapter's retained proposals
  // with successful saved events qualify, and no reply becomes an approval.
  const retainedContributions: Record<string,CrewContribution> = {};
  for (const row of db.prepare(`SELECT e.id,e.output_json FROM production_events e
    JOIN production_runs r ON r.id=e.run_id WHERE r.project_id=? AND e.error IS NULL
    AND e.output_json IS NOT NULL`).all(projectId)) {
    if (!productionRecord.history.some(h => h.id===row.id && ["proposal","revision"].includes(h.kind))) continue;
    const output=JSON.parse(String(row.output_json)) as CrewContribution;
    if (output.exchange?.some(h => h.id===row.id)) retainedContributions[String(row.id)]=output;
  }
  try {
    const configuredBound = Number(process.env.HEARTWORD_CREW_CALL_UPPER_BOUND_USD);
    result = await runCrew({ phase, brief, maxCalls: options.maxCalls, boundedContext: options.boundedContext ?? reasoningProvider === "codex", maxSuppliedTextBytes, scopedContext,maxReviewTextBytes,maxInferenceCalls:options.maxInferenceCalls, media: options.media, productionRecord, creativeFeedback: true,
      resumeFirstPass:resume,retainedShotTasks:continuation?{role:continuation.resume.failedRole,outputs:continuation.tasks,reconcileResponses:continuation.reconcileResponses,pendingEvidence:continuation.pendingEvidence}:undefined,maxShotTaskSize:options.maxShotTaskSize,resumeFailedRoleTaskSize:options.resumeFailedRoleTaskSize,
      retainedContributions,
      planningProposals:correction?.proposals??continuation?.planningProposals,
      evidenceRoundLimits:continuation?.evidenceRoundLimits,
      retainedInitialCreativeReply:retained?.reply,
      retainedInitialScriptureReply:retainedScripture?.reply,
      retainedInitialCameraReply:retainedCamera?.reply,
      retainedInitialChoreographyReply:retainedChoreography?.reply,
      retainedInitialStagingReply:retainedStaging?.reply,
      retainedInitialCostumeReply:retainedCostume?.reply,
      retainedInitialLightingReply:retainedLighting?.reply,
      retainedInitialPlanningReplies:Object.fromEntries(Object.entries(retainedDirections).map(([role,value])=>[role,value!.reply])),
      callUpperBoundUsd: options.call || reasoningProvider === "codex" ? null : Number.isFinite(configuredBound) && configuredBound > 0 ? configuredBound : null,
      coverageMedia: phase === "editing" ? acceptedCoverageMedia(dataDir,brief) : [],
      visualMedia: canonReferenceMedia(db, dataDir, brief,{compact:reasoningProvider==="codex",includeBody:reasoningProvider==="codex"}),
      call: async (prompt, schema, media) => {
        lastCallCostUsd = null;
        lastCallModel = "not_submitted";
        if (latestCrewRun(db, projectId, phase)?.id !== id || (!options.brief && crewBriefHash(loadCrewBrief(db, dataDir, projectId, phase), phase) !== hash)) {
          throw new Error("Production inputs/revision changed during review; stale work is retained and no further call is authorized.");
        }
        if (options.call) { lastCallModel = "caller_supplied_unreported"; return options.call(prompt,schema,media); }
        const role = prompt.match(/^You are HeartWord's (.*?)\. Phase:/)![1]!.replaceAll(" ", "_");
        const round = prompt.match(/pass (\d)\/2/)![1]!;
        const task=prompt.match(/TASK CONTEXT: (specialist|chapter|chapter-detail|chapter-rollup); batch (\d+)\/\d+; evidence (\d+)\/(?:2|3)/);
        const eventId = `${id}:${role}:${round}${task?`${task[1]!.startsWith("chapter-")?`:${task[1]}`:""}:task-${task[2]}:evidence-${task[3]}`:""}`;
        await options.beforeModelRequest?.({eventId,role});
        const audiovisual = media.some(m => m.mimeType.startsWith("audio/") || m.mimeType.startsWith("video/"));
        if (reasoningProvider === "codex" && audiovisual && avReviewProvider !== "gemini") {
          throw new Error("Crew audiovisual review held: explicitly select Gemini review; Codex still-frame review cannot replace listening or lip-sync review.");
        }
        if (reasoningProvider === "codex" && !audiovisual) {
          const evidenceDir = join(dataDir, "assets", "preparation", "crew-reasoning", projectId, eventId.replaceAll(":", "_"));
          const response = await generateCodexJson(prompt, schema, media, { maxSuppliedTextBytes: /TASK CONTEXT: chapter(?:-detail|-rollup)?;/.test(prompt)?maxReviewTextBytes!:maxSuppliedTextBytes!,
            beforeSubmit: input => {
              if (latestCrewRun(db,projectId,phase)?.id !== id || (!options.brief && crewBriefHash(loadCrewBrief(db,dataDir,projectId,phase),phase) !== hash)) throw new Error("Crew inputs changed before Codex submission.");
              assertNoUncertainReasoning(db,projectId);
              mkdirSync(evidenceDir,{recursive:true});
              const mediaEvidence=media.map((m,index)=>{
                const bytes=Buffer.from(m.data,"base64"),path=join(evidenceDir,`input-${index}.bin`);
                writeFileSync(path,bytes,{flag:"wx"});
                return {mimeType:m.mimeType,caption:m.caption,path,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length};
              });
              writeFileSync(join(evidenceDir,"request.json"),JSON.stringify({prompt,schema,input,requestedModel:CODEX_CREW_MODEL,reasoningEffort:"medium",media:mediaEvidence}),{flag:"wx"});
              appendReasoningReceipt(db,projectId,eventId,"submit_crew_reasoning",{provider:"codex_cli",requestedModel:CODEX_CREW_MODEL,briefHash:hash,input,evidenceDir});
              lastCallModel = `codex_cli:requested:${CODEX_CREW_MODEL}`;
            },
            retainResponse: (jsonl, transport) => {
              writeFileSync(join(evidenceDir,"response.jsonl"),jsonl,{flag:"wx"});
              // Completion of transport, not acceptance of its JSON or film.
              appendReasoningReceipt(db,projectId,eventId,"complete_crew_reasoning",{provider:"codex_cli",transport:transport?.succeeded===false?"exited_unsuccessfully":"exited_successfully",exitCode:transport?transport.exitCode:0,reason:transport?.reason,diagnosticCodes:transport?.diagnosticCodes,resultAccepted:false,responsePath:join(evidenceDir,"response.jsonl")});
            } });
          writeFileSync(join(evidenceDir,"usage.json"),JSON.stringify(response.receipt),{flag:"wx"});
          return response.result;
        }
        lastCallCostUsd = 0; // A local pre-submission hold incurs no provider charge.
        callReservation = {id:reserveCrewModelSpend(db,projectId,eventId),eventId};
        lastCallModel = GEMINI_TEXT_MODEL;
        lastCallCostUsd = null; // Submission/result/usage may now be uncertain.
        const metered = await generateJsonWithImagesMetered(prompt, media, schema);
        lastCallCostUsd = metered.usage?.totalTokenCount > 0 ? metered.costUsd : null;
        return metered.result;
      },
      log: event => {
        observedCalls++;
        const recovered=event.round===1?(event.role==='creative_director'?retained:event.role==='scripture_cultural_reviewer'?retainedScripture:event.role==='cinematographer'?retainedCamera:event.role==='choreographer'?retainedChoreography:event.role==='staging_designer'?retainedStaging:event.role==='costume_designer'?retainedCostume:event.role==='lighting_designer'?retainedLighting:retainedDirections[event.role]):undefined;
        const costUsd = recovered?null:lastCallCostUsd, model = recovered?`codex_cli:retained:${CODEX_CREW_MODEL}`:lastCallModel;
        lastCallCostUsd = null; lastCallModel = "not_submitted";
        db.prepare(`INSERT INTO production_events
          (id, run_id, sequence, role, round, prompt, output_json, error, model, cost_usd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`${id}:${event.role}:${event.round}`, id, ++sequence, event.role,
            event.round, event.prompt, event.output ? JSON.stringify(event.output) : event.rejectedOutput===undefined ? null : JSON.stringify({summary:"Rejected malformed role reply; not a contribution or approval.",directions:[],findings:[],rejectedOutput:event.rejectedOutput}), event.error, model, costUsd, Date.now());
        if(event.output)retainedContributions[`${id}:${event.role}:${event.round}`]=structuredClone(event.output);
        if(event.output)progressContributions[event.role]=structuredClone(event.output);
        const submitted=Number(db.prepare("SELECT COUNT(*) n FROM edit_commands WHERE project_id=? AND command_type='submit_crew_reasoning' AND json_extract(payload,'$.eventId') LIKE ?").get(projectId,id+':%')!.n);
        db.prepare("UPDATE production_runs SET result_json=? WHERE id=? AND status='running'").run(JSON.stringify({status:"incomplete",summary:"Review in progress; saved exchanges are not approval.",calls:(resume?.calls??0)+observedCalls,inferenceCalls:(resume?.inferenceCalls??0)+submitted,contributions:progressContributions,productionRecord,emotionalTreatmentRequired:phase==="planning"?true:undefined}),id);
        if(recovered){
          db.prepare(`INSERT INTO edit_commands(id,project_id,sequence,command_type,payload,idempotency_key,applied_at)
            SELECT ?,?,COALESCE(MAX(sequence),0)+1,'reuse_initial_crew_proposal',?,?,? FROM edit_commands WHERE project_id=?`)
            .run(randomUUID(),projectId,JSON.stringify({...recovered.provenance,runId:id,role:event.role,validatedAsCurrentProposal:Boolean(event.output),error:event.error}),`reuse-initial-proposal:${id}:${event.role}`,Date.now(),projectId);
        }
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
    const submitted=Number(db.prepare("SELECT COUNT(*) n FROM edit_commands WHERE project_id=? AND command_type='submit_crew_reasoning' AND json_extract(payload,'$.eventId') LIKE ?").get(projectId,id+':%')!.n);
    result = { status: "incomplete", summary: (error as Error).message, calls: (resume?.calls??0)+observedCalls,inferenceCalls:(resume?.inferenceCalls??0)+submitted, contributions: progressContributions, productionRecord, emotionalTreatmentRequired:phase==="planning"?true:undefined };
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
