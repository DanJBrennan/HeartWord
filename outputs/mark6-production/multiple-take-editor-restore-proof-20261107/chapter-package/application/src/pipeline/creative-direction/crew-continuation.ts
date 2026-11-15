import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {CODEX_CREW_MODEL,codexInputBudget,codexPrompt,codexOutputSchema,parseCodexEvents,stripOptionalNulls,type CodexUsage} from '../../providers/codex-text.js';
import Ajv2020 from 'ajv/dist/2020.js';
import {crewBriefHash} from './crew-context.js';
import {validateContribution,type CrewRunnerOptions} from './crew.js';
import {normalizeRecordedDirectionUpdates,normalizeTaskDirections,mergeShotTaskOutputs,SHOT_TASK_ROLES,RETAINABLE_CHAPTER_DETAIL_ROLES,shotTaskResponseReconciliation,normalizeResponseReconciliation,retrieveCrewEvidence} from './crew-tasks.js';
import {same,recordHash,saveContribution,validateFilmExchange,type ProductionRecord} from './production-record.js';
import {executableProductionRolesFor} from './role-registry.js';
import type {CrewBrief,CrewContribution,CrewResult,CrewRole,ReviewMedia,PendingCrewEvidence} from './crew-types.js';
import {validateTreatmentHandoff} from './emotional-treatment.js';
import {assertNoUncertainReasoning} from './reasoning-receipts.js';

type InputRejectedEvidence={eventId:string;round:number;reason:'input_too_large';maximumCharacters:number;actualCharacters:number;modelTurnStarted:false;retrySameRound:true};
type Receipt={inputRejectedBeforeModel?:InputRejectedEvidence;eventId:string;requestSha256:string;responseSha256:string;usageSha256?:string;completedStreamUsage?:CodexUsage;transportDiagnostics?:string[]};
type Verified={planningProposals?:CrewResult['contributions'];evidenceRoundLimits?:Partial<Record<CrewRole,2|3>>;resume:NonNullable<CrewRunnerOptions['resumeFirstPass']>;tasks:CrewContribution[];record:ProductionRecord;reconcileResponses?:boolean;completedCameraReply?:CrewContribution;pendingEvidence?:PendingCrewEvidence;
 provenance:{sourceRunId:string;sourceResultSha256:string;briefHash:string;completedRoles:CrewRole[];failedRole:CrewRole;completedTaskShots:string[];completedCameraShots?:string[];responseReconciliationRequired:boolean;pendingEvidence?:PendingCrewEvidence;receipts:Receipt[];evidenceRoundLimits?:Partial<Record<CrewRole,2|3>>;recordedPlanningSource?:{runId:string;resultSha256:string};timedOutPendingEvidence?:{eventId:string;round:number;usageUnknown:true;retrySameRound:true};inputRejectedPendingEvidence?:InputRejectedEvidence;newProviderCalls:number;limitation:string}};
function fail():never{throw Error('Initial technical continuation evidence does not match the terminal exact-input first-pass prefix');}
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const wire=(c:CrewContribution):CrewContribution=>{const{exchange:_exchange,...body}=c;return structuredClone(body);};
const resumableRole=(role:CrewRole)=>SHOT_TASK_ROLES.includes(role)||RETAINABLE_CHAPTER_DETAIL_ROLES.includes(role);
const pureTask=(reply:CrewContribution,allowOwnerDisposition=false)=>{
 if(Object.entries(reply).some(([k,v])=>!['summary','directions','findings','objectionResponses'].includes(k)&&v!==undefined&&(!Array.isArray(v)||v.length))||(!allowOwnerDisposition&&reply.objectionResponses?.some(r=>r.outcome!=='carried')))fail();
};

/** Concern-bearing proposals are evidence, never source clearance. Only an
 * interrupted initial technical role qualifies, not a chapter verdict/pass2. */
export function verifyInitialSpecialistContinuation(db:DatabaseSync,dataDir:string,projectId:string,brief:CrewBrief,runId:string,media:ReviewMedia[],visualMedia:ReviewMedia[]):Verified{
 assertNoUncertainReasoning(db,projectId);
 const latest=db.prepare('SELECT id FROM production_runs WHERE project_id=? AND phase=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(projectId,'planning');
 if(latest?.id!==runId)throw Error('Technical continuation must name the latest planning run');
 return verifyRun(db,dataDir,projectId,brief,runId,media,visualMedia,new Set());
}
export function verifyInitialCameraContinuation(...args:Parameters<typeof verifyInitialSpecialistContinuation>):Verified{
 const verified=verifyInitialSpecialistContinuation(...args);if(verified.resume.failedRole!=='cinematographer')fail();return verified;
}

/** Rebind verified proposals through the existing exchange mechanism. Current
 * IDs remain selectable; original findings/resolutions and usage survive. */
export function rebaseVerifiedContinuation(verified:Verified,brief:CrewBrief,revision:string){
 const record=structuredClone(verified.record);record.revision=revision;
 const resume=structuredClone(verified.resume),retained:Array<{role:CrewRole;output:CrewContribution}>=[];
 for(const role of resume.completedRoles){
  const output=validateContribution(wire(resume.contributions[role]!),role,brief);
  if(output.filmChanges?.length||output.ownerResponses?.length||output.withdrawals?.length||output.edits?.length||output.pauses?.length||output.audioCues?.length||output.generationRequests?.length)throw Error('Retained prefix needs fresh review for executable changes or cross-domain references');
  output.exchange=saveContribution(record,brief,role,1,output,'planning',true);
  resume.contributions[role]=output;retained.push({role,output});
 }
 return{record,resume,retained};
}

function verifyRun(db:DatabaseSync,dataDir:string,projectId:string,brief:CrewBrief,runId:string,media:ReviewMedia[],visualMedia:ReviewMedia[],seen:Set<string>):Verified{
 if(!/^[a-zA-Z0-9_-]+$/.test(runId)||seen.has(runId)||seen.size>=98)fail();seen.add(runId);
 const source=db.prepare('SELECT * FROM production_runs WHERE project_id=? AND phase=? AND id=?').get(projectId,'planning',runId),hash=crewBriefHash(brief,'planning');
 const heldDirector=source?.status==='held';
 if(!source||!['incomplete','held'].includes(String(source.status))||source.brief_hash!==hash||crewBriefHash(JSON.parse(String(source.brief_json)),'planning')!==hash)fail();
 if(source.worker_pid){try{process.kill(Number(source.worker_pid),0);fail();}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}}
 const saved=JSON.parse(String(source.result_json)) as CrewResult,record=saved.productionRecord;
 const heldApproval=heldDirector&&saved.contributions.production_director?.decision==='approve'&&saved.contributions.production_director.acceptanceChecks?.status==='clear';
 const roles=[...executableProductionRolesFor('planning').filter(r=>r!=='production_director'),'fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'] as CrewRole[];
 const events=db.prepare('SELECT * FROM production_events WHERE run_id=? ORDER BY sequence').all(runId);
 const audits=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='resume_crew_first_pass' AND json_extract(payload,'$.runId')=?").all(projectId,runId);
 if(audits.length>1)fail();const audit=audits.length?JSON.parse(String(audits[0]!.payload)):undefined;
 const parent=audit?verifyRun(db,dataDir,projectId,brief,String(audit.sourceRunId),media,visualMedia,seen):undefined;
 const heldCorrection=heldDirector&&parent&&['fidelity_challenger','clarity_challenger','feasibility_challenger'].includes(parent.resume.failedRole)&&saved.contributions.production_director?.decision==='hold'&&saved.contributions.production_director.acceptanceChecks?.status==='hold';
 const heldOwnerFollowup=heldApproval||Boolean(heldCorrection);
 if(heldDirector&&(!parent?.planningProposals||!(parent.resume.failedRole==='production_director'&&parent.resume.completedRoles.length===roles.length-1||heldOwnerFollowup&&parent.resume.completedRoles.length===roles.indexOf(parent.resume.failedRole))))fail();
 const corrections=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='review_held_planning_proposals' AND json_extract(payload,'$.runId')=?").all(projectId,runId);
 if(corrections.length>1||corrections.length&&parent)fail();
 let planningProposals=parent?.planningProposals,recordedPlanningSource=parent?.provenance.recordedPlanningSource;
 if(corrections.length){
  const correction=JSON.parse(String(corrections[0]!.payload)),seed=db.prepare('SELECT * FROM production_runs WHERE id=? AND project_id=? AND phase=?').get(correction.sourceRunId,projectId,'planning');
  if(!seed||seed.status!=='held'||sha(String(seed.result_json))!==correction.sourceResultSha256||correction.currentBriefHash!==hash||correction.sourceBriefHash!==seed.brief_hash)fail();
  const seedBrief=JSON.parse(String(seed.brief_json)),result=JSON.parse(String(seed.result_json)) as CrewResult;
  const core=(b:CrewBrief)=>({project:b.project,source:b.source,audio:b.audio,canon:b.canon,shots:b.shots.map(x=>({...x,clip:null}))});
  if(crewBriefHash(seedBrief,'planning')!==seed.brief_hash||!same(core(seedBrief),core(brief))||result.productionRecord?.acceptedContributionIds.length||result.contributions.production_director?.decision!=='hold'||Object.keys(result.contributions).length!==roles.length)fail();
  planningProposals={};
  for(const role of roles){const proposal=result.contributions[role],event=db.prepare('SELECT output_json,error FROM production_events WHERE run_id=? AND role=? ORDER BY round DESC,sequence DESC LIMIT 1').get(correction.sourceRunId,role);
   if(!proposal||!event||event.error||!same(proposal,JSON.parse(String(event.output_json)))||proposal.directions.length!==brief.shots.length||new Set(proposal.directions.map(d=>d.shotId)).size!==brief.shots.length||!proposal.exchange?.length||proposal.exchange.some(h=>!result.productionRecord?.history.some(x=>same(x,h))))fail();
   validateContribution(wire(proposal),role,brief);planningProposals[role]=structuredClone(proposal);
  }
  recordedPlanningSource={runId:String(seed.id),resultSha256:sha(String(seed.result_json))};
 }
 const completedRoles=roles.slice(0,planningProposals?events.length-1:Object.keys(saved.contributions).length),failedRole=roles[completedRoles.length];
 if(!record||record.version!==1||record.briefHash!==hash||record.acceptedContributionIds.length||!failedRole||!resumableRole(failedRole)||completedRoles.length<2||completedRoles.some(r=>!saved.contributions[r]))fail();
 if(planningProposals)for(const role of roles.slice(completedRoles.length))if(!(heldDirector&&role==='production_director')&&!same(saved.contributions[role],planningProposals[role]))fail();
 const evidenceRoundLimits:Partial<Record<CrewRole,2|3>>=structuredClone(parent?.evidenceRoundLimits??{});
 const roundExtensions=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='extend_crew_evidence_rounds' AND json_extract(payload,'$.sourceRunId')=?").all(projectId,runId);
 if(roundExtensions.length>1)fail();
 if(roundExtensions.length){const ext=JSON.parse(String(roundExtensions[0]!.payload));
  if(!planningProposals||ext.role!==failedRole||ext.previousMaximum!==2||(evidenceRoundLimits[failedRole]??2)!==2||ext.maximum!==3||ext.sourceResultSha256!==sha(String(source.result_json))||ext.briefHash!==hash||!ext.actor?.trim()||!ext.authority?.trim()||events.at(-1)?.error!=='Evidence round limit; no contribution accepted')fail();
  evidenceRoundLimits[failedRole]=3;
 }

 if(parent&&(audit.sourceResultSha256!==parent.provenance.sourceResultSha256||audit.briefHash!==hash||!same(audit.completedTaskShots??audit.completedCameraShots,parent.provenance.completedTaskShots)||!same(audit.receipts,parent.provenance.receipts)||audit.originalCalls!==parent.resume.calls||audit.originalInferenceCalls!==parent.resume.inferenceCalls))fail();
 if(parent&&(Boolean(audit.responseReconciliationRequired)!==Boolean(parent.reconcileResponses)||!same(audit.pendingEvidence,parent.provenance.pendingEvidence)||!same(audit.recordedPlanningSource,parent.provenance.recordedPlanningSource)||!same(audit.evidenceRoundLimits,parent.provenance.evidenceRoundLimits)||!same(audit.timedOutPendingEvidence,parent.provenance.timedOutPendingEvidence)||!same(audit.inputRejectedPendingEvidence,parent.provenance.inputRejectedPendingEvidence)))fail();
 const parentRoles=parent?.resume.completedRoles??[];if(parentRoles.some((r,i)=>r!==completedRoles[i]))fail();
 const rebased=Boolean(parent&&audit.rebasedCompletedRoles!==undefined);if(rebased&&!same(audit.rebasedCompletedRoles,parentRoles))fail();
 const expected=parent?rebased?rebaseVerifiedContinuation(parent,brief,runId):{record:structuredClone(parent.record),resume:structuredClone(parent.resume),retained:[]}:undefined;
 if(expected){expected.record.revision=runId;for(const role of parentRoles)if(!same(saved.contributions[role],expected.resume.contributions[role]))fail();}
 const expectedRoles=parent?[...(rebased?parentRoles:[]),...roles.slice(parentRoles.length,completedRoles.length),failedRole]:[...completedRoles,failedRole];
 if(!parent&&!planningProposals&&(completedRoles.length!==2||failedRole!=='cinematographer'))fail();
 if(events.length!==expectedRoles.length||events.some((e,i)=>e.round!==1||e.role!==expectedRoles[i])||(heldDirector?events.at(-1)!.error||!events.at(-1)!.output_json:!events.at(-1)!.error||events.at(-1)!.output_json))fail();
 const actualEvents=events.slice(rebased?parentRoles.length:0);if(saved.calls!==(parent?.resume.calls??0)+actualEvents.length)fail();
 const conflictMessage='Conflicting objectionResponses across shot tasks; no implicit overwrite';
 const reconciliationFailure=events.at(-1)!.error===conflictMessage;
 // All native tasks may have completed before the owner's consolidation was
 // held locally by its text budget. No consolidation request was submitted.
 const budgetFailure=String(events.at(-1)!.error).match(/^Crew input held before submission: (\d+) supplied text\/schema UTF-8 bytes exceed (\d+)\. Scope the review; no facts or objections were silently truncated\. This is not a measured model-token count\.$/);
 const reconciliationBudgetFailure=events.at(-1)!.error==='Codex transport character limit exceeded before submission; split the task context.'||Boolean(budgetFailure&&Number(budgetFailure[1])>Number(budgetFailure[2])&&Number(budgetFailure[2])>=1000);
 const missingFactPrefix='Missing or unsupported saved evidence: fact:';
 const missingFactRef=planningProposals&&String(events.at(-1)!.error).startsWith(missingFactPrefix)?String(events.at(-1)!.error).slice('Missing or unsupported saved evidence: '.length):undefined;
 let knownFactAbsence=false;
 if(missingFactRef){try{knownFactAbsence=(retrieveCrewEvidence(brief,record,[missingFactRef])[missingFactRef] as {notAFact?:boolean}).notAFact===true;}catch{/* Unknown scenes/invalid namespaces remain ineligible. */}}
 const exhaustedRoundExtension=Boolean(roundExtensions.length&&events.at(-1)!.error==='Evidence round limit; no contribution accepted');
 const malformedFactSyntaxFailure=Boolean(planningProposals&&/^(?:Unexpected.*JSON|Expected.*JSON|Unterminated string in JSON)/.test(String(events.at(-1)!.error)));
 const timedOutRollupFailure=Boolean(planningProposals&&events.at(-1)!.error==='Codex request timed out; reconcile its retained submission before retrying.');
 const inputRejectedFailure=Boolean(planningProposals&&events.at(-1)!.error==='Codex multipart RPC failed; retain and reconcile the submission.');
 const correctionLocalFailure=reconciliationBudgetFailure||knownFactAbsence||exhaustedRoundExtension||malformedFactSyntaxFailure||timedOutRollupFailure||inputRejectedFailure;
 const allMedia=[...media,...visualMedia].map(m=>({mimeType:m.mimeType,caption:m.caption,sha256:sha(Buffer.from(m.data,'base64'))}));
 const submissions=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='submit_crew_reasoning' AND json_extract(payload,'$.eventId') LIKE ? ORDER BY sequence").all(projectId,runId+':%');
 const unsubmittedPendingRetry=Boolean(parent?.pendingEvidence&&rebased&&reconciliationBudgetFailure&&actualEvents.length===1&&actualEvents[0]!.role===failedRole);
 if(!submissions.length&&!unsubmittedPendingRetry||saved.inferenceCalls!==(parent?.resume.inferenceCalls??0)+submissions.length)fail();
 const rollupRetry=submissions.length?String(JSON.parse(String(submissions.at(-1)!.payload)).eventId).includes(':chapter-rollup:'):unsubmittedPendingRetry;
 const tasksByRole=new Map<CrewRole,CrewContribution[]>();if(parent)tasksByRole.set(parent.resume.failedRole,structuredClone(parent.tasks));
 const receipts=structuredClone(parent?.provenance.receipts??[]),nativeByRole=new Map<CrewRole,CrewContribution>(),evidenceRounds=new Map<string,{round:number;pending:boolean}>();let failedTasks=0,failedRollup=false,completedCameraReply:CrewContribution|undefined,heldDirectorPacketVerified=false;
 let pendingEvidence=structuredClone(parent?.pendingEvidence),timedOutPendingEvidence:Verified['provenance']['timedOutPendingEvidence'],inputRejectedPendingEvidence:InputRejectedEvidence|undefined;
 if(pendingEvidence)evidenceRounds.set(`${pendingEvidence.role}:chapter-rollup:1`,{round:pendingEvidence.nextRound-1,pending:true});
 if(parent?.completedCameraReply)nativeByRole.set('cinematographer',structuredClone(parent.completedCameraReply));
 for(const [index,submission]of submissions.entries()){
  const entry=JSON.parse(String(submission.payload)),eventId=String(entry.eventId),match=eventId.match(new RegExp(`^${runId}:([a-z_]+):1:(?:(chapter-rollup|chapter-detail):)?task-(\\d+):evidence-([0-3])$`));
  if(!match||entry.briefHash!==hash)fail();const role=match[1] as CrewRole;
  const isRollup=match[2]==='chapter-rollup',isChapterDetail=RETAINABLE_CHAPTER_DETAIL_ROLES.includes(role)&&match[2]==='chapter-detail',round=Number(match[4]),evidenceKey=`${role}:${match[2]??'specialist'}:${match[3]}`,previousEvidence=evidenceRounds.get(evidenceKey);
  if(match[2]==='chapter-detail'&&!isChapterDetail||RETAINABLE_CHAPTER_DETAIL_ROLES.includes(role)&&!isChapterDetail&&!isRollup)fail();
  const roundCeiling=evidenceRoundLimits[role]??2;if(round>roundCeiling)fail();
  if(previousEvidence?!previousEvidence.pending||round!==previousEvidence.round+1:round!==0)fail();evidenceRounds.set(evidenceKey,{round,pending:false});
  if(!actualEvents.some(e=>e.role===role)||(!resumableRole(role)&&!['creative_director','scripture_cultural_reviewer'].includes(role)))fail();
  const folder=join(dataDir,'assets','preparation','crew-reasoning',projectId,eventId.replaceAll(':','_'));if(resolve(entry.evidenceDir)!==resolve(folder))fail();
  const requestBytes=readFileSync(join(folder,'request.json')),response=readFileSync(join(folder,'response.jsonl'),'utf8'),request=JSON.parse(requestBytes.toString('utf8'));
  if(request.requestedModel!==CODEX_CREW_MODEL||request.reasoningEffort!=='medium'||!same(request.input,entry.input))fail();
  const attachments=request.media.map((m:any)=>{const bytes=readFileSync(m.path);if(sha(bytes)!==m.sha256||bytes.length!==m.bytes||!allMedia.some(a=>a.mimeType===m.mimeType&&a.caption===m.caption&&a.sha256===m.sha256))fail();return{mimeType:m.mimeType,caption:m.caption,data:bytes.toString('base64')};});
  const budget=codexInputBudget(request.prompt,request.schema,attachments,Math.max(request.input.suppliedTextBytes,1000));if(budget.sha256!==request.input.sha256||budget.suppliedTextBytes!==request.input.suppliedTextBytes)fail();
  if(!resumableRole(role)&&!same(request.media.map((m:any)=>({mimeType:m.mimeType,caption:m.caption,sha256:m.sha256})),allMedia.slice(0,media.length)))fail();
  const terminal=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='complete_crew_reasoning' AND json_extract(payload,'$.eventId')=?").get(projectId,eventId);if(!terminal)fail();
  const transport=JSON.parse(String(terminal.payload)),provenance={eventId,requestSha256:sha(requestBytes),responseSha256:sha(response)};
  if(transport.transport==='exited_unsuccessfully'){
   if(role!==failedRole||index!==submissions.length-1||transport.resultAccepted!==false||existsSync(join(folder,'usage.json')))fail();
   const stream=response.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));if(stream.some(e=>e.type==='turn.completed'||e.item?.type==='agent_message'))fail();
   if(inputRejectedFailure){
    const prepared=stream[0]?.result,rejection=stream[1]?.error,actualCharacters=Array.from(codexPrompt(request.prompt,attachments)).length;
    if(transport.reason!=='Codex multipart RPC failed; retain and reconcile the submission.'||!isRollup||!planningProposals||pendingEvidence?.role!==role||pendingEvidence.nextRound!==round||nativeByRole.has(role)||stream.length!==2||stream[0]?.id!==3||prepared?.model!==CODEX_CREW_MODEL||prepared.modelProvider!=='openai'||prepared.reasoningEffort!=='medium'||prepared.thread?.ephemeral!==true||prepared.thread?.turns?.length||prepared.approvalPolicy!=='never'||prepared.sandbox?.type!=='readOnly'||prepared.instructionSources?.length||stream[1]?.id!==4||rejection?.code!==-32602||rejection.data?.input_error_code!=='input_too_large'||rejection.data.max_chars!==1048576||rejection.data.actual_chars!==actualCharacters||actualCharacters<=1048576)fail();
    inputRejectedPendingEvidence={eventId,round,reason:'input_too_large',maximumCharacters:1048576,actualCharacters,modelTurnStarted:false,retrySameRound:true};evidenceRounds.set(evidenceKey,{round:round-1,pending:true});
   }else if(isRollup&&planningProposals&&pendingEvidence?.role===role&&pendingEvidence.nextRound===round){
    if(!/^Codex request timed out;/.test(String(transport.reason))||!timedOutRollupFailure||nativeByRole.has(role)||stream.some(e=>!['thread.started','turn.started'].includes(e.type)&&!(e.type==='item.completed'&&e.item?.type==='error'&&/^Code Mode is unavailable because code-mode host is disabled\./.test(e.item.message)&&e.item.message.includes('fail closed'))&&!(e.type?.startsWith('item.')&&e.item?.type==='reasoning')))fail();
    timedOutPendingEvidence={eventId,round,usageUnknown:true,retrySameRound:true};evidenceRounds.set(evidenceKey,{round:round-1,pending:true});
   }else if(!/^Codex request timed out;/.test(String(transport.reason)))fail();
   failedTasks++;failedRollup=isRollup;receipts.push({...provenance,...(inputRejectedPendingEvidence?{inputRejectedBeforeModel:inputRejectedPendingEvidence}:{})});continue;
  }
  if(transport.transport!=='exited_successfully'||transport.exitCode!==0)fail();
  const parsed=parseCodexEvents(response),usagePath=join(folder,'usage.json'),usageBytes=existsSync(usagePath)?readFileSync(usagePath):undefined;
  if(heldDirector&&(!heldOwnerFollowup||role==='production_director')){
   if(role!=='production_director'||!isRollup||(!heldOwnerFollowup&&(submissions.length!==1||index!==0)))fail();
   const envelope=JSON.parse(request.prompt.split('BOUNDED CONTEXT:\n')[1]?.split('\n')[0]??'null');
   const decode=(v:any):any=>{
    if(v&&typeof v==='object'&&v.$ref)return decode(envelope.definitions[Number(v.$ref.split('/').at(-1))]);
    if(v&&typeof v==='object'&&v.$crewId)return envelope.idPrefixes[v.$crewId[0]]+v.$crewId[1];
    if(v&&typeof v==='object'&&v.$columns&&v.$rows){const columns=decode(v.$columns);return decode(v.$rows).map((row:any[])=>Object.fromEntries(row.map((x,i)=>[columns[i],x])));}
    return Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
   };
   const packet=decode(envelope?.payload??envelope),own=packet?.contributions?.production_director,original=planningProposals!.production_director!.directions;
   if(heldOwnerFollowup){
    if(!own||!same(own.directions,original))fail();
   }else if(!own||own.directions?.length!==0||own.directionIndex?.length!==original.length||!own.directionIndex.every((d:any,i:number)=>d.shotId===original[i]!.shotId&&d.sha256===recordHash(original[i]))||Object.values(packet.retrievedEvidence??{}).some((e:any)=>same(e?.value,original)||same(e?.value?.roleOutput?.directions,original)))fail();
   heldDirectorPacketVerified=true;
  }
  const recoveredCompletion=!usageBytes&&role==='cinematographer'&&role===failedRole&&isRollup&&transport.resultAccepted===false&&
    events.at(-1)!.error==='Codex turn failed; no review or fallback was accepted.'&&
    parsed.diagnostics.includes('stream_reconnect_notice')&&parsed.diagnostics.includes('https_transport_recovery_notice');
  if(usageBytes){
   const usage=JSON.parse(usageBytes.toString('utf8'));
   if(usage.requestedModel!==CODEX_CREW_MODEL||usage.authentication!=='chatgpt'||usage.reasoningEffort!=='medium'||usage.inputSha256!==budget.sha256||!same(usage.usage,parsed.usage))fail();
  }else if(!recoveredCompletion||!new Ajv2020({strict:false,allErrors:true}).compile(codexOutputSchema(request.schema))(parsed.result))fail();
  const usageProvenance=usageBytes?{usageSha256:sha(usageBytes)}:{completedStreamUsage:parsed.usage,transportDiagnostics:parsed.diagnostics};
  const {contextRequests,...raw}=stripOptionalNulls(parsed.result,request.schema);
  if(contextRequests?.length){if(recoveredCompletion||!isRollup&&!isChapterDetail||round===roundCeiling||!Array.isArray(contextRequests)||contextRequests.length>12||contextRequests.some((r:unknown)=>typeof r!=='string'))fail();evidenceRounds.set(evidenceKey,{round,pending:true});if(isRollup)pendingEvidence={role,nextRound:(round+1) as 1|2|3,refs:[...new Set([...(pendingEvidence?.role===role?pendingEvidence.refs:[]),...contextRequests])] as string[],originEventId:eventId};receipts.push({...provenance,...usageProvenance});continue;}
  if(isRollup&&pendingEvidence?.role===role)pendingEvidence=undefined;
  if(isRollup){
   if(!planningProposals&&!resumableRole(role))fail();const roleTasks=tasksByRole.get(role)??[];
   const {proposal,candidates}=planningProposals?{proposal:planningProposals[role]!,candidates:[]}:shotTaskResponseReconciliation(roleTasks);
   if(proposal.directions.length!==brief.shots.length||new Set(proposal.directions.map(d=>d.shotId)).size!==brief.shots.length)fail();
   if(planningProposals&&raw.directionUpdates!=null&&!request.schema.properties.directionUpdates)fail();
   const normalized=planningProposals?normalizeRecordedDirectionUpdates(raw,proposal):normalizeResponseReconciliation(raw,proposal,candidates);
   const reply=validateContribution(normalized,role,brief);
   if(planningProposals)validateTreatmentHandoff(reply,role,'planning',brief,nativeByRole.get('creative_director')?.emotionalTreatment??expected?.resume.contributions.creative_director?.emotionalTreatment??planningProposals.creative_director?.emotionalTreatment);
   for(const review of [reply.treatmentReview,...(reply.emotionalBeatChecks??[])])if(review&&review.status!=='clear')reply.findings.push({shotId:null,severity:'blocking',evidence:`Emotional treatment (${review.status}): ${review.evidence}`,requestedChange:review.requestedChange,confidence:review.confidence,limitations:review.limitations});
   validateFilmExchange(reply,role,expected?.record??record);if(nativeByRole.has(role))fail();nativeByRole.set(role,reply);
   if(recoveredCompletion){pureTask({...reply,taskSummaries:undefined},true);completedCameraReply=structuredClone(reply);}
  }else if(SHOT_TASK_ROLES.includes(role)||isChapterDetail){
   const ids=Object.keys(request.schema.properties.directions.anyOf[0].properties);
   const detailDefaults=role==='production_director'?{decision:'hold',decisionConfidence:0,decisionLimitations:'Scoped technical proposal only; no chapter approval.',acceptedContributionIds:[],acceptanceChecks:{status:'unverified',evidence:'Whole-chapter consolidation required.'}}:role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:['sound_designer','composer'].includes(role)?{audioCues:[],generationRequests:[]}:{};
   for(const key of Object.keys(detailDefaults))if(Object.hasOwn(raw,key)&&(role==='production_director'||!Array.isArray(raw[key])||raw[key].length))fail();
   const reply=validateContribution({...detailDefaults,...normalizeTaskDirections(raw,ids)},role,brief);
   for(const key of Object.keys(detailDefaults))delete (reply as any)[key];
   // Owned outcomes in interrupted pure tasks remain proposals. Retain them
   // without applying them; require whole-role consolidation after coverage.
   if(!ids.length||reply.directions.length!==ids.length)fail();pureTask(reply,completedRoles.includes(role)||role===failedRole);
   validateFilmExchange(reply,role,expected?.record??record);tasksByRole.set(role,[...(tasksByRole.get(role)??[]),reply]);
  }else{
   const reply=validateContribution(raw,role,brief);for(const review of [reply.treatmentReview,...(reply.emotionalBeatChecks??[])])if(review&&review.status!=='clear')reply.findings.push({shotId:null,severity:'blocking',evidence:`Emotional treatment (${review.status}): ${review.evidence}`,requestedChange:review.requestedChange,confidence:review.confidence,limitations:review.limitations});
   if(nativeByRole.has(role))fail();nativeByRole.set(role,reply);
  }
  receipts.push({...provenance,...usageProvenance});
 }
 for(const [index,event]of events.slice(0,-1).entries()){
  const role=event.role as CrewRole,output=JSON.parse(String(event.output_json)) as CrewContribution;if(event.error||!same(output,saved.contributions[role]))fail();
  if(rebased&&index<parentRoles.length){if(event.model!==`codex_cli:retained:${CODEX_CREW_MODEL}`||!same(output,expected!.resume.contributions[role]))fail();continue;}
  const recoveredRole=role==='cinematographer'&&Boolean(parent?.completedCameraReply);
  if(event.model!==`codex_cli:${recoveredRole?'retained':'requested'}:${CODEX_CREW_MODEL}`)fail();const roleTasks=tasksByRole.get(role),reply=nativeByRole.get(role)??(roleTasks?validateContribution(mergeShotTaskOutputs(structuredClone(roleTasks)),role,brief):undefined);
  if(!reply||!same(wire(output),reply)||!output.exchange?.every(h=>record.history.some(r=>same(r,h))))fail();
  if(roleTasks&&(reply.directions.length!==brief.shots.length||new Set(reply.directions.map(d=>d.shotId)).size!==brief.shots.length))fail();
  if(expected){reply.exchange=saveContribution(expected.record,brief,role,1,reply,'planning',recoveredRole);if(!same(reply,output))fail();expected.resume.contributions[role]=reply;}
 }
 if(heldDirector){
  const event=events.at(-1)!,reply=nativeByRole.get('production_director'),output=saved.contributions.production_director;
  if(!heldDirectorPacketVerified||failedTasks||pendingEvidence||!expected||!rebased||completedRoles.length!==roles.length-1||failedRole!=='production_director'||!reply||!output||event.model!==`codex_cli:requested:${CODEX_CREW_MODEL}`||!same(output,JSON.parse(String(event.output_json)))||!same(wire(output),reply)||reply.findings.length||(!heldOwnerFollowup&&(reply.decision!=='hold'||reply.acceptedContributionIds?.length||reply.objectionResponses?.some(r=>r.outcome!=='carried')||!same(reply.directions,planningProposals!.production_director!.directions)))||['filmChanges','ownerResponses','withdrawals','generationRequests','edits','pauses','audioCues','creativeResponses'].some(k=>(reply as any)[k]?.length))fail();
  if(heldCorrection&&(reply.acceptedContributionIds?.length||same(reply.directions,planningProposals!.production_director!.directions)))fail();
  reply.exchange=saveContribution(expected.record,brief,'production_director',1,reply,'planning');
  expected.record.status='held';if(!same(reply,output))fail();
 }
 if(expected&&!same(expected.record,record))fail();
 const tasks=tasksByRole.get(failedRole)??[],ids=planningProposals?planningProposals[failedRole]!.directions.map(d=>d.shotId):tasks.flatMap(t=>t.directions.map(d=>d.shotId)),full=ids.length===brief.shots.length;
 const pendingRounds=[...evidenceRounds.entries()].filter(([,e])=>e.pending);
 if(ids.length>brief.shots.length||new Set(ids).size!==ids.length)fail();
 if(pendingRounds.length&&(!pendingEvidence||pendingEvidence.role!==failedRole||!full||!(planningProposals?correctionLocalFailure:reconciliationBudgetFailure)||(failedTasks!==0&&!((timedOutPendingEvidence||inputRejectedPendingEvidence)&&failedTasks===1))||!rollupRetry||nativeByRole.has(failedRole)||pendingRounds.length!==1||pendingRounds[0]![0]!==`${failedRole}:chapter-rollup:1`||pendingRounds[0]![1].round+1!==pendingEvidence.nextRound))fail();
 if(knownFactAbsence&&(!missingFactRef||!pendingEvidence?.refs.includes(missingFactRef)))fail();
 if(malformedFactSyntaxFailure&&!pendingEvidence?.refs.some(ref=>{
  if(!ref.startsWith('fact:'))return false;
  try{JSON.parse(ref.slice(5));return false;}catch(error){
   if(!(error instanceof SyntaxError)||error.message!==events.at(-1)!.error)return false;
   const response=retrieveCrewEvidence(brief,record,[ref])[ref] as {notAFact?:boolean;invalidReference?:boolean};return response.notAFact===true&&response.invalidReference===true;
  }
 }))fail();
 if(pendingEvidence&&!pendingRounds.length)fail();
 let reconcileResponses=false;
 if(heldDirector){
  if(!full||pendingEvidence||pendingRounds.length||!heldDirectorPacketVerified)fail();
  planningProposals={...planningProposals,production_director:structuredClone(saved.contributions.production_director!)};
 }else if(planningProposals){
  if(!correctionLocalFailure||(failedTasks!==0&&!((timedOutPendingEvidence||inputRejectedPendingEvidence)&&failedTasks===1))||nativeByRole.has(failedRole)||!full||!pendingEvidence&&submissions.some(s=>String(JSON.parse(String(s.payload)).eventId).startsWith(`${runId}:${failedRole}:`)))fail();
 }else if(!ids.length){
  // The next role can be held locally before its first native request. The
  // complete earlier prefix was independently replayed above; no submission
  // or unresolved receipt for this role may be hidden by an empty task list.
  if(!reconciliationBudgetFailure||failedTasks!==0||nativeByRole.has(failedRole)||submissions.some(s=>String(JSON.parse(String(s.payload)).eventId).startsWith(`${runId}:${failedRole}:`)))fail();
 }else if(RETAINABLE_CHAPTER_DETAIL_ROLES.includes(failedRole)){
  if(!full||!reconciliationBudgetFailure||failedTasks!==0||rollupRetry&&!pendingEvidence||nativeByRole.has(failedRole))fail();
  reconcileResponses=true;
 }else if(completedCameraReply){
  if(!full||failedTasks!==0||!rollupRetry||failedRole!=='cinematographer')fail();
 }else if(full){
  if(reconciliationFailure||reconciliationBudgetFailure?failedTasks!==0:failedTasks!==1||!failedRollup)fail();
  if(reconciliationBudgetFailure&&rollupRetry)fail();
  let conflict=false;try{mergeShotTaskOutputs(structuredClone(tasks));}catch(error){if((error as Error).message===conflictMessage)conflict=true;else throw error;}
  if((!conflict&&!parent?.reconcileResponses)||nativeByRole.has(failedRole))fail();reconcileResponses=true;
 }else{
  // A scoped singleton can be held locally before submission too. Every
  // earlier request must have a complete receipt; no native failure is hidden.
  if(reconciliationFailure||(reconciliationBudgetFailure?failedTasks!==0||rollupRetry:failedTasks!==1))fail();
  reconcileResponses=tasks.some(t=>t.objectionResponses?.some(r=>r.outcome!=='carried'));
 }
 // A valid Director proposal cannot close foreign blockers. Retain the exact
 // unaffected prefix and send current complete proposals to the original owners.
 // The ordinary roster then reruns the challenger suffix and final Director.
 let followupRoles=completedRoles,followupRole=failedRole;
 if(heldOwnerFollowup){
  const open=record.objections.filter(o=>o.status==='open'&&o.severity==='blocking');
  const challengers:CrewRole[]=['fidelity_challenger','clarity_challenger','feasibility_challenger'];
  if(!open.length||open.some(o=>!challengers.some(role=>role===o.owner)))fail();
  const first=roles.findIndex(role=>open.some(o=>o.owner===role));
  if(first<roles.indexOf('fidelity_challenger'))fail();
  followupRoles=roles.slice(0,first);followupRole=roles[first]!;
  planningProposals=structuredClone(saved.contributions);
 }
 const resume:Verified['resume']={contributions:structuredClone(saved.contributions),completedRoles:followupRoles,calls:saved.calls,inferenceCalls:saved.inferenceCalls,failedRole:followupRole,previousError:heldOwnerFollowup?'Fresh original-owner follow-up: the latest Director proposal requires original-owner reassessment; saved foreign blockers remain. Inspect current complete reviews and explicitly reconsider only your owned objections; no prior approval or closure is inherited.':heldDirector?'Fresh Director owner correction after an exact-input indexed-instruction hold; previous held verdict remains archived. '+saved.summary:String(events.at(-1)!.error)};
 const extendedLimits=Object.keys(evidenceRoundLimits).length?evidenceRoundLimits:undefined;
 return{planningProposals,evidenceRoundLimits:extendedLimits,resume,tasks,record:structuredClone(record),reconcileResponses,completedCameraReply,pendingEvidence,provenance:{sourceRunId:runId,sourceResultSha256:sha(String(source.result_json)),briefHash:hash,completedRoles:followupRoles,failedRole:followupRole,completedTaskShots:ids,...(failedRole==='cinematographer'?{completedCameraShots:ids}:{}),responseReconciliationRequired:reconcileResponses,...(pendingEvidence?{pendingEvidence}:{}),receipts,...(extendedLimits?{evidenceRoundLimits:extendedLimits}:{}),...(recordedPlanningSource?{recordedPlanningSource}:{}),...(timedOutPendingEvidence?{timedOutPendingEvidence}:{}),...(inputRejectedPendingEvidence?{inputRejectedPendingEvidence}:{}),newProviderCalls:0,limitation:heldOwnerFollowup?'Exact-input original challenger follow-up after a verified complete held planning review. Unaffected prefix, full current proposals, original issue states and every receipt/counter retained; normal owner dispositions and fresh Director acceptance required.':heldDirector?'Fresh exact-input Director owner correction after a verified pure held verdict with indexed own instructions. Fourteen completed reviews and all calls/receipts retained; no old pending retrieval replay, inherited acceptance or issue disposition.':'Exact unfinished initial technical-role continuation; all concerns, counts and normal acceptance remain. No inherited chapter approval.'}};
}
