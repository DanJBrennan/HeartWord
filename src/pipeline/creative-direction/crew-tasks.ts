import {historicalSettingDecisions} from "../historical-setting.js";
import type {CrewBrief,CrewResult,CrewRole,CrewContribution,ReviewMedia} from "./crew-types.js";
import {PLANNING_ROLES,FINISHING_ROLES} from "./crew-types.js";
import {crewPacket,encodeCrewPacket,crewInputBudget} from "./crew-packet.js";
import {recordHash,projectFilm,type ProductionRecord} from "./production-record.js";
import type {GeminiJsonSchema} from "../../providers/gemini-text.js";
import {codexInputBudget,codexOutputSchema} from "../../providers/codex-text.js";

export const SHOT_TASK_ROLES:readonly CrewRole[]=["cinematographer","choreographer","staging_designer","production_designer","costume_designer","lighting_designer"];
export const RETAINABLE_CHAPTER_DETAIL_ROLES:readonly CrewRole[]=['script_supervisor','sound_designer','composer','picture_editor','fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'];
const CHAPTER_TASK_ROLES=RETAINABLE_CHAPTER_DETAIL_ROLES;
const verseNumbers=(ref:string|null|undefined):number[]=>{const m=ref?.match(/(?:v|:)?(\d+)(?:[-–](\d+))?$/);if(!m)return[];const a=Number(m[1]),b=Number(m[2]??m[1]);return b>=a&&b-a<200?Array.from({length:b-a+1},(_,i)=>a+i):[];};
/** Keep accepted semantic differences explicitly; unchanged baseline facts are
 * already represented by the brief. Exact before-facts are retrieved, never
 * reconstructed for a mutation. Prior media reviews are indexed, not approvals. */
export function chapterCrewPacket(brief:CrewBrief,contributions:CrewResult["contributions"],record:ProductionRecord|undefined,role?:CrewRole){
 const packet=crewPacket(brief,contributions,record);
 const baseline=record?projectFilm(brief,record.revision,record.briefHash,record.inputRevision,record.parentRevision):[];
 const differences:any[]=[];
 for(const snapshot of record?.snapshots??[])for(const layer of ["world","states","shots","keyframes"] as const)for(const entity of snapshot[layer])for(const [key,fact]of Object.entries(entity.facts)){
  const original=baseline.find(s=>s.context.sceneId===snapshot.context.sceneId)?.[layer].find(e=>e.id===entity.id)?.facts[key];
  if(!original||original.value!==fact.value||original.status!==fact.status||original.owner!==fact.owner)differences.push({sceneId:snapshot.context.sceneId,layer,entityId:entity.id,fact:key,valueChanged:!original||original.value!==fact.value,...(!original||original.value!==fact.value?{currentValue:fact.value}:{}),status:fact.status,owner:fact.owner});
 }
 const latest=new Map<string,string>();for(const h of record?.history??[])if(h.kind==='proposal'||h.kind==='revision')latest.set(h.owner,h.id);
 const historyIndex=(packet.productionRecord?.history??[]).filter(h=>!h.proposedChanges.length&&(h.kind==='proposal'||h.kind==='revision')&&(h.id.startsWith(`${record?.revision}:`)||latest.get(h.owner)===h.id)).map(h=>({id:h.id,owner:h.owner,kind:h.kind,sha256:recordHash(h)}));
 const currentIds=new Set(Object.values(contributions).flatMap(c=>(c?.exchange??[]).map(h=>h.id)));
 const pendingLinks=new Set((packet.productionRecord?.history??[]).filter(h=>h.proposedChanges.length).flatMap(h=>[...h.objections,...h.relatedContributions]));
 const knownOwners=new Set<string>([...PLANNING_ROLES,...FINISHING_ROLES]);
 const indexedIssues=role?(packet.productionRecord?.objections??[]).filter(o=>knownOwners.has(o.owner)&&o.owner!==role&&!currentIds.has(o.id)&&!pendingLinks.has(o.id)&&['advisory','blocking'].includes(o.severity)&&(o.status==='resolved'||o.status==='open'&&o.severity==='advisory')):[];
 const indexedIds=new Set(indexedIssues.map(o=>o.id));
 return{...packet,brief:{...brief,audioAssets:role==="composer"||role==="sound_designer"?brief.audioAssets:brief.audioAssets.map(a=>({id:a.id,kind:a.kind,sha256:a.sha256,durationMs:a.durationMs})),mediaReviewEvidence:brief.mediaReviewEvidence?.map(e=>({id:e.id,shotId:e.shotId,createdAt:e.createdAt})),
  render:brief.render?{...brief.render,finishing:brief.render.finishing?{...brief.render.finishing,previousDecisions:role&&brief.render.finishing.previousDecisions[role]?{[role]:brief.render.finishing.previousDecisions[role]}:{}}:undefined}:null},
  productionRecord:packet.productionRecord?{...packet.productionRecord,snapshots:[],history:packet.productionRecord.history.filter(h=>h.proposedChanges.length),objections:packet.productionRecord.objections.filter(o=>!indexedIds.has(o.id))}:undefined,
  ...(role?{chapterIssueIndex:indexedIssues.map(o=>({id:o.id,owner:o.owner,shotId:o.shotId,severity:o.severity,status:o.status,...(o.status==='open'&&o.severity==='advisory'&&o.shotId===null?{globalAdvisoryRequest:o.requestedChange}:{})})),
   chapterIssueArchive:{count:indexedIssues.length,sha256:recordHash(indexedIssues),access:'Derive contribution:<id> from each issue index row. Retrieve the exact issue before relying on its evidence; its resolutionId identifies resolution evidence. The fullRecordSha256 pins the complete source record.'},
   chapterIssueIndexPolicy:'Owned findings, all open blockers, current exchange findings, unknown records and substantive pending-proposal links retain full bodies. Historical foreign advisories and resolved findings are indexed; complete open global advisory actions remain supplied. Indexing never clears an issue, approves a change or means omitted evidence was read. Retrieve contribution:<id> before discussing indexed substantive evidence or relying on it. The complete durable record still controls acceptance; approved constraints remain in the brief and accepted fact differences.',
   audit:{...packet.audit,retainedContributionIds:undefined,retainedContributionIndex:{count:packet.audit?.retainedContributionIds?.length??0,sha256:recordHash(packet.audit?.retainedContributionIds??[]),access:'Selected archive IDs are not another copy of supplied history. Current and latest role IDs remain in historyIndex; exact history is retrievable with history_page:<offset> or contribution:<id>.'}}}:{}),
  historyIndex,historyArchive:{count:record?.history.length??0,sha256:recordHash(record?.history??[]),access:'No-change historical prose and links are archived, not reviewed. Retrieve exact contribution:<id> or history_page:<offset>. Current issues, substantive proposals and facts remain explicit.'},
  acceptedFactDifferences:differences,snapshotIndex:record?.snapshots.map(s=>({sceneId:s.context.sceneId,revision:s.revision,sha256:recordHash(s)}))??[],
  archiveAccess:"Request exact contribution:<id>, shot:<id>, producer_note:<id>, audio_asset:<id>, media_review:<id>, previous_role:<role>, fact:[sceneId,layer,entityId,factName], or history_page:<offset>. For complete instruction verification use contribution:<id>#/roleOutput/directions (the ENTIRE exact array), not the full contribution archive. For current role evidence prefer #/roleOutput/directions, #/roleOutput/objectionResponses, #/roleOutput/emotionalTreatment, #/roleOutput/treatmentReview, #/roleOutput/findings or #/roleOutput/summary; the same selectors work with previous_role:<role>. Use direction_shot:<contribution-id>:<shot-id> for one direction. Full contributions ALSO include large archived exchanges and may never fit. Request a full archive only when its historical exchange itself is needed; a directions leaf supplies every instruction without that history. directionSources provides exact leaf locators. An unfulfilled full-archive request remains unread and cannot authorize approval. Field selections are partial evidence, never full-contribution acknowledgement. Two evidence rounds maximum; no filesystem tools or whole-history replay.",
  stateReadPolicy:"Brief provides baseline intent; acceptedFactDifferences retain changed values/status/owner; valueChanged=false means the baseline brief value is unchanged. Exact authority/evidence stays pinned by snapshotIndex hashes; retrieve exact facts when needed. Snapshots are indexed, not supplied. Request exact fact:[sceneId,layer,entityId,factName] before ANY filmChanges. Entity IDs and keys are exact: per-shot light normally uses layer states, entity state:<shotId>, key light.direction, not a scene-wide lighting entry. A known-scene absent lookup returns only actual entity/key hints, never a before-fact. Never reconstruct a before-fact. Request media_review:<id> for prior QC evidence; archived reviews never approve current pixels."};
}
/** A task projection only. It never replaces the immutable brief/record. Unknown
 * producer-note subjects remain global rather than being guessed irrelevant. */
export function scopedCrewPacket(brief:CrewBrief,contributions:CrewResult["contributions"],record:ProductionRecord|undefined,shotIds:readonly string[],role?:CrewRole){
 const targets=new Set(shotIds),knownShots=new Set(brief.shots.map(s=>s.id));
 if(!targets.size||[...targets].some(id=>!knownShots.has(id)))throw new Error("Task scope contains foreign/empty shot IDs");
 const context=new Set(targets);
 for(const [i,s] of brief.shots.entries())if(targets.has(s.id)){
  for(const adjacent of [brief.shots[i-1],brief.shots[i+1]])if(adjacent)context.add(adjacent.id);
  const text=JSON.stringify(s);for(const id of knownShots)if(text.includes(id))context.add(id);
 }
 const shots=brief.shots.filter(s=>context.has(s.id)),scenes=new Set(shots.map(s=>s.sceneId)),characters=new Set(shots.flatMap(s=>s.characterIds)),versions=new Set(brief.canon.filter(c=>characters.has(c.id)).map(c=>c.versionId));
 const knownSubjects=new Set([...knownShots,...brief.shots.map(s=>s.sceneId),...brief.canon.flatMap(c=>[c.id,c.versionId]),...brief.shots.flatMap(s=>[s.clip,...s.availableClips??[]].flatMap(c=>c?[c.id]:[]))]);
 const applicableSubjects=new Set([brief.project.id,...context,...scenes,...characters,...versions,...shots.flatMap(s=>[s.clip,...s.availableClips??[]].flatMap(c=>c?[c.id]:[]))]);
 const wanted=new Set(shots.flatMap(s=>verseNumbers(s.verseRef)));
 const relevantEntity=(id:string)=>!knownShots.has(id.replace(/^state:/,""))||context.has(id.replace(/^state:/,""));
 const treatment=(t:NonNullable<CrewContribution["emotionalTreatment"]>)=>{const beats=t.beats.filter(b=>b.shotIds.some(id=>context.has(id))),ids=new Set(beats.map(b=>b.id));return{...t,beats,pauses:t.pauses.filter(p=>ids.has(p.beatId)),cues:t.cues.filter(c=>ids.has(c.beatId))};};
 const structuredNote=(note:string)=>{const at=note.indexOf("\n{");if(at<0)return note;try{return{prefix:note.slice(0,at+1),json:JSON.parse(note.slice(at+1)),originalTextSha256:recordHash(note),encoding:"Embedded JSON members preserved; original text available by producer_note ID."};}catch{return note;}};
 const full=chapterCrewPacket(brief,contributions,record);
 // Actual finding.shotId is authoritative for old envelopes whose inherited
 // scope incorrectly covered the whole chapter. Unknown/global/owned findings
 // retain their complete bodies. Only specialist projections use this index.
 const indexed=new Map((full.productionRecord?.objections??[]).filter(o=>role&&o.owner!==role&&
  ((o.shotId===null&&(o.status==='resolved'||o.severity==='advisory'))||(o.shotId!==null&&knownShots.has(o.shotId)&&!context.has(o.shotId)))).map(o=>[o.id,o]));
 const roleProseIndex:Array<{role:string;ref:string;summarySha256:string;objectionResponses:Array<{objectionId:string;outcome:string;sha256:string}>}>=[];
 const narrow=(output:CrewContribution,owner:string):CrewContribution=>{
  // As in crewPacket, exchange envelopes belong only in the retained record.
  // Reintroducing them here duplicates whole-chapter scopes in every task.
  const {exchange:_duplicate,taskSummaries,...current}=output;
  const primary=output.exchange?.find(h=>h.kind==='proposal'||h.kind==='revision'),indexProse=Boolean(role&&owner!==role&&primary);
  if(indexProse)roleProseIndex.push({role:owner,ref:`contribution:${primary!.id}`,summarySha256:recordHash(output.summary),objectionResponses:(output.objectionResponses??[]).map(r=>({objectionId:r.objectionId,outcome:r.outcome,sha256:recordHash(r)}))});
  return {...current,...(taskSummaries?{taskSummaries:taskSummaries.filter(t=>t.shotIds.some(id=>context.has(id)))}:{}),...(indexProse?{summary:`Whole-role summary indexed at contribution:${primary!.id}; current task directions, findings and disposition index supplied. Exact omitted prose has not been read.`}:{}),...(output.emotionalTreatment?{emotionalTreatment:treatment(output.emotionalTreatment)}:{}),directions:output.directions.filter(d=>context.has(d.shotId)),findings:output.findings.filter((f,i)=>(f.shotId===null||context.has(f.shotId))&&!indexed.has(`${primary?.id}:finding:${i}`)),
   ...(output.filmChanges?{filmChanges:output.filmChanges.filter(c=>relevantEntity(c.target.entityId))}:{}),
   ...(output.objectionResponses?{objectionResponses:indexProse?[]:output.objectionResponses.filter(r=>!indexed.has(r.objectionId))}:{})};
 };
 const scopedBrief:CrewBrief={...brief,shots,source:{...brief.source,text:wanted.size?brief.source.text.filter(v=>wanted.has(v.verse)):brief.source.text,
  reference:wanted.size?brief.source.reference.filter(v=>wanted.has(v.verse)):brief.source.reference},
  audio:brief.audio.filter(a=>shots.some(s=>s.sourceSegmentId===a.id||s.utterance&&s.utterance.startMs<a.endMs&&s.utterance.endMs>a.startMs)||verseNumbers(a.verseRef).some(v=>wanted.has(v))),
  canon:brief.canon.filter(c=>characters.has(c.id)),producerNotes:brief.producerNotes.filter(n=>!knownSubjects.has(n.subjectId)||applicableSubjects.has(n.subjectId)),
  appliedLessons:brief.appliedLessons?.filter(n=>!n.subjectId||!knownSubjects.has(n.subjectId)||applicableSubjects.has(n.subjectId)),
  mediaReviewEvidence:brief.mediaReviewEvidence?.filter(e=>context.has(e.shotId)),
  render:brief.render?{...brief.render,timeline:brief.render.timeline.filter(t=>t.shotId&&context.has(t.shotId)),finishing:undefined}:null};
 const scopedContributions=Object.fromEntries(Object.entries(contributions).map(([r,c])=>[r,narrow(c!,r)]));
 // Current role outputs, fact differences and objection bodies already carry
 // task state. Older no-change exchange prose is history, not another copy of
 // that state. Index it without dropping pending substantive fact proposals.
 const archivedExchanges=(record?.history??[]).filter(h=>!h.proposedChanges.length);
 const latestByOwner=new Map<string,string>();
 for(const h of record?.history??[])if(h.kind==='proposal'||h.kind==='revision')latestByOwner.set(h.owner,h.id);
 const exchangeIndex=role?archivedExchanges.filter(h=>h.id.startsWith(`${record?.revision}:`)||latestByOwner.get(h.owner)===h.id).map(h=>({
  id:h.id,owner:h.owner,kind:h.kind,inputRevision:h.inputRevision,sha256:recordHash(h),
  ...(h.supersedes?{supersedes:h.supersedes}:{}),
  scope:{taskShotCount:h.scope.shotIds.filter(id=>context.has(id)).length,totalShotCount:h.scope.shotIds.length},
  ...(h.resolution?{resolutionOutcome:h.resolution.outcome}:{}),
 })):[];
 const exchangeIds=new Set(role?archivedExchanges.map(h=>h.id):[]);
 const projected=full.productionRecord?{...full.productionRecord,
  snapshots:[],
  history:full.productionRecord.history.filter(h=>!exchangeIds.has(h.id)&&!indexed.has(h.id)&&!(h.kind==="resolution"&&h.resolution?.objectionDispositions.length&&h.resolution.objectionDispositions.every(d=>indexed.has(d.objectionId))))
   .map(h=>({...h,scope:{...h.scope,shotIds:h.scope.shotIds.filter(id=>context.has(id)),sceneIds:h.scope.sceneIds.filter(id=>scenes.has(id)),audioBindingRefs:h.scope.audioBindingRefs.filter(id=>scopedBrief.audio.some(a=>a.id===id))},proposedChanges:h.proposedChanges.filter(c=>relevantEntity(c.target.entityId))})),
  objections:full.productionRecord.objections.filter(o=>!indexed.has(o.id))
 }:undefined;
 const taskSummarySources:Array<{owner:string;contributionId:string;taskNumbers:number[];indexSha256:string}>=[],taskSummaryIndex:Array<{source:number;task:number;shotIds:string[];sha256:string}>=[];
 for(const [owner,c]of Object.entries(contributions)){
  const primary=c?.exchange?.find(h=>h.kind==='proposal'||h.kind==='revision');
  if(!primary||!c?.taskSummaries?.length)continue;
  const source=taskSummarySources.length;taskSummarySources.push({owner,contributionId:primary.id,taskNumbers:c.taskSummaries.map(t=>t.task),indexSha256:recordHash(c.taskSummaries.map(({summary:_prose,...scope})=>scope))});
  for(const t of c.taskSummaries.filter(t=>t.shotIds.some(id=>context.has(id))))taskSummaryIndex.push({source,task:t.task,shotIds:t.shotIds,sha256:recordHash(t)});
 }
 return {...full,historicalDecisions:historicalSettingDecisions(scopedBrief.project,[...new Set(scopedBrief.shots.map(s=>s.sceneSequence))]),brief:{...scopedBrief,audioAssets:[],
    producerNotes:scopedBrief.producerNotes.map(n=>({...n,note:structuredNote(n.note)})),
    ...(scopedBrief.acceptedEmotionalTreatment?{acceptedEmotionalTreatment:{...scopedBrief.acceptedEmotionalTreatment,treatment:treatment(scopedBrief.acceptedEmotionalTreatment.treatment)}}:{})},contributions:scopedContributions,productionRecord:projected,acceptedFactDifferences:full.acceptedFactDifferences.filter(d=>relevantEntity(d.entityId)),
  task:{shotIds:[...targets],continuityShotIds:[...context].filter(id=>!targets.has(id)),chapterOverview:[...new Set(brief.shots.map(s=>s.sceneId))].map(id=>({sceneId:id,shotCount:brief.shots.filter(s=>s.sceneId===id).length,verseRefs:[...new Set(brief.shots.filter(s=>s.sceneId===id).map(s=>s.verseRef))]})),
   limitation:"Author only task shot IDs. Adjacent/dependent shots are continuity evidence. Source/reference verses cover this task; chapter scene/treatment overview is not approval to change other shots. Other verses are unobserved unless requested via source_verse:<number>. Exact original exchanges can be requested."},
  exchangeIndex,roleProseIndex,
  ...(role?{archivedExchangeIndex:{revision:record?.revision,inputRevision:record?.inputRevision,total:archivedExchanges.length,indexed:exchangeIndex.length,sha256:recordHash(archivedExchanges),access:'Current-revision exchanges and latest role proposals are indexed. Earlier exact records remain available via contribution:<id>, previous_role:<role>, or history_page:<offset>. Omitted history has not been read and does not approve or resolve anything.'}}:{}),
  taskSummarySources,taskSummaryIndex,
  taskSummaryReadPolicy:'Each task summary index source selects taskSummarySources[source]. Derive exact evidence ref task_summary:<contributionId>:<task>. Relevant summaries/scopes are supplied. Other task numbers are listed per source; retrieve exact task_summary:<contributionId>:<task> or task_summary_shot:<contributionId>:<shotId> for omitted scope/prose. Omitted records remain unobserved.', 
  exchangeReadPolicy:"Current contributions, brief, fact differences and issue bodies supply task state. No-change exchanges are indexed, not read: ID/hash/owner/input revision/supersession/scope counts/outcome. Exact scope, links and prose require contribution:<id> retrieval. Pending fact proposals retain bodies. Retrieve indexed proposals before acknowledgement, withdrawal or reliance on their evidence. Indexing never resolves issues or approves proposals.",
  offTaskIssueIndex:[...indexed.values()].map(o=>({id:o.id,owner:o.owner,shotId:o.shotId,severity:o.severity,status:o.status,confidence:o.confidence,sha256:recordHash(o),...(o.shotId===null&&o.status==='open'&&o.severity==='advisory'?{advisoryRequest:o.requestedChange}:{}),...(o.resolutionId?{resolutionRef:`contribution:${o.resolutionId}`}:{})})),
  offTaskOpenBlockingCount:[...indexed.values()].filter(o=>o.status==="open"&&o.severity==="blocking").length,
  issueIndexPolicy:"Indexed findings retain owner/status; their evidence is unobserved. Derive contribution:<id> and retrieve it before discussing substantive evidence or proposing a dependent change. Open global BLOCKING, unknown, affected-shot and owned findings keep full bodies. Foreign global advisories keep their complete requested action in advisoryRequest, with evidence indexed; it remains an advisory, not an approved constraint. Foreign resolved global history is indexed. Approved constraints stay in brief/fact differences. The full record controls acceptance; no scoped packet clears another owner's finding.",
  audit:{...full.audit,...(role?{retainedContributionIds:undefined,archivedAncestryLinks:undefined,archivedAncestryIndex:{count:full.audit?.archivedAncestryLinks?.length??0,sha256:recordHash(full.audit?.archivedAncestryLinks??[]),access:'Exact links are retained in original exchanges; retrieve contribution:<id> or history_page:<offset>.'}}:{}),fullBriefSha256:recordHash(brief),audioAssetCatalog:{count:brief.audioAssets.length,sha256:recordHash(brief.audioAssets)},omittedSourceVerses:brief.source.text.filter(v=>!scopedBrief.source.text.includes(v)).map(v=>v.verse),
   omittedReferenceVerses:brief.source.reference.filter(v=>!scopedBrief.source.reference.includes(v)).map(v=>v.verse),
   evidenceIndex:role?[]:record?.history.slice(-40).map(h=>({id:`contribution:${h.id}`,owner:h.owner,kind:h.kind}))??[],
   archiveAccess:"Request exact task_summary:<contribution-id>:<task-number>, contribution:<id>, source_verse:<number>, shot:<id>, producer_note:<id>, audio_asset:<id>, or history_page:<offset>. No omitted item has been read by the model."}};
}

export function retrieveCrewEvidence(brief:CrewBrief,record:ProductionRecord|undefined,refs:readonly string[],retainedContributions:Readonly<Record<string,CrewContribution>>={},currentProposal?:{role:CrewRole;proposal:CrewContribution}):Record<string,unknown>{
 if(!refs.length||refs.length>12||new Set(refs).size!==refs.length)throw new Error("Evidence request must name 1-12 distinct saved records");
 return Object.fromEntries(refs.map(ref=>{
  if(/^(contribution:|previous_role:)/.test(ref)&&ref.includes('#')){
   const at=ref.indexOf('#'),base=ref.slice(0,at),pointer=ref.slice(at+1),parts=pointer.slice(1).split('/');
   if(!pointer.startsWith('/')||pointer.length>256||parts.length>8||parts.some(p=>!p||/~(?![01])/.test(p))||pointer.includes('#'))throw Error('Invalid saved evidence field selector');
   const original=retrieveCrewEvidence(brief,record,[base],retainedContributions)[base] as {sha256:string;value:unknown};
   let selected=original.value,present=true;
   for(const part of parts){
    const key=part.replace(/~1/g,'/').replace(/~0/g,'~');
    if(selected===null||typeof selected!=='object'||!Object.hasOwn(selected,key)){present=false;break;}
    selected=(selected as Record<string,unknown>)[key];
   }
   if(selected===undefined)present=false;
   const value=present?selected:{status:'field_not_recorded',sourceRef:base,pointer,notAnApproval:true};
   return[ref,{sha256:recordHash(value),value,selection:{sourceRef:base,sourceSha256:original.sha256,pointer,partial:true,present,notAnApproval:true}}];
  }
  let value:unknown;
  if(ref.startsWith('current_direction:')){
   const shotId=ref.slice('current_direction:'.length),directions=currentProposal?.proposal.directions.filter(d=>d.shotId===shotId);
   if(!brief.shots.some(s=>s.id===shotId)||directions?.length!==1)throw Error('Unknown current proposal direction');
   return[ref,{sha256:recordHash(directions[0]),value:structuredClone(directions[0]),source:{role:currentProposal!.role,proposalSha256:recordHash(currentProposal!.proposal),partial:true,notAnApproval:true}}];
  }
  if(ref.startsWith("fact:")){
   let locator:any;
   try{locator=JSON.parse(ref.slice(5));}catch{
    const invalid={status:'invalid_fact_reference',requestedRef:ref,reason:'invalid_json_locator',expectedFormat:'fact:[sceneId,layer,entityId,factName] with exactly one JSON array and no trailing prose',notAFact:true,notAnApproval:true,policy:'No lookup was performed and no before-fact is supplied. Re-request a syntactically valid exact locator; do not infer a value, silently strip prose or treat this error as evidence of the requested fact.'};
    return[ref,{sha256:recordHash(invalid),value:invalid,notAFact:true,invalidReference:true}];
   }
   if(!Array.isArray(locator)||locator.length!==4||locator.some(p=>typeof p!=="string")||!["world","states","shots","keyframes"].includes(locator[1]))throw new Error("Invalid exact fact locator");
   const [scene,layer,entity,key]=locator,snapshot=record?.snapshots.find(s=>s.context.sceneId===scene);const facts=snapshot?.[layer as "world"].find(e=>e.id===entity)?.facts;
   if(facts&&Object.hasOwn(facts,key))value=facts[key];
   else if(snapshot){
    const absent={status:'not_recorded',locator,sourceSnapshotSha256:recordHash(snapshot),notAFact:true,notAnApproval:true,
     availableInLayer:snapshot[layer as 'world'].map(e=>({entityId:e.id,factKeys:Object.keys(e.facts)})),
     policy:'This exact entity/fact is absent. The index gives actual IDs and keys, not substitute values. Retrieve a recorded fact before proposing any change; this absence cannot serve as a before-fact or clear a hold.'};
    return[ref,{sha256:recordHash(absent),value:absent,notAFact:true}];
   }
  }else if(ref.startsWith("previous_role:")){
   const role=ref.slice(14) as CrewRole,previous=brief.render?.finishing?.previousDecisions;
   const known=new Set<string>([...PLANNING_ROLES,...FINISHING_ROLES,"production_director","fidelity_challenger","clarity_challenger","feasibility_challenger"]);
   if(!known.has(role))throw new Error(`Missing or unsupported saved evidence: ${ref}`);
   if(previous&&Object.hasOwn(previous,role))value=previous[role];
   else{
    const contribution=record?.history.filter(h=>h.owner===role&&(h.kind==="proposal"||h.kind==="revision")).at(-1);
    value=contribution?{status:"recorded_contribution",role,contribution,roleOutput:retainedContributions[contribution.id],notAnApproval:true,limitations:"Retained proposal/revision and available exact role output, not a full model transcript or current approval."}
      :{status:"not_recorded",role,notAnApproval:true,evidence:"No previous recipe or role contribution exists in the supplied immutable production evidence. This explicit absence does not supply a review, resolve an objection or clear any approval gate."};
   }
  }else if(ref.startsWith("task_summary_shot:")){
   const locator=ref.slice(18),primary=record?.history.filter(h=>locator.startsWith(h.id+':')).sort((a,b)=>b.id.length-a.id.length)[0];
   const shotId=primary?locator.slice(primary.id.length+1):'';
   if(primary&&brief.shots.some(s=>s.id===shotId)){
    const summaries=retainedContributions[primary.id]?.taskSummaries?.filter(t=>t.shotIds.includes(shotId));
    if(summaries?.length)value={contributionId:primary.id,shotId,summaries};
   }
  }else if(ref.startsWith('direction_shot:')){
   const locator=ref.slice(15),primary=record?.history.filter(h=>locator.startsWith(h.id+':')).sort((a,b)=>b.id.length-a.id.length)[0];
   const shotId=primary?locator.slice(primary.id.length+1):'';
   if(primary&&brief.shots.some(s=>s.id===shotId))value=retainedContributions[primary.id]?.directions.find(d=>d.shotId===shotId);
  }else if(ref.startsWith("task_summary:")){
   const locator=ref.slice(13),at=locator.lastIndexOf(':'),id=locator.slice(0,at),task=Number(locator.slice(at+1));
   if(record?.history.some(h=>h.id===id))value=retainedContributions[id]?.taskSummaries?.find(t=>t.task===task);
  }else if(ref.startsWith("media_review:"))value=brief.mediaReviewEvidence?.find(e=>e.id===ref.slice(13));
  else if(ref.startsWith("snapshot:"))value=record?.snapshots.find(s=>s.context.sceneId===ref.slice(9));
  else if(ref.startsWith("contribution:")){
   const contribution=record?.history.find(h=>h.id===ref.slice(13));
   const finding=record?.objections.find(o=>o.id===ref.slice(13));
   value=contribution&&(finding||retainedContributions[contribution.id])?{...contribution,
    ...(finding?{findingRecord:finding}:{}),...(retainedContributions[contribution.id]?{roleOutput:retainedContributions[contribution.id]}:{}),notAnApproval:true}:contribution;
  }
  else if(/^source_verse:\d+$/.test(ref)){
   const verse=Number(ref.slice(13)),source=brief.source.text.find(v=>v.verse===verse),reference=brief.source.reference.find(v=>v.verse===verse);
   if(source||reference)value={source:source??null,reference:reference??null,notAnApproval:true};
  }
  else if(ref.startsWith("audio_asset:"))value=brief.audioAssets.find(a=>a.id===ref.slice(12));
  else if(ref.startsWith("shot:"))value=brief.shots.find(s=>s.id===ref.slice(5));
  else if(ref.startsWith("producer_note:"))value=brief.producerNotes.find(n=>n.id===ref.slice(14));
  else if(/^history_page:\d+$/.test(ref)){const at=Number(ref.slice(13));if(at<(record?.history.length??0))value={entries:record!.history.slice(at,at+20).map(h=>({id:`contribution:${h.id}`,owner:h.owner,kind:h.kind,scope:h.scope})),nextOffset:at+20<record!.history.length?at+20:null};}
  if(value===undefined)throw new Error(`Missing or unsupported saved evidence: ${ref}`);
  return [ref,{sha256:recordHash(value),value}];
 }));
}

export function mergeShotTaskOutputs(outputs:CrewContribution[]):CrewContribution{
 const result:Record<string,any>={summary:outputs.map((o,i)=>`Task ${i+1}: ${o.summary}`).join("\n"),directions:[],findings:[]};
 if(result.summary.length>12000){
  result.taskSummaries=outputs.map((o,i)=>({task:i+1,shotIds:o.directions.map(d=>d.shotId),summary:o.summary}));
  result.summary=`Combined ${outputs.length} completed shot tasks. Exact task explanations are retained in taskSummaries, with their shot scopes; all directions and findings remain explicit. This is a proposal, not chapter or film approval.`;
 }
 const explanations=new Map<string,{rationale:Set<string>;evidence:Set<string>}>();
 const allowed=new Set(["summary","directions","findings","filmChanges","ownerResponses","objectionResponses","withdrawals","creativeResponses"]);
 for(const output of outputs)for(const [key,value] of Object.entries(output)){
  if(!allowed.has(key))throw new Error(`Unexpected shot-task output field: ${key}`);
  if(key==="summary"||value===undefined)continue;
  if(!Array.isArray(value))throw new Error(`Shot-task array expected: ${key}`);
  const dest:Record<string,unknown>[]=(result[key]??=[]);
  for(const item of value){
   const identity=key==="directions"?item.shotId:key==="filmChanges"?JSON.stringify(item.target):key==="ownerResponses"||key==="withdrawals"?item.contributionId:key==="objectionResponses"?item.objectionId:key==="creativeResponses"?item.findingId:JSON.stringify(item);
   const previous=dest.find(d=>(key==="directions"?d.shotId:key==="filmChanges"?JSON.stringify(d.target):key==="ownerResponses"||key==="withdrawals"?d.contributionId:key==="objectionResponses"?d.objectionId:key==="creativeResponses"?d.findingId:JSON.stringify(d))===identity);
   if(previous&&JSON.stringify(previous)!==JSON.stringify(item)){
    // One role can assess the same retained issue from neighboring tasks.
    // Equal dispositions with different explanations are supporting evidence,
    // not contradictory decisions. Keep every exact explanation, bounded by
    // the normal exchange limit; never vote between opposing outcomes.
    if((key==='ownerResponses'||key==='objectionResponses')&&previous.outcome===item.outcome&&
      Object.keys(item).every(k=>['contributionId','objectionId','outcome','rationale','evidence'].includes(k))){
     const id=JSON.stringify([key,identity]),parts=explanations.get(id)??{rationale:new Set([String(previous.rationale)]),evidence:new Set([String(previous.evidence)])};
     for(const field of ['rationale','evidence'] as const){
      parts[field].add(String(item[field]));const combined=[...parts[field]].join(`\nAdditional task ${field}:\n`);
      if(combined.length>12000)throw new Error(`Combined ${key} explanation exceeds exchange bound; no evidence truncated`);
      previous[field]=combined;
     }
     explanations.set(id,parts);continue;
    }
    throw new Error(`Conflicting ${key} across shot tasks; no implicit overwrite`);
   }
   if(!previous)dest.push(structuredClone(item));
  }
 }
 return result as CrewContribution;
}

/** Pin source identifiers in the decoder schema as well as the semantic
 * validator. Long chapter reviews must copy actual IDs, never regenerate a
 * nearly matching UUID. This does not repair or accept a foreign response. */
export function taskSchema(template:GeminiJsonSchema,knownIds:string[],targetIds:string[],keyedDirections=false){
 const schema:any=structuredClone(template);
 const visit=(node:any)=>{
  if(!node||typeof node!=="object")return;
  if(node.properties?.shotId&&knownIds.length)node.properties.shotId={...node.properties.shotId,enum:knownIds};
  if(node.properties?.shotIds?.items&&knownIds.length)node.properties.shotIds.items={...node.properties.shotIds.items,enum:knownIds};
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==="object")visit(value);
 };
 visit(schema);
 if(targetIds.length&&schema.properties?.directions?.items?.properties?.shotId)schema.properties.directions.items.properties.shotId.enum=targetIds;
 if(keyedDirections&&targetIds.length&&schema.properties?.directions?.items?.properties){
  const {shotId:_id,...properties}=schema.properties.directions.items.properties;
  const value={type:'object',properties,required:Object.keys(properties),additionalProperties:false};
  schema.properties.directions={anyOf:[
   {type:'object',properties:Object.fromEntries(targetIds.map(id=>[id,structuredClone(value)])),required:targetIds,additionalProperties:false},
   {type:'object',properties:{},required:[],additionalProperties:false}
  ]};
 }
 return schema;
}

/** The wire map prevents duplicate or missing IDs at decoding. Persist the
 * established contribution array, with no inferred identifier repairs. */
export function normalizeTaskDirections(output:Record<string,unknown>,targetIds:string[]):Record<string,unknown>{
 const directions=output.directions;
 if(Array.isArray(directions))return output; // retained legacy replies and callers
 if(!directions||typeof directions!=='object')throw Error('Task directions must be a shot-keyed object');
 const map=directions as Record<string,unknown>;
 if(Object.keys(map).length!==targetIds.length||Object.keys(map).some(id=>!targetIds.includes(id))||targetIds.some(id=>!Object.hasOwn(map,id)))throw Error('Task directions must cover exactly its own shot IDs');
 return {...output,directions:targetIds.map(shotId=>{
  const value=map[shotId];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.hasOwn(value,'shotId'))throw Error('Keyed task direction must not contain an inner shotId');
  return {shotId,...value};
 })};
}

type CrewTaskInput={prompt:string;schema:GeminiJsonSchema;media:ReviewMedia[];role:CrewRole;phase:string;brief:CrewBrief;contributions:CrewResult["contributions"];record?:ProductionRecord;
 maxShotTaskSize?:number; retainedShotTasks?:readonly CrewContribution[]; reconcileRetainedResponses?:boolean;
 pendingEvidence?:import('./crew-types.js').PendingCrewEvidence;maxEvidenceRounds?:2|3;
 reviewRecordedProposal?:boolean;
 completedTaskMerge?:(outputs:CrewContribution[])=>CrewContribution;
 retainedContributions?:Readonly<Record<string,CrewContribution>>;
 specialistBytes:number;chapterBytes:number;call:(prompt:string,schema:GeminiJsonSchema,media:ReviewMedia[])=>Promise<unknown>;validate:(raw:unknown)=>CrewContribution;
 onRequest:(prompt:string)=>void;
 taskMode?:'chapter-detail'|'chapter-rollup';rollup?:{proposal:CrewContribution;detailRequests:number;recordedProposalSource?:string;responseCandidates?:ReturnType<typeof shotTaskResponseReconciliation>['candidates']};};

/** Keep every original response for an explicit owner decision. Removing the
 * disputed dispositions from the provisional merge changes no issue lifecycle. */
export function shotTaskResponseReconciliation(outputs:readonly CrewContribution[]){
 const candidates=outputs.map((o,index)=>({task:index+1,shotIds:o.directions.map(d=>d.shotId),sourceSha256:recordHash(o),responses:structuredClone(o.objectionResponses??[])}));
 const proposal=mergeShotTaskOutputs(outputs.map(o=>{const{objectionResponses:_responses,...rest}=structuredClone(o);return rest;}));
 return{proposal,candidates};
}
export function normalizeResponseReconciliation(raw:Record<string,unknown>,proposal:CrewContribution,candidates?:ReturnType<typeof shotTaskResponseReconciliation>['candidates']){
 let output={...raw};
 if(Array.isArray(output.directions)&&output.directions.length===0)output.directions=structuredClone(proposal.directions);
 if(!Array.isArray(output.findings))throw Error('Chapter consolidation findings must be an array');
 output.findings=[...new Map([...proposal.findings,...output.findings].map(f=>[JSON.stringify(f),f])).values()];
 if(proposal.taskSummaries&&!output.taskSummaries)output.taskSummaries=structuredClone(proposal.taskSummaries);
 if(candidates){
  const needed=new Set(candidates.flatMap(c=>c.responses.map(r=>r.objectionId))),responses=output.objectionResponses as CrewContribution['objectionResponses'];
  if(!Array.isArray(responses)||new Set(responses.map(r=>r.objectionId)).size!==responses.length||[...needed].some(id=>!responses.some(r=>r.objectionId===id)))throw Error('Owner consolidation must explicitly answer every retained task issue exactly once');
 }
 return output;
}
function prepareOwnerResponseConsolidation(input:CrewTaskInput,results:CrewContribution[]){
 const {proposal,candidates}=shotTaskResponseReconciliation(results);
 if(proposal.directions.length!==input.brief.shots.length||new Set(proposal.directions.map(d=>d.shotId)).size!==input.brief.shots.length)throw Error('Issue reconciliation requires complete unique shot coverage');
 if(results.some(o=>Object.entries(o).some(([key,value])=>!['summary','directions','findings','objectionResponses'].includes(key)&&value!==undefined&&(!Array.isArray(value)||value.length))))throw Error('Issue-only reconciliation cannot retain executable or cross-domain task changes');
 const wanted=[...new Set(candidates.flatMap(c=>c.responses.map(r=>r.objectionId)))];
 if(!input.record||wanted.some(id=>!input.record!.objections.some(o=>o.id===id&&o.owner===input.role)))throw Error('Issue consolidation requires the actual accountable owner and saved issues');
 return{proposal,candidates,wanted};
}
function ownerResponseSchema(original:GeminiJsonSchema,shotCount:number,wanted:string[]){
 const schema:any=structuredClone(original),item=codexOutputSchema(schema.properties.directions.items);
 schema.properties.directions={anyOf:[{type:'array',items:item,maxItems:0},{type:'array',items:item,minItems:shotCount,maxItems:shotCount}]};
 const response=structuredClone(schema.properties.objectionResponses);
 response.items=codexOutputSchema(response.items);
 response.items.properties.objectionId={...response.items.properties.objectionId,enum:wanted};
 schema.properties.objectionResponses={anyOf:[{...response,maxItems:0},{...response,minItems:wanted.length,maxItems:wanted.length}]};
 schema.required=[...new Set([...(schema.required??[]),'objectionResponses'])];
 return schema;
}
async function reconcileShotTaskResponses(input:CrewTaskInput,results:CrewContribution[]){
 const {proposal,candidates,wanted}=prepareOwnerResponseConsolidation(input,results),schema=ownerResponseSchema(input.schema,input.brief.shots.length,wanted);
 return dispatchCrewTask({...input,schema,retainedShotTasks:undefined,reconcileRetainedResponses:false,taskMode:'chapter-rollup',rollup:{proposal,detailRequests:results.length,responseCandidates:candidates}});
}

/** Technical detail is genuinely current evidence. When it cannot fit in one
 * chapter request, inspect every shot in bounded parts and then require an
 * explicit whole-chapter consolidation. No part can approve the chapter. */
async function dispatchChapterReview(input:CrewTaskInput):Promise<CrewContribution>{
 const schema:any=structuredClone(input.schema),globalFields=['decision','decisionConfidence','decisionLimitations','acceptedContributionIds','acceptanceChecks'];
 // Whole-treatment judgments and executable recipes belong to the rollup,
 // never to independently merged shot parts. Planning creates no timed cut.
 const rollupFields=[...globalFields,'treatmentReview','craftAssessment','emotionalBeatChecks','audioCues','generationRequests','edits','pauses','editorialChecks','coverageRequests'];
 for(const key of rollupFields)delete schema.properties[key];
 if(schema.required)schema.required=schema.required.filter((k:string)=>!rollupFields.includes(k));
 let detailRequests=input.retainedShotTasks?.length??0,responseConsolidation:ReturnType<typeof prepareOwnerResponseConsolidation>|undefined;
 const proposal=await dispatchCrewTask({...input,schema,taskMode:'chapter-detail',rollup:undefined,pendingEvidence:undefined,
  completedTaskMerge:outputs=>{
   if(input.reconcileRetainedResponses&&outputs.some(o=>o.objectionResponses?.length)){responseConsolidation=prepareOwnerResponseConsolidation(input,outputs);return responseConsolidation.proposal;}
   try{return mergeShotTaskOutputs(outputs);}catch(error){
    if(String((error as Error).message)!=='Conflicting objectionResponses across shot tasks; no implicit overwrite')throw error;
    responseConsolidation=prepareOwnerResponseConsolidation(input,outputs);return responseConsolidation.proposal;
   }
  },
  onRequest:p=>{detailRequests++;input.onRequest(p);},validate:raw=>{
   if(raw&&typeof raw==='object'&&rollupFields.some(key=>Object.hasOwn(raw,key)))throw Error('Chapter detail cannot issue whole-chapter judgments or executable recipes');
   const emptyRecipes=input.role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:['sound_designer','composer'].includes(input.role)?{audioCues:[],generationRequests:[]}:{};
   const value={...emptyRecipes,...(raw as object),...(input.role==='production_director'?{decision:'hold',decisionConfidence:0,decisionLimitations:'Scoped technical proposal only; no chapter approval.',acceptedContributionIds:[],acceptanceChecks:{status:'unverified',evidence:'Whole-chapter consolidation required.'}}:{})};
   const result=input.validate(value);
   const copy:any={...result};for(const key of rollupFields)delete copy[key];return copy;
  }});
 if(proposal.directions.length!==input.brief.shots.length||new Set(proposal.directions.map(d=>d.shotId)).size!==input.brief.shots.length)throw Error('Chapter detail review did not cover every shot exactly once');
 const globalSchema:any=responseConsolidation?ownerResponseSchema(input.schema,input.brief.shots.length,responseConsolidation.wanted):structuredClone(input.schema),item=codexOutputSchema((input.schema.properties as any).directions.items);
 globalSchema.properties.directions={anyOf:[{type:'array',items:item,maxItems:0},{type:'array',items:item,minItems:input.brief.shots.length,maxItems:input.brief.shots.length}]};
 return dispatchCrewTask({...input,schema:globalSchema,retainedShotTasks:undefined,reconcileRetainedResponses:false,taskMode:'chapter-rollup',rollup:{proposal,detailRequests,...(responseConsolidation?{responseCandidates:responseConsolidation.candidates}:{})}});
}

function chapterRollupPacket(input:CrewTaskInput,indexOwnDirections=false){
 const proposal=input.rollup!.proposal,contributions={...input.contributions,[input.role]:proposal},packet=chapterCrewPacket(input.brief,contributions,input.record,input.role);
 const directionSources=Object.entries(input.contributions).map(([owner,c])=>{const id=c?.exchange?.find(h=>h.kind==='proposal'||h.kind==='revision')?.id??null,base=id?`contribution:${id}`:`previous_role:${owner}`;return{owner,contributionId:id,directionCount:c?.directions.length??0,directionsSha256:recordHash(c?.directions??[]),taskSummariesSha256:recordHash(c?.taskSummaries??[]),directionsAccess:`${base}#/roleOutput/directions`,summaryAccess:`${base}#/roleOutput/summary`,objectionResponsesAccess:`${base}#/roleOutput/objectionResponses`};});
 const visibleIssueIds=new Set([...(packet.productionRecord?.objections??[]),...(packet.chapterIssueIndex??[])].map(o=>o.id));
 const findingKey=(owner:string,f:any)=>recordHash({owner,shotId:f.shotId,severity:f.severity,evidence:f.evidence,requestedChange:f.requestedChange,confidence:f.confidence,limitations:f.limitations});
 const issueAliases=new Map<string,string[]>();
 for(const o of input.record?.objections??[])if(visibleIssueIds.has(o.id)){const key=findingKey(o.owner,o);issueAliases.set(key,[...(issueAliases.get(key)??[]),o.id]);}
 // Keep the chapter projection's exchange-free contributions. Rebuilding
 // from durable outputs here would replay archived exchanges in the rollup.
 const projected=Object.fromEntries(Object.entries(packet.contributions).map(([owner,c])=>{
  const {directions,taskSummaries:_taskProse,...rest}=c!;
  if(owner===input.role)return[owner,{...rest,directions:indexOwnDirections?[]:directions,...(indexOwnDirections?{directionIndex:directions.map(d=>({shotId:d.shotId,sha256:recordHash(d),access:`current_direction:${d.shotId}`}))}:{})}];
  const findingIssueIds:string[]=[];
  const findings=c!.findings.filter(f=>{const ids=issueAliases.get(findingKey(owner,f));if(!ids?.length)return true;findingIssueIds.push(...ids);return false;});
  return[owner,{...rest,directions:[],findings,findingIssueIds:[...new Set(findingIssueIds)],findingReadPolicy:'Exact duplicate finding bodies are represented by every matching saved issue ID already supplied or indexed. Consult their live severity/status in productionRecord.objections or chapterIssueIndex. Retrieve contribution:<id> before relying on a body that is only indexed. Unmatched findings remain explicit. No issue is closed or reclassified.',objectionResponses:(c!.objectionResponses??[]).filter(r=>input.record?.objections.some(o=>o.id===r.objectionId&&o.owner===input.role)),objectionResponseIndex:(c!.objectionResponses??[]).filter(r=>!input.record?.objections.some(o=>o.id===r.objectionId&&o.owner===input.role)).map(({objectionId,outcome})=>({objectionId,outcome})),objectionResponseSource:{sha256:recordHash(c!.objectionResponses??[]),access:`previous_role:${owner}#/roleOutput/objectionResponses`,policy:'Committed outcomes indexed only. Retrieve this exact field before relying on omitted rationale or evidence. Complete issues and current-role findings remain supplied; indexing applies no disposition.'}}];
 }));
 return{...packet,audit:{...packet.audit,archivedAncestryLinks:undefined,archivedAncestryIndex:{count:packet.audit?.archivedAncestryLinks?.length??0,sha256:recordHash(packet.audit?.archivedAncestryLinks??[]),access:'Exact old ancestry links remain in saved exchanges; retrieve contribution:<id> or history_page:<offset>. This is not another list of active concerns.'}},contributions:projected,directionSources,...(input.rollup!.recordedProposalSource?{recordedProposalReview:{sourceContributionId:input.rollup!.recordedProposalSource,policy:'Prior saved proposal under a fresh current-input owner review; no prior approval inherited. Old findings retain their exact lifecycle in productionRecord; only new findings are appended.'}}:{}),...(input.rollup!.responseCandidates?{shotTaskResponseReconciliation:{candidates:input.rollup!.responseCandidates,policy:'These exact partial responses are not accepted dispositions. Review the complete role proposal and issue scope, and explicitly answer every referenced issue once. No default preferred outcome. Written planning consistency is distinct from actual-frame, source-timing, canon and audiovisual verification; retain unmet prerequisites without claiming unseen evidence was checked.'}}:{}),chapterDetailReview:{role:input.role,detailRequests:input.rollup!.detailRequests,uniqueShots:proposal.directions.length,shotIds:proposal.directions.map(d=>d.shotId),proposalSha256:recordHash(proposal),limitation:input.rollup!.recordedProposalSource?'Saved prior proposal under a fresh correction review; no new detail calls or prior clearance claimed. Indexed instruction bodies require retrieval before reliance. Original issues remain in productionRecord until their owners explicitly dispose of them.':'Completed scoped model proposals, not chapter approval. Every target and neighboring technical direction was supplied to the scoped checks. Other-role full directions are indexed here, not directly viewed in this consolidation request. All local findings remain mandatory.'},
  ...(indexOwnDirections?{currentDirectionReadPolicy:'Every current-role direction was inspected in completed scoped detail requests and is preserved unchanged in the full proposal. This consolidation receives their exact ID/hash index, not their instruction bodies. Full source, every baseline shot, current-role findings, whole-treatment reviews and issue/response evidence remain supplied. Retrieve current_direction:<shotId> before relying on an omitted instruction; hold if needed evidence is unavailable. directions=[] retains the complete original proposal, never the empty projection. Indexing grants no chapter acceptance and cannot erase a finding.'}:{}),
  directionReadPolicy:indexOwnDirections?'Current-role instructions are indexed here and were not directly viewed in this consolidation request. Retrieve current_direction:<shotId> for an exact body. Foreign directions use direction_shot:<contributionId>:<shotId>. Full source, baseline shots and current issues remain supplied; never claim indexed prose was read.':'The complete current-role proposal is supplied. Retrieve an indexed exact other-role direction as direction_shot:<contributionId>:<shotId>, or contribution:<id> for its full saved output. Full source, baseline chapter shots and current issues remain supplied. Never claim unseen prose was read.'};
}

function indexForeignReviewFields(result:any,input:CrewTaskInput,indexReviewProse:boolean){
 for(const [owner,c]of Object.entries(result.contributions) as Array<[string,any]>){
  if(owner===input.role)continue;
  delete c.findingIssueIds;delete c.objectionResponseIndex;
  c.issueOwnerIndex=owner;
  c.findingReadPolicy='All issue IDs, owners, shot scopes, severities and live statuses remain in productionRecord.objections or chapterIssueIndex. Open indexed issues retain requested actions. Original finding aliases and response prose remain in the exact archived contribution; retrieve before relying on their explanation or acknowledging that contribution. No disposition is applied by this projection.';
  if(indexReviewProse&&!['creative_director','scripture_cultural_reviewer'].includes(owner)){
   if(c.treatmentReview&&input.role!=='production_director'){const review=c.treatmentReview;c.treatmentReview={status:review.status,requestedChange:review.requestedChange,confidence:review.confidence,indexedEvidence:{sha256:recordHash(review),access:`previous_role:${owner}#/roleOutput/treatmentReview`,notRead:true}};}
   if(c.summary.length>400){c.summarySource={sha256:recordHash(c.summary),access:`previous_role:${owner}#/roleOutput/summary`,notRead:true};c.summary='Saved summary is archived; consult exact source before relying on it.';}
  }
 }
}
/** Smaller issue view for a specialist's oversized consolidation. The complete
 * issue lifecycle stays visible; foreign explanations remain exact-ID evidence.
 * Pending fact-proposal links and unknown owners retain full bodies. */
function indexForeignChapterIssues(packet:any,input:CrewTaskInput,evidence:Record<string,unknown>,indexReviewProse=false){
 const result=structuredClone(packet),known=new Set<string>([...PLANNING_ROLES,...FINISHING_ROLES,'production_director','fidelity_challenger','clarity_challenger','feasibility_challenger']);
 if(!result.productionRecord)return result;
 const pending=new Set((result.productionRecord?.history??[]).flatMap((h:any)=>[...h.objections,...h.relatedContributions]));
 const indexed=(result.productionRecord?.objections??[]).filter((o:any)=>known.has(o.owner)&&!pending.has(o.id)&&(o.owner!==input.role||o.status==='resolved'));
 const ids=new Set(indexed.map((o:any)=>o.id));
 result.productionRecord.objections=result.productionRecord.objections.filter((o:any)=>!ids.has(o.id));
 result.chapterIssueIndex=[...(result.chapterIssueIndex??[]),...indexed.map((o:any)=>({id:o.id,owner:o.owner,shotId:o.shotId,severity:o.severity,status:o.status,...(o.status==='open'?{requestedChange:o.requestedChange}:{})}))];
 indexForeignReviewFields(result,input,indexReviewProse);
 // A requested full current-role output can already contain these exact
 // directions. Share that array instead of also sending a redundant ID index.
 if(input.rollup&&Object.values(evidence).some((e:any)=>e?.value?.roleOutput?.directions&&recordHash(e.value.roleOutput.directions)===recordHash(input.rollup!.proposal.directions))){
  result.contributions[input.role].directions=structuredClone(input.rollup.proposal.directions);
  delete result.contributions[input.role].directionIndex;delete result.currentDirectionReadPolicy;
  result.directionReadPolicy='Complete current-role instructions are supplied exactly and shared losslessly with the retrieved matching prior output. Other indexed instructions require exact lookup before reliance. No prior clearance is inherited.';
 }
 result.chapterIssueIndexPolicy='Specialist issue view: own open issues, pending fact-proposal links and unknown owners retain full bodies. Foreign issues and resolved owned issues retain exact ID, owner, scope, severity and status; open issues include the requested action. Retrieve contribution:<id> before citing indexed explanations or dispositions. All source, canon, producer decisions and requested evidence remain supplied unchanged. An index never resolves, downgrades or approves an issue.';
 if(indexReviewProse)result.foreignReviewReadPolicy='Foreign review status, requested actions and uncalibrated confidence are supplied; indexed explanations, limitations and long summaries were not read. Retrieve the exact hashed field before relying on its prose. Status alone grants no source, native-language, media or chapter certification. Current-role, Creative Director and Scripture/Cultural prose remain supplied, as does every explicitly requested evidence value.';
 return result;
}

/** An explicit retrieval refusal/index, never the requested full body. Used
 * only after the exact packet fails its existing transport budget. */
export function oversizedContributionIndex(ref:string,entry:any){
 if(!ref.startsWith('contribution:')||ref.includes('#')||!entry?.value?.roleOutput||entry.notSuppliedFullBody)return undefined;
 const full=entry.value,escape=(key:string)=>key.replaceAll('~','~0').replaceAll('/','~1');
 const fields=Object.entries(full).flatMap(([key,value])=>key==='roleOutput'?Object.entries(value as Record<string,unknown>).map(([field,v])=>({pointer:'/roleOutput/'+escape(field),sha256:recordHash(v),bytes:Buffer.byteLength(JSON.stringify(v)),access:ref+'#/roleOutput/'+escape(field)})):[{pointer:'/'+escape(key),sha256:recordHash(value),bytes:Buffer.byteLength(JSON.stringify(value)),access:ref+'#/'+escape(key)}]);
 const value={status:'full_body_not_supplied_transport_limit',requestedRef:ref,originalSha256:entry.sha256,originalBytes:Buffer.byteLength(JSON.stringify(full)),notRead:true,notAFact:true,notAnApproval:true,fields,policy:'The requested full body was NOT supplied or inspected. This is only an exact-version field index after the complete packet exceeded transport. Request the required fields or individual direction_shot records. Carry unmet evidence as a hold; do not acknowledge/withdraw this contribution or approve the chapter from this index. No record was deleted or treated as read.'};
 return{sha256:recordHash(value),value,notAFact:true,notSuppliedFullBody:true};
}
function indexResolvedChapterIssues(packet:any){
 const result=structuredClone(packet),known=new Set<string>([...PLANNING_ROLES,...FINISHING_ROLES,'production_director','fidelity_challenger','clarity_challenger','feasibility_challenger']),pending=new Set((result.productionRecord?.history??[]).flatMap((h:any)=>[...h.objections,...h.relatedContributions]));
 const indexed=(result.productionRecord?.objections??[]).filter((o:any)=>o.status==='resolved'&&known.has(o.owner)&&!pending.has(o.id)),ids=new Set(indexed.map((o:any)=>o.id));
 result.productionRecord.objections=result.productionRecord.objections.filter((o:any)=>!ids.has(o.id));result.chapterIssueIndex.push(...indexed.map((o:any)=>({id:o.id,owner:o.owner,shotId:o.shotId,severity:o.severity,status:o.status})));
 result.resolvedIssueReadPolicy='Resolved issue bodies are archived, not read here; exact IDs/owners/scopes/severities/statuses remain indexed. ALL open issues and substantive pending/unknown records retain their complete bodies. Retrieve contribution:<issue-id> before relying on an omitted explanation. No lifecycle changed.';
 return result;
}

function indexDirectorNonblockingProse(packet:any,input:CrewTaskInput){
 const result=structuredClone(packet),indexed:Array<{id:string;requestedChange:string}>=[];
 const pending=new Set((input.record?.history??[]).filter(h=>h.proposedChanges.length).flatMap(h=>[...h.objections,...h.relatedContributions]));
 const known=new Set<string>([...PLANNING_ROLES,...FINISHING_ROLES,'fidelity_challenger','clarity_challenger','feasibility_challenger']);
 const optional=(result.productionRecord?.objections??[]).filter((o:any)=>o.status==='open'&&o.severity==='advisory'&&o.owner!==input.role&&known.has(o.owner)&&!pending.has(o.id));
 const optionalIds=new Set(optional.map((o:any)=>o.id));
 if(result.productionRecord)result.productionRecord.objections=result.productionRecord.objections.filter((o:any)=>!optionalIds.has(o.id));
 result.chapterIssueIndex.push(...optional.map((o:any)=>({id:o.id,owner:o.owner,shotId:o.shotId,severity:o.severity,status:o.status})));
 result.foreignAdvisoryActions=optional.map((o:any)=>({id:o.id,requestedChange:o.requestedChange}));
 result.foreignAdvisoryExplanationsArchive={count:optional.length,sha256:recordHash(optional),notRead:true,notAnApproval:true,policy:'These exact foreign nonblocking issue bodies are archived, not inspected. Derive contribution:<issue-id>#/findingRecord from each indexed ID to retrieve its complete live record. The complete issue array is pinned by this hash and the immutable production-record hash. Complete requested actions remain supplied in foreignAdvisoryActions, keyed by exact issue ID; no issue is resolved, waived or approved.'};
 for(const o of result.chapterIssueIndex??[])if(o.status==='open'&&o.severity==='advisory'&&typeof o.globalAdvisoryRequest==='string'){
  indexed.push({id:o.id,requestedChange:o.globalAdvisoryRequest});delete o.globalAdvisoryRequest;o.globalAdvisoryRequestIndexed=true;
 }
 result.globalAdvisoryActionsArchive={count:indexed.length,sha256:recordHash(indexed),policy:'These NONBLOCKING advisory actions are archived, not read. Each exact requirement is retrievable at contribution:<issue-id>#/findingRecord/requestedChange, pinned by the full-record hash and issue ID. No advisory is passed, resolved or waived. Retrieve the requirement before dependent execution.'};
 indexForeignReviewFields(result,input,true);
 // The recorded Director's last response explanations are history, not fresh
 // dispositions. Live owned issues remain full; requested copies stay exact.
 const own=result.contributions?.[input.role],source=input.rollup?.recordedProposalSource,prior=input.rollup?.proposal;
 if(source&&!pending.has(source)&&own?.objectionResponses?.length&&!prior?.filmChanges?.length&&!prior?.ownerResponses?.length&&!prior?.withdrawals?.length&&!prior?.generationRequests?.length&&own.objectionResponses.every((r:any)=>!pending.has(r.objectionId)&&input.record?.objections.some(o=>o.id===r.objectionId&&o.owner===input.role))){
  const responses=own.objectionResponses;
  own.priorObjectionResponseArchive={sourceContributionId:source,count:responses.length,sha256:recordHash(responses),access:`contribution:${source}#/roleOutput/objectionResponses`,notRead:true,notAFact:true,notAnApproval:true,policy:'Prior submitted response explanations are archived, not read as current evidence. Every live owned issue body remains supplied. These old indexed outcomes apply no fresh disposition or approval; explicitly resolve or carry every current owned issue against current supplied evidence. Retrieve this exact field if its previous rationale is necessary. Explicit requested copies elsewhere remain complete.'};
  own.objectionResponses=[];
 }
 result.directorReadPolicy='All open blocking bodies and current-role open bodies remain exact. Known foreign nonblocking issues without pending fact links retain exact ID, owner, shot scope, severity and status in chapterIssueIndex, with every complete requested action in foreignAdvisoryActions keyed by ID; their full explanations were NOT read and are archived behind exact hash and lookup. Already-indexed global advisory actions and foreign long summaries can also be archived. Required current treatment-review explanations remain complete. Creative Director and Scripture/Cultural contribution prose and every explicitly requested evidence value remain supplied. Prior submitted response explanations can be indexed as unread history; current live issues and fresh disposition requirements remain unchanged. Indexing applies no disposition or approval. Retrieve omitted explanations before relying on them; hold if required review evidence remains missing.';
 return result;
}

/** Explicit correction deltas are pinned to the exact complete saved array.
 * Accidental partial directions remain invalid; only this named update contract
 * retains unmentioned entries. Native raw replies remain in the receipt archive. */
export function normalizeRecordedDirectionUpdates(output:Record<string,any>,proposal:CrewContribution){
 const {directionUpdates,...body}=output;
 if(directionUpdates==null)return{...body,...(Array.isArray(body.directions)&&!body.directions.length?{directions:structuredClone(proposal.directions)}:{})};
 if(!Array.isArray(body.directions)||body.directions.length||!directionUpdates||typeof directionUpdates!=='object'||directionUpdates.baseDirectionsSha256!==recordHash(proposal.directions)||!Array.isArray(directionUpdates.updates)||!directionUpdates.updates.length||directionUpdates.updates.length>proposal.directions.length)throw Error('Direction updates require an exact saved base, nonempty updates and empty replacement directions');
 const base=new Set(proposal.directions.map(d=>d.shotId)),updates=new Map<string,any>();
 for(const d of directionUpdates.updates){if(!d||typeof d!=='object'||!base.has(d.shotId)||updates.has(d.shotId))throw Error('Direction updates contain duplicate or foreign shot IDs');updates.set(d.shotId,d);}
 return{...body,directions:proposal.directions.map(d=>structuredClone(updates.get(d.shotId)??d))};
}
export function literalFactLookupBlock(evidence:Record<string,unknown>){
 const groups=new Map<string,{references:string[];sha256:string;fact:unknown}>();
 for(const [ref,entry]of Object.entries(evidence) as Array<[string,any]>){
  if(!ref.startsWith('fact:')||entry?.notAFact||entry?.selection?.partial)continue;
  if(!entry||entry.sha256!==recordHash(entry.value))throw Error('Retrieved fact hash mismatch');
  const prior=groups.get(entry.sha256);if(prior)prior.references.push(ref);else groups.set(entry.sha256,{references:[ref],sha256:entry.sha256,fact:entry.value});
 }
 return groups.size?'\nLITERAL BEFORE-FACT RECORDS (unencoded JSON; identical records grouped by hash):\n'+JSON.stringify([...groups.values()])+"\nFor filmChanges.before copy the entire supplied fact, including owner/status/evidence, not its inner value or the lookup wrapper. A proposed baseline fact is the recorded before-state for proposing a correction; it is not approval of generated media. Invalid/absent lookups are excluded. Normal ownership, exact-target and Director acceptance checks still apply.\n":'';
}

export async function dispatchCrewTask(input:CrewTaskInput):Promise<CrewContribution>{
 const maxEvidenceRounds=input.maxEvidenceRounds??2;if(![2,3].includes(maxEvidenceRounds))throw Error('Evidence round ceiling must be finite2 or explicitly extended3');
 const taskSize=input.maxShotTaskSize??32;
 if(!Number.isInteger(taskSize)||taskSize<1||taskSize>32)throw Error('Shot task size must be 1..32');
 if(input.reviewRecordedProposal&&input.phase==='planning'&&!input.taskMode){
  const proposal=input.contributions[input.role],source=proposal?.exchange?.find(h=>h.kind==='proposal'||h.kind==='revision');
  const ids=proposal?.directions.map(d=>d.shotId)??[];
  if(!proposal||!source||!input.record?.history.some(h=>h.id===source.id&&h.owner===input.role)||ids.length!==input.brief.shots.length||new Set(ids).size!==ids.length||ids.some(id=>!input.brief.shots.some(s=>s.id===id)))throw Error('Recorded proposal review requires complete matching saved role directions');
  const schema:any=structuredClone(input.schema),item=codexOutputSchema(schema.properties.directions.items);
  schema.properties.directions={anyOf:[{type:'array',items:item,maxItems:0},{type:'array',items:item,minItems:ids.length,maxItems:ids.length}]};
  schema.properties.directionUpdates={type:'object',properties:{baseDirectionsSha256:{type:'string',enum:[recordHash(proposal.directions)]},updates:{type:'array',items:item,minItems:1,maxItems:ids.length}},required:['baseDirectionsSha256','updates']};
  return dispatchCrewTask({...input,schema,reviewRecordedProposal:false,taskMode:'chapter-rollup',rollup:{proposal,detailRequests:proposal.taskSummaries?.length||1,recordedProposalSource:source.id}});
 }
 if(RETAINABLE_CHAPTER_DETAIL_ROLES.includes(input.role)&&input.phase==='planning'&&!input.taskMode&&input.retainedShotTasks?.length){
  const ids=input.retainedShotTasks.flatMap(t=>t.directions.map(d=>d.shotId));
  if(ids.length!==input.brief.shots.length||new Set(ids).size!==ids.length)throw Error('Retained chapter details require complete unique chapter coverage');
  return dispatchChapterReview(input);
 }
 const retained:CrewContribution[]=structuredClone([...(input.retainedShotTasks??[])]),covered=new Set<string>();
 const retainedChapterDetails=RETAINABLE_CHAPTER_DETAIL_ROLES.includes(input.role)&&input.taskMode==='chapter-detail';
 if(retained.length&&((!SHOT_TASK_ROLES.includes(input.role)&&!retainedChapterDetails)||input.phase!=='planning'||input.taskMode&&!retainedChapterDetails))throw Error('Partial task continuation requires an initial planning technical role or verified pure chapter detail');
 for(const output of retained){
  input.validate(output);
  if(Object.entries(output).some(([k,v])=>!['summary','directions','findings','objectionResponses'].includes(k)&&v!==undefined&&(!Array.isArray(v)||v.length))||(!input.reconcileRetainedResponses&&output.objectionResponses?.some(r=>r.outcome!=='carried')))throw Error('Retained technical tasks cannot apply mutations or resolve issues without full owner reconciliation');
  for(const d of output.directions){if(covered.has(d.shotId)||!input.brief.shots.some(s=>s.id===d.shotId))throw Error('Retained camera task coverage overlaps or is foreign');covered.add(d.shotId);}
 }
 if(input.reconcileRetainedResponses&&!retained.length)throw Error('Retained issue reconciliation requires verified task evidence');
 const audiovisual=input.media.some(m=>m.mimeType.startsWith("audio/")||m.mimeType.startsWith("video/"));
 const detail=input.taskMode==='chapter-detail';
 const scoped=!input.rollup&&!audiovisual&&input.phase==="planning"&&(detail||SHOT_TASK_ROLES.includes(input.role))&&input.brief.shots.length>0;
 const tasks: string[][]=scoped?[]:[[]];
 const remaining=input.brief.shots.filter(s=>!covered.has(s.id));
 if(scoped)for(let at=0;at<remaining.length;at+=taskSize)tasks.push(remaining.slice(at,at+taskSize).map(s=>s.id));
 if(retained.length&&!scoped)throw Error('Retained camera tasks require scoped dispatch');
 const results:CrewContribution[]=[...retained];
 const taskContributions=retained.length?{...input.contributions,[input.role]:input.reconcileRetainedResponses
  ?shotTaskResponseReconciliation(retained).proposal:mergeShotTaskOutputs(structuredClone(retained))}:input.contributions;
 const template={...input.schema,properties:{...input.schema.properties as object,contextRequests:{type:"array",items:{type:"string"},maxItems:audiovisual?0:12}}};
 const begin=input.prompt.indexOf("BOUNDED CONTEXT:\n"),end=input.prompt.indexOf("\nUse filmChanges",begin);
 if(begin<0)throw new Error("Task context requires bounded packet format");
 const prefix=input.prompt.slice(0,begin),suffix=end<0?"":input.prompt.slice(end);
 for(let i=0;i<tasks.length;i++){
  const task=tasks[i]!;
  let indexedOwnDirections=false,indexedForeignIssues=false,indexedForeignReviewProse=false,indexedResolvedIssues=false,indexedDirectorProse=false;
  let packet:any=input.rollup?chapterRollupPacket(input):scoped?scopedCrewPacket(input.brief,taskContributions,input.record,task,input.role):chapterCrewPacket(input.brief,input.contributions,input.record,input.role);
  if(retained.length)packet.retainedTaskProgress={shotIds:[...covered],limitation:'Verified completed initial camera tasks. Relevant own neighboring directions and findings are supplied; other retained directions are unchanged and will be merged after the remaining tasks. Not a chapter approval.'};
  if(detail)packet={...packet,brief:{...packet.brief,source:input.brief.source,shots:input.brief.shots,audio:input.brief.audio},chapterDetailPolicy:'Inspect TASK technical details against the full chapter source and baseline sequence supplied here. Neighbor directions provide boundary continuity. No scoped reply approves the chapter; an explicit whole-chapter consolidation follows all complete parts.'};
  const schema=taskSchema(template,input.brief.shots.map(s=>s.id),scoped?task:input.brief.shots.map(s=>s.id),scoped);
  const characters=new Set(packet.brief.canon.map((c:{id:string})=>c.id));
  const taskMedia=scoped?input.media.filter(m=>!m.characterIds?.length||m.characterIds.some(id=>characters.has(id))):input.media;
  let policy=prefix;
  if(scoped){policy=policy.replace("Review the whole chapter and preceding contributions.","Design the TASK shots using chapter overview and preceding contributions; whole-chapter review remains with the chapter reviewers.")
   .replace(/Your directions array must contain exactly [^\n]+\n/,`Your directions array must contain exactly ${task.length} distinct entries, one per TASK shotId: ${JSON.stringify(task)}.\n`)
   .replace("every shot, including continuity","every TASK shot, including continuity");}
  if(scoped&&!policy.includes("one per TASK shotId:"))policy+=`Your directions array must contain exactly ${task.length} distinct entries, one per TASK shotId: ${JSON.stringify(task)}.\n`;
  if(scoped)policy=policy.replace(/Your directions array must contain exactly [^\n]+\n/g,`Return directions as an object keyed by every TASK shotId exactly once, with instruction and scriptureBasis values. For an evidence request only, directions may be an empty object.\n`);
 if(detail)policy+='This is a scoped chapter-detail proposal, never chapter approval. Reconcile source, continuity and all supplied technical role details for TASK shots. Whole-treatment/craft judgments and executable edit/audio recipes are reserved for the mandatory whole-chapter consolidation; return only fields available in this detail schema.\n';
   if(input.rollup)policy+=input.rollup.recordedProposalSource
    ?`This is a FRESH whole-chapter owner correction review of recorded proposal ${input.rollup.recordedProposalSource}, not a retained approval or a new set of detail calls. Review full source, current producer evidence, baseline sequence, your complete prior proposal and all current issues. Return directions=[] without directionUpdates to retain every original instruction unchanged. To change selected instructions return directions=[] plus hash-pinned directionUpdates; a full replacement covering every shot is also allowed. Old findings remain in the production record; do not reissue them as new findings. Explicitly resolve or carry owned issue IDs using current evidence and report genuinely new defects in findings. Prior verdicts/treatment clearances are not inherited. Your original emotionalTreatment, when present, is supplied in contributions under your role. Copy unchanged treatment fields and shotIds exactly; do not rewrite or redistribute them when correcting only a range label. Foreign responses addressing your own issue IDs are supplied in full; other responses remain indexed. Retrieve indexed instruction bodies before relying on them; hold if evidence is missing.\n`
    :'This is the required whole-chapter consolidation after complete detail checks. Review full source, baseline sequence, the complete current-role proposal and all issues. Return directions=[] to explicitly retain the supplied complete reviewed proposal, or return a full replacement covering every chapter shot. Never erase a detail finding or claim that indexed other-role prose was directly viewed in this request.\n';
   const evidence:Record<string,unknown>={};
   const pending=input.pendingEvidence;
   if(pending){
    if(input.taskMode!=='chapter-rollup'||!input.rollup||pending.role!==input.role||pending.nextRound<1||pending.nextRound>maxEvidenceRounds||!pending.refs.length||pending.refs.length>12*maxEvidenceRounds||new Set(pending.refs).size!==pending.refs.length||pending.refs.some(r=>typeof r!=='string')||!pending.originEventId.endsWith(`:chapter-rollup:task-1:evidence-${pending.nextRound-1}`))throw Error('Invalid retained chapter evidence request');
    for(let at=0;at<pending.refs.length;at+=12)Object.assign(evidence,retrieveCrewEvidence(input.brief,input.record,pending.refs.slice(at,at+12),input.retainedContributions,{role:input.role,proposal:input.rollup.proposal}));
    packet.retainedEvidenceRequest={...pending,limitation:'Receipted provisional request, not a verdict. Exact requested records are supplied; prior calls and evidence rounds still count.'};
   }
   if(maxEvidenceRounds===3&&typeof packet.archiveAccess==='string')packet.archiveAccess=packet.archiveAccess.replace('Two evidence rounds maximum','Three evidence rounds maximum under the recorded extension');
   for(let round=pending?.nextRound??0;round<=maxEvidenceRounds;round++){
   const roundSchema:any=round===maxEvidenceRounds?structuredClone(schema):schema;if(round===maxEvidenceRounds&&roundSchema.properties.contextRequests)roundSchema.properties.contextRequests.maxItems=0;
   if(indexedOwnDirections&&input.rollup){
    const expected=recordHash(input.rollup.proposal.directions),supplied=Object.values(evidence).some((e:any)=>{const directions=Array.isArray(e?.value)?e.value:e?.value?.roleOutput?.directions;return Array.isArray(directions)&&recordHash(directions)===expected;});
    if(supplied){packet.contributions[input.role].directions=structuredClone(input.rollup.proposal.directions);delete packet.contributions[input.role].directionIndex;delete packet.currentDirectionReadPolicy;packet.directionReadPolicy='Complete current-role instructions are supplied exactly and shared losslessly with the matching retrieved field. Other indexed bodies require exact retrieval before reliance. No prior clearance inherited.';}
    else if(!packet.contributions[input.role].directionIndex){packet.contributions[input.role].directions=[];packet.contributions[input.role].directionIndex=input.rollup.proposal.directions.map(d=>({shotId:d.shotId,sha256:recordHash(d),access:`current_direction:${d.shotId}`}));packet.currentDirectionReadPolicy='Current-role instruction bodies are indexed, not read in this request. Retrieve exact instructions before relying on an omitted body. No prior clearance inherited.';packet.directionReadPolicy=packet.currentDirectionReadPolicy;}
   }
   const prompt=policy+`TASK CONTEXT: ${input.taskMode??(scoped?"specialist":"chapter")}; batch ${i+1}/${tasks.length}; evidence ${round}/${maxEvidenceRounds}.\n`+
    `If exact earlier evidence is required, return contextRequests with saved refs and provisional empty directions/findings; this is not a contribution. For a retained treatment/review request only its field (for example contribution:<id>#/roleOutput/emotionalTreatment or previous_role:<role>#/roleOutput/treatmentReview), not every role's full shot directions. Use direction_shot:<contribution-id>:<shot-id> for individual instructions. At most ${maxEvidenceRounds} evidence rounds. Field selections do not count as reading the complete contribution; never claim omitted records were reviewed.\n`+
    (round===maxEvidenceRounds?"FINAL EVIDENCE ROUND: return a valid owner review now. Carry unresolved holds with concrete limitations; do not request further context. No automatic retention, closure or approval is granted.\n":"")+
    `BOUNDED CONTEXT:\n${encodeCrewPacket({...packet,retrievedEvidence:evidence})}\n`+suffix+(input.rollup?.recordedProposalSource?`\nDIRECTION UPDATE BASE (literal): ${JSON.stringify({sourceContributionId:input.rollup.recordedProposalSource,directionsAccess:`contribution:${input.rollup.recordedProposalSource}#/roleOutput/directions`,baseDirectionsSha256:recordHash(input.rollup.proposal.directions),shotCount:input.rollup.proposal.directions.length})}\nIf your instruction bodies are indexed, request the directionsAccess leaf above to inspect the COMPLETE saved array; do not request the entire archived contribution merely to inspect instructions. To change selected instructions, return directions=[] and directionUpdates={baseDirectionsSha256,updates:[complete changed direction entries]}. Every unlisted entry stays exact. Full replacement directions remain allowed; never combine them with directionUpdates. This changes no finding, verdict or approval by itself.\n`:'')+(audiovisual?'':literalFactLookupBlock(evidence));
   try{
    if(!audiovisual&&(taskMedia.length>16||taskMedia.reduce((n,m)=>n+Buffer.byteLength(m.data,"base64"),0)>16*1024*1024))throw new Error("Crew task image attachment budget exceeded before submission");
    if(audiovisual)crewInputBudget(prompt+taskMedia.map(m=>m.caption??"").join("\n"),roundSchema,input.chapterBytes-4096);
    else codexInputBudget(prompt,roundSchema,taskMedia,scoped&&!detail?input.specialistBytes:input.chapterBytes);
   }catch(error){
    // Chapter acceptance depends on current review explanations and the
    // Director's own handoff. Archive optional prose before hiding that handoff.
    if(input.rollup&&!audiovisual&&['Crew input held before submission:','Codex transport character limit exceeded before submission'].some(p=>String((error as Error).message).startsWith(p))){
     if(input.role==='production_director'){
      if(!indexedResolvedIssues){packet=indexResolvedChapterIssues(packet);indexedResolvedIssues=true;round--;continue;}
      if(!indexedDirectorProse){packet=indexDirectorNonblockingProse(packet,input);indexedDirectorProse=true;round--;continue;}
     }else{
      if(!indexedForeignIssues){packet=indexForeignChapterIssues(packet,input,evidence);indexedForeignIssues=true;round--;continue;}
      if(!indexedForeignReviewProse){packet=indexForeignChapterIssues(packet,input,evidence,true);indexedForeignReviewProse=true;round--;continue;}
     }
    }
    if(input.rollup&&!(input.role==='production_director'&&input.rollup.recordedProposalSource)&&!indexedOwnDirections&&!audiovisual&&['Crew input held before submission:','Codex transport character limit exceeded before submission'].some(p=>String((error as Error).message).startsWith(p))){
     const ids=input.rollup.proposal.directions.map(d=>d.shotId);
     if(input.rollup.detailRequests<1||ids.length!==input.brief.shots.length||new Set(ids).size!==ids.length||ids.some(id=>!input.brief.shots.some(s=>s.id===id)))throw Error('Indexed consolidation requires complete unique reviewed direction coverage');
     packet={...chapterRollupPacket(input,true),...(pending?{retainedEvidenceRequest:{...pending,limitation:'Receipted provisional request, not a verdict. Exact requested records supplied; original rounds still count.'}}:{})};indexedOwnDirections=true;if(indexedForeignIssues)packet=indexForeignChapterIssues(packet,input,evidence,indexedForeignReviewProse);if(indexedResolvedIssues)packet=indexResolvedChapterIssues(packet);if(indexedDirectorProse)packet=indexDirectorNonblockingProse(packet,input);
     policy=policy.replace('Review full source, baseline sequence, the complete current-role proposal and all issues.','Review full source, baseline sequence, the complete current-role direction index, every current-role finding, whole-treatment reviews and all issues. Instruction bodies were inspected in the completed detail tasks, not directly viewed in this consolidation; retrieve current_direction:<shotId> before relying on an omitted body, and hold if required evidence is missing.').replace('supplied complete reviewed proposal','complete original reviewed proposal retained behind the index');
     round--;continue;
    }
    if(input.rollup&&!audiovisual&&['Crew input held before submission:','Codex transport character limit exceeded before submission'].some(p=>String((error as Error).message).startsWith(p))){
     const candidate=Object.entries(evidence).filter(([ref,e])=>oversizedContributionIndex(ref,e)).sort((a,b)=>JSON.stringify(b[1]).length-JSON.stringify(a[1]).length)[0];
     if(candidate){evidence[candidate[0]]=oversizedContributionIndex(candidate[0],candidate[1]);round--;continue;}
     if(input.role==='production_director'&&!indexedResolvedIssues){packet=indexResolvedChapterIssues(packet);indexedResolvedIssues=true;round--;continue;}
     if(input.role==='production_director'&&!indexedDirectorProse){packet=indexDirectorNonblockingProse(packet,input);indexedDirectorProse=true;round--;continue;}
    }
    if(scoped&&round===0&&task.length>1){const middle=Math.ceil(task.length/2);tasks.splice(i,1,task.slice(0,middle),task.slice(middle));i--;break;}
    if(!scoped&&!input.taskMode&&!audiovisual&&input.phase==='planning'&&CHAPTER_TASK_ROLES.includes(input.role)&&['Crew input held before submission:','Codex transport character limit exceeded before submission'].some(prefix=>String((error as Error).message).startsWith(prefix)))return dispatchChapterReview(input);
    throw error;
   }
   input.onRequest(prompt);const raw=await input.call(prompt,roundSchema,taskMedia);
   if(!raw||typeof raw!=="object")throw new Error("Task response must be an object");
   const {contextRequests,...output}=raw as Record<string,unknown>;
   if(contextRequests!==undefined&&(!Array.isArray(contextRequests)||contextRequests.some(r=>typeof r!=="string")))throw new Error("Invalid context evidence request");
   const refs=contextRequests as string[]|undefined;
   if(refs?.length){if(audiovisual)throw new Error("Audiovisual review cannot dispatch extra paid evidence calls");if(round===maxEvidenceRounds)throw new Error("Evidence round limit; no contribution accepted");Object.assign(evidence,retrieveCrewEvidence(input.brief,input.record,refs,input.retainedContributions,input.rollup?{role:input.role,proposal:input.rollup.proposal}:undefined));continue;}
   let normalized=scoped?normalizeTaskDirections(output,task):output;
   if(input.rollup){
    normalized=input.rollup.recordedProposalSource
     ?normalizeRecordedDirectionUpdates(normalized as Record<string,any>,input.rollup.proposal)
     :normalizeResponseReconciliation(normalized,input.rollup.proposal,input.rollup.responseCandidates);
   }
   const validated=input.validate(normalized);
   if(input.rollup&&(validated.directions.length!==input.brief.shots.length||new Set(validated.directions.map(d=>d.shotId)).size!==input.brief.shots.length))throw Error('Chapter consolidation must retain complete unique shot coverage');
   for(const response of [...(validated.ownerResponses??[]),...(validated.withdrawals??[])]){
    if((evidence[`contribution:${response.contributionId}`] as any)?.notSuppliedFullBody)throw Error('Oversized contribution index cannot authorize acknowledgement or withdrawal');
    const retained=input.record?.history.find(h=>h.id===response.contributionId),supplied=packet.productionRecord?.history.some((h:{id:string})=>h.id===response.contributionId);
    if(retained&&!supplied&&!evidence[`contribution:${retained.id}`])throw new Error('Indexed proposal requires exact contribution retrieval before acknowledgement or withdrawal');
   }
   if(input.role==='production_director'&&validated.decision==='approve'&&Object.values(evidence).some((e:any)=>e.notSuppliedFullBody))throw Error('Unfulfilled full-contribution request cannot authorize chapter approval');
   for(const change of validated.filmChanges??[]){
    if(!Object.entries(evidence).some(([ref,e])=>ref.startsWith("fact:")&&!(e as {notAFact?:boolean}).notAFact&&(e as {sha256:string}).sha256===recordHash(change.before)))throw new Error("Film change requires retrieved exact before-fact evidence");
   }
   if(scoped&&validated.filmChanges?.some(c=>input.brief.shots.some(s=>s.id===c.target.entityId.replace(/^state:/,""))&&!task.includes(c.target.entityId.replace(/^state:/,""))))throw new Error("Task cannot change facts of a different shot");
   if(scoped&&(validated.directions.length!==task.length||validated.directions.some(d=>!task.includes(d.shotId))))throw new Error("Task directions must cover exactly its own shot IDs");
   results.push(validated);break;
  }
 }
 if(!scoped)return results[0]!;
 if(input.completedTaskMerge)return input.completedTaskMerge(results);
 if(input.reconcileRetainedResponses)return reconcileShotTaskResponses(input,results);
 try{return mergeShotTaskOutputs(results);}catch(error){
  if(input.phase==='planning'&&SHOT_TASK_ROLES.includes(input.role)&&!input.taskMode&&String((error as Error).message)==='Conflicting objectionResponses across shot tasks; no implicit overwrite')return reconcileShotTaskResponses(input,results);
  throw error;
 }
}
