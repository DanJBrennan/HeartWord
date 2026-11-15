import {describe,it,expect,vi} from "vitest";
import {codexInputBudget,codexOutputSchema} from "../../src/providers/codex-text.js";
import Ajv2020 from "ajv/dist/2020.js";
import {normalizeRecordedDirectionUpdates,literalFactLookupBlock,oversizedContributionIndex,chapterCrewPacket,scopedCrewPacket,retrieveCrewEvidence,dispatchCrewTask,mergeShotTaskOutputs,normalizeTaskDirections} from "../../src/pipeline/creative-direction/crew-tasks.js";
import {newProductionRecord,recordHash,saveContribution,acceptProductionRecord} from "../../src/pipeline/creative-direction/production-record.js";
import {crewSchema,validateContribution,runCrew} from "../../src/pipeline/creative-direction/crew.js";
import type {CrewBrief,CrewContribution,CrewRole} from "../../src/pipeline/creative-direction/crew-types.js";
function fixture():CrewBrief{return{project:{id:'p',language:'hatam',book:'mark',chapter:6},source:{text:[{verse:1,text:'exact first words'},{verse:2,text:'exact later words'}],reference:[{verse:1,text:'first reference'},{verse:2,text:'later reference'}],hashes:['pinned']},audio:[],canon:[],shots:Array.from({length:40},(_,i)=>({id:`s${i}`,sceneId:i<20?'a':'b',sceneSequence:i<20?1:2,sequence:i,verseRef:i<20?'v1':'v2',action:'Source-grounded action '+i,framing:'medium',cameraMovement:'static',continuity:'Retain established state',lighting:'daylight',needsLipSync:false,characterIds:[],dialogueCharacterId:null,beats:[],clip:null})),producerNotes:[{id:'global',subjectId:'p',note:'Keep announcement and all source words'},{id:'local',subjectId:'s0',note:'This specific shot instruction'},{id:'foreign',subjectId:'s30',note:'Other shot only'},{id:'unknown',subjectId:'old-version',note:'Unknown scopes must remain visible'}],spentUsd:0,audioAssets:[],render:null};}
function decodePrompt(prompt:string):any{const p=JSON.parse(prompt.split('BOUNDED CONTEXT:\n')[1]!.split('\nUse filmChanges')[0]!);const read=(n:any):any=>n&&typeof n==='object'&&n.$ref?read(p.definitions[Number(n.$ref.split('/').at(-1))]):p.idPrefixEncoding==='crew_id_v1'&&n&&typeof n==='object'&&n.$crewId?p.idPrefixes[n.$crewId[0]]+n.$crewId[1]:p.objectRowsEncoding==='prefix_columns_v1'&&n&&typeof n==='object'&&n.$columns&&n.$rows?read(n.$rows).map((r:any[])=>Object.fromEntries(r.map((v,i)=>[read(n.$columns)[i],v]))):Array.isArray(n)?n.map(read):n&&typeof n==='object'?Object.fromEntries(Object.entries(n).map(([k,v])=>[k,read(v)])):n;return read(p.payload??p);}
function setup(role:CrewRole='lighting_designer',phase='planning'){
 const brief=fixture(),record=newProductionRecord(brief,'run','hash'),requests:string[]=[];
 const prompt=`You are HeartWord's ${role.replaceAll('_',' ')}. Phase: ${phase}; pass 1/2.\nReview the whole chapter and preceding contributions.\nYour directions array must contain exactly 40 entries, one for each shot.\nBOUNDED CONTEXT:\n{}\nUse filmChanges only with exact facts.`;
 return{brief,record,requests,input:{prompt,schema:crewSchema(role),media:[],role,phase,brief,contributions:{},record,specialistBytes:200000,chapterBytes:600000,onRequest:(p:string)=>requests.push(p),validate:(raw:unknown)=>validateContribution(raw,role,brief)}};
}
describe('explicit technical-owner response consolidation',()=>{
 it.each(['valid','stale','duplicate','foreign','mixed','empty'])('applies only explicit exact-base direction updates and preserves unlisted instructions: %s',kind=>{
  const x=setup(),proposal:CrewContribution={summary:'Exact prior',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Original '+s.id,scriptureBasis:'Exact source'})),findings:[]},before=JSON.stringify(proposal),replacement={...proposal.directions[3]!,instruction:'Reconcile palace key only'},updates=kind==='duplicate'?[replacement,replacement]:kind==='foreign'?[{...replacement,shotId:'foreign'}]:kind==='empty'?[]:[replacement],raw={summary:'Owner corrected one instruction',directions:kind==='mixed'?[replacement]:[],findings:[],directionUpdates:{baseDirectionsSha256:kind==='stale'?'stale':recordHash(proposal.directions),updates}};
  if(kind!=='valid'){expect(()=>normalizeRecordedDirectionUpdates(raw,proposal)).toThrow();expect(JSON.stringify(proposal)).toBe(before);return;}const output=normalizeRecordedDirectionUpdates(raw,proposal);expect(output).not.toHaveProperty('directionUpdates');expect(output.directions).toHaveLength(40);for(let i=0;i<40;i++)expect(output.directions[i]).toEqual(i===3?replacement:proposal.directions[i]);expect(JSON.stringify(proposal)).toBe(before);
 });
 it('offers a hash-pinned update schema only for recorded corrections and merges its native delta before validation',async()=>{
  const x=setup(),proposal:CrewContribution={summary:'Complete saved proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact '+s.id,scriptureBasis:'Source'})),findings:[]};proposal.exchange=saveContribution(x.record,x.brief,x.input.role,1,proposal,'planning');const hash=recordHash(proposal.directions),schemaBefore=JSON.stringify(x.input.schema),replacement={...proposal.directions[0]!,instruction:'Fixed hall-left key, same pose'};
  const result=await dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:proposal},call:async(p,s:any)=>{expect(s.properties.directionUpdates.properties.baseDirectionsSha256.enum).toEqual([hash]);expect(p).toContain('DIRECTION UPDATE BASE (literal):');expect(p).toContain(hash);return{summary:'One selected technical correction',directions:[],findings:[],directionUpdates:{baseDirectionsSha256:hash,updates:[replacement]}};}});expect(result.directions[0]).toEqual(replacement);expect(result.directions.slice(1)).toEqual(proposal.directions.slice(1));expect(JSON.stringify(x.input.schema)).toBe(schemaBefore);expect(result).not.toHaveProperty('directionUpdates');
 });
 it('presents exact before-facts as literal grouped JSON and excludes invalid placeholders',async()=>{
  const x=setup(),ref='fact:'+JSON.stringify(['a','states','state:s0','light.direction']),other='fact:'+JSON.stringify(['a','states','state:s1','light.direction']),bad=ref+' prose',evidence=retrieveCrewEvidence(x.brief,x.record,[ref,other,bad,ref+'#/owner']),block=literalFactLookupBlock(evidence),groups=JSON.parse(block.split('\n')[2]!);expect(block).toContain('proposed baseline fact');expect(groups.flatMap((g:any)=>g.references)).toEqual([ref,other]);for(const g of groups)for(const key of g.references)expect(g.fact).toEqual((evidence[key] as any).value);expect(groups).toHaveLength(1);expect(block).not.toContain(bad);expect(block).not.toContain(ref+'#/owner');expect(()=>literalFactLookupBlock({[ref]:{sha256:'wrong',value:{value:'invented'}}})).toThrow('hash mismatch');
  x.brief.shots=x.brief.shots.slice(0,1);let calls=0;await dispatchCrewTask({...x.input,call:async p=>{calls++;if(calls===1)return{summary:'Exact before needed',directions:[],findings:[],contextRequests:[ref]};expect(p).toContain('LITERAL BEFORE-FACT RECORDS');const literal=JSON.parse(p.split('LITERAL BEFORE-FACT RECORDS (unencoded JSON; identical records grouped by hash):\n')[1]!.split('\n')[0]!);expect(literal[0].fact).toEqual((retrieveCrewEvidence(x.brief,x.record,[ref])[ref] as any).value);return answer(p);}});expect(calls).toBe(2);
 });
 it.each([' trailing prose',' broken]'])('returns an explicit malformed-fact error without silently reading the valid prefix: %s',suffix=>{
  const x=setup(),ref='fact:'+JSON.stringify(['a','states','state:s0','light.direction'])+suffix,before=JSON.stringify(x.record),entry:any=retrieveCrewEvidence(x.brief,x.record,[ref])[ref];expect(entry.invalidReference).toBe(true);expect(entry.notAFact).toBe(true);expect(entry.value).toMatchObject({status:'invalid_fact_reference',requestedRef:ref,notAnApproval:true});expect(entry.value).not.toHaveProperty('value');expect(entry.value).not.toHaveProperty('availableInLayer');expect(JSON.stringify(x.record)).toBe(before);
 });
 it.each(['correct','invalid_before'])('requires another exact request before using a malformed fact locator: %s',async mode=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);const good='fact:'+JSON.stringify(['a','states','state:s0','light.direction']),bad=good+' trailing prose';let calls=0;
  const work=dispatchCrewTask({...x.input,call:async(p:string)=>{calls++;const packet=decodePrompt(p);if(calls===1)return{summary:'Before fact required',directions:[],findings:[],contextRequests:[bad]};expect(packet.retrievedEvidence[bad].invalidReference).toBe(true);if(calls===2)return mode==='correct'?{summary:'Corrected exact locator',directions:[],findings:[],contextRequests:[good]}:{...answer(p),filmChanges:[{target:{layer:'states',entityId:'state:s0',fact:'light.direction'},before:packet.retrievedEvidence[bad].value,after:'invented'}]};expect(packet.retrievedEvidence[good]).toEqual(retrieveCrewEvidence(x.brief,x.record,[good])[good]);return answer(p);}});
  if(mode==='correct'){expect((await work).directions).toHaveLength(1);expect(calls).toBe(3);}else await expect(work).rejects.toThrow('retrieved exact before-fact');
 });
 it.each(['hold','approve','acknowledge'])('explicitly indexes an oversized full contribution without hiding open issues or granting unread authority: %s',async mode=>{
  const x=setup('production_director'),prior:CrewContribution={summary:'Original held proposal',directions:x.brief.shots.map((s,i)=>({shotId:s.id,instruction:'Exact '+i+' '+('unique instruction '+i+' ').repeat(8),scriptureBasis:'Source'})),taskSummaries:Array.from({length:40},(_,i)=>({task:i+1,shotIds:['s'+i],summary:('Archived original task explanation '+i+' ').repeat(100)})),findings:[{shotId:'s0',severity:'blocking',evidence:'Actual owned concern',requestedChange:'Owner must review',confidence:90,limitations:'No media'}]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');const id=prior.exchange[0]!.id,ref='contribution:'+id,retained={[id]:prior},before=JSON.stringify(x.record),full=retrieveCrewEvidence(x.brief,x.record,[ref],retained)[ref];let calls=0;
  const attempt=dispatchCrewTask({...x.input,chapterBytes:80000,reviewRecordedProposal:true,contributions:{production_director:prior},retainedContributions:retained,pendingEvidence:{role:x.input.role,nextRound:1,refs:[ref],originEventId:'source:production_director:1:chapter-rollup:task-1:evidence-0'},call:async p=>{calls++;const packet=decodePrompt(p),entry=packet.retrievedEvidence[ref];expect(entry).toEqual(oversizedContributionIndex(ref,full));expect(entry.notSuppliedFullBody).toBe(true);expect(entry.value.originalSha256).toBe(recordHash((full as any).value));expect(entry.value.notRead).toBe(true);expect(packet.brief.source).toEqual(x.brief.source);expect(packet.brief.shots).toEqual(x.brief.shots);expect(packet.productionRecord.objections).toContainEqual(x.record.objections[0]);
   if(calls===1&&mode==='hold')return{summary:'Only a required field is needed',directions:[],findings:[],contextRequests:[ref+'#/roleOutput/summary']};
   if(mode==='hold')expect(packet.retrievedEvidence[ref+'#/roleOutput/summary'].value).toBe(prior.summary);
   return{summary:'Full archive remains unread; actual blocker holds',directions:[],findings:[],decision:mode==='approve'?'approve':'hold',acceptedContributionIds:[],decisionConfidence:90,decisionLimitations:'Unfulfilled archive request',acceptanceChecks:{status:'hold',evidence:'Open issue'},...(mode==='acknowledge'?{ownerResponses:[{contributionId:id,outcome:'accepted',rationale:'Forbidden unread acknowledgment',evidence:'Index only'}]}:{})};
  }});
  if(mode==='hold'){const result=await attempt;expect(result.decision).toBe('hold');expect(result.directions).toEqual(prior.directions);expect(calls).toBe(2);}else await expect(attempt).rejects.toThrow(mode==='approve'?'Unfulfilled full-contribution':'Oversized contribution index');expect(JSON.stringify(x.record)).toBe(before);
 });
 it('fits final Director instruction evidence by indexing nonblocking prose while preserving every blocker and requested field',async()=>{
  const x=setup('production_director'),prior:CrewContribution={summary:'Original held Director',directions:x.brief.shots.map((s,i)=>({shotId:s.id,instruction:'Exact '+i+' '+('instruction '+i+' ').repeat(110),scriptureBasis:'Source'})),findings:[{shotId:'s0',severity:'blocking',evidence:'Director actual blocker',requestedChange:'Retain hold',confidence:90,limitations:'Planning'}]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');const id=prior.exchange[0]!.id,ref='contribution:'+id,field=ref+'#/roleOutput/directions',contributions:any={production_director:prior};
  for(const role of ['sound_designer','composer'] as const){
   x.record.revision='historical';const old:CrewContribution={summary:'Old issues',directions:[],findings:Array.from({length:20},(_,i)=>({shotId:null,severity:'advisory',evidence:'Exact old action evidence '+i,requestedChange:'Exact global '+i+' '+('advisory '+i+' ').repeat(45),confidence:90,limitations:'Actual media remains unverified'}))};old.exchange=saveContribution(x.record,x.brief,role,1,old,'planning');x.record.revision='run';
   const current:CrewContribution={summary:('Foreign '+role+' summary ').repeat(220),directions:[],findings:[],treatmentReview:{status:'clear',evidence:('Exact '+role+' rationale ').repeat(60),requestedChange:'Retain exact action',confidence:90,limitations:'No target heard'}};current.exchange=saveContribution(x.record,x.brief,role,1,current,'planning');contributions[role]=current;
  }
  const before=JSON.stringify(x.record),call=vi.fn(async(p:string)=>{const packet=decodePrompt(p);expect(packet.directorReadPolicy).toContain('NOT read');expect(packet.audit.archivedAncestryLinks).toBeUndefined();expect(packet.audit.archivedAncestryIndex.sha256).toHaveLength(64);expect(packet.globalAdvisoryActionsArchive.count).toBe(40);expect(packet.retrievedEvidence[field].value).toEqual(prior.directions);expect(packet.contributions.production_director.directions).toEqual(prior.directions);expect(packet.contributions.production_director.directionIndex).toBeUndefined();expect(packet.retrievedEvidence[ref]).toEqual(retrieveCrewEvidence(x.brief,x.record,[ref],{[id]:prior})[ref]);for(const o of x.record.objections.filter(o=>o.status==='open'&&o.severity==='blocking'))expect(packet.productionRecord.objections).toContainEqual(o);for(const o of x.record.objections.filter(o=>o.severity==='advisory'))expect(packet.chapterIssueIndex).toContainEqual(expect.objectContaining({id:o.id,status:o.status,owner:o.owner,globalAdvisoryRequestIndexed:true}));expect(packet.contributions.sound_designer.treatmentReview).toEqual(contributions.sound_designer.treatmentReview);expect(packet.contributions.composer.treatmentReview).toEqual(contributions.composer.treatmentReview);expect(packet.brief.source).toEqual(x.brief.source);return{summary:'Instructions read; unrelated prose not read; blockers hold',directions:[],findings:[],decision:'hold'};});
  const result=await dispatchCrewTask({...x.input,chapterBytes:110000,reviewRecordedProposal:true,contributions,retainedContributions:{[id]:prior},pendingEvidence:{role:x.input.role,nextRound:2,refs:[ref,field],originEventId:'source:production_director:1:chapter-rollup:task-1:evidence-1'},call});expect(call).toHaveBeenCalledTimes(1);expect(result.directions).toEqual(prior.directions);expect(JSON.stringify(x.record)).toBe(before);
 });
 it('supplies Director instructions and complete mandatory review evidence before optional archive prose',async()=>{
  const x=setup('production_director'),prior:CrewContribution={summary:'Saved Director handoff',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Original '+s.id+' '+('preserve source action '+s.id+' ').repeat(8),scriptureBasis:'Source'})),findings:[]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');
  x.record.revision='older';const archive:CrewContribution={summary:'Old advisory explanations',directions:[],findings:Array.from({length:30},(_,i)=>({shotId:null,severity:'advisory',evidence:'Unpassed '+i,requestedChange:('Optional future condition '+i+' ').repeat(100),confidence:90,limitations:'Later media checks'}))};archive.exchange=saveContribution(x.record,x.brief,'sound_designer',1,archive,'planning');x.record.revision='run';
  const review={status:'clear' as const,evidence:'Complete current causal-treatment rationale',requestedChange:'Retain plan',confidence:90,limitations:'Actual media not assessed'},foreign:CrewContribution={summary:'Foreign optional summary '.repeat(400),directions:[],findings:[],treatmentReview:review};foreign.exchange=saveContribution(x.record,x.brief,'sound_designer',1,foreign,'planning');const before=JSON.stringify(x.record);
  const call=vi.fn(async(p:string)=>{const packet=decodePrompt(p);expect(packet.globalAdvisoryActionsArchive.count).toBe(30);expect(packet.contributions.production_director.directions).toEqual(prior.directions);expect(packet.contributions.production_director.directionIndex).toBeUndefined();expect(packet.contributions.sound_designer.treatmentReview).toEqual(review);expect(packet.contributions.sound_designer.summarySource.notRead).toBe(true);return{summary:'Plan remains held pending normal dispositions',directions:[],findings:[],decision:'hold'};});
  await dispatchCrewTask({...x.input,chapterBytes:55000,reviewRecordedProposal:true,contributions:{production_director:prior,sound_designer:foreign},call});expect(call).toHaveBeenCalledTimes(1);expect(JSON.stringify(x.record)).toBe(before);
 });
 it('indexes only eligible foreign advisory explanations while retaining actions and exact requested bodies',async()=>{
  const x=setup('production_director'),prior:CrewContribution={summary:'Director handoff',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact '+s.id,scriptureBasis:'Source'})),findings:[{shotId:'s0',severity:'advisory',evidence:'Own complete advisory evidence',requestedChange:'Own action',confidence:90,limitations:'Still open'}]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');
  const foreign:CrewContribution={summary:'Current foreign advice',directions:[],findings:Array.from({length:24},(_,i)=>({shotId:'s'+i,severity:i===0?'blocking':'advisory',evidence:('Foreign exact explanation '+i+' ').repeat(180),requestedChange:'Exact requested action '+i,confidence:90,limitations:'Future target not seen'}))};foreign.exchange=saveContribution(x.record,x.brief,'clarity_challenger',1,foreign,'planning');
  const issues=x.record.objections.filter(o=>o.owner==='clarity_challenger'),pending=structuredClone(foreign.exchange[0]!),fact=x.record.snapshots[0]!.states[0]!.facts['light.direction']!;pending.id='pending';pending.proposedChanges=[{target:{layer:'states',entityId:'state:s0',fact:'light.direction'},before:structuredClone(fact),after:{...structuredClone(fact),value:'Pending'}}];pending.objections=[issues[1]!.id];x.record.history.push(pending);
  const unknown={...structuredClone(issues[2]!),id:'unknown',owner:'unknown_owner' as CrewRole};x.record.objections.push(unknown);const unknownHistory=structuredClone(x.record.history.find(h=>h.id===issues[2]!.id)!);unknownHistory.id=unknown.id;unknownHistory.owner=unknown.owner;x.record.history.push(unknownHistory);const before=JSON.stringify(x.record),ref='contribution:'+issues[2]!.id+'#/findingRecord';let calls=0;
  await dispatchCrewTask({...x.input,chapterBytes:65000,reviewRecordedProposal:true,contributions:{production_director:prior,clarity_challenger:foreign},retainedContributions:{[foreign.exchange[0]!.id]:foreign},call:async p=>{
   const packet=decodePrompt(p);for(const o of [issues[0],issues[1],unknown,...x.record.objections.filter(o=>o.owner===x.input.role)])expect(packet.productionRecord.objections).toContainEqual(o);
   for(const o of issues.slice(2)){expect(packet.productionRecord.objections).not.toContainEqual(o);expect(packet.chapterIssueIndex).toContainEqual({id:o.id,owner:o.owner,shotId:o.shotId,severity:o.severity,status:o.status});expect(packet.foreignAdvisoryActions).toContainEqual({id:o.id,requestedChange:o.requestedChange});}
   expect(packet.foreignAdvisoryExplanationsArchive).toMatchObject({count:22,sha256:recordHash(issues.slice(2)),notRead:true,notAnApproval:true});if(++calls===1)return{contextRequests:[ref]};expect(packet.retrievedEvidence[ref].value).toEqual(issues[2]);return{summary:'Unmet conditions remain open',directions:[],findings:[],decision:'hold'};
  }});expect(calls).toBe(2);expect(JSON.stringify(x.record)).toBe(before);
 });
 it.each(['compact','requested','substantive','unknown','pending'] as const)('archives only unrequested pure prior Director response prose, preserving live conditions: %s',kind=>{
  // This test calls the real dispatcher below; keep its promise for Vitest.
  return (async()=>{
   const x=setup('production_director'),prior:CrewContribution={summary:'Previous Director hold',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact '+s.id,scriptureBasis:'Source'})),findings:Array.from({length:20},(_,i)=>({shotId:'s'+i,severity:'blocking',evidence:'Exact live condition '+i,requestedChange:'Assess actual current evidence '+i,confidence:90,limitations:'No actual media yet'}))};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');const issues=x.record.objections.filter(o=>o.owner===x.input.role),id=prior.exchange[0]!.id;
   prior.objectionResponses=issues.map((o,i)=>({objectionId:o.id,outcome:'carried',rationale:('Old response explanation '+i+' ').repeat(180),evidence:('Old supplied interpretation '+i+' ').repeat(180)}));if(kind==='substantive'){const fact=x.record.snapshots[0]!.states[0]!.facts['light.direction']!;prior.filmChanges=[{target:{layer:'states',entityId:'state:s0',fact:'light.direction'},before:structuredClone(fact),after:{...structuredClone(fact),value:'Pending direction'}}];}if(kind==='unknown')prior.objectionResponses[0]!.objectionId='unknown:production_director:1:finding:0';if(kind==='pending'){const h=structuredClone(prior.exchange[0]!);h.id='pending-source';const fact=x.record.snapshots[0]!.states[0]!.facts['light.direction']!;h.proposedChanges=[{target:{layer:'states',entityId:'state:s0',fact:'light.direction'},before:structuredClone(fact),after:{...structuredClone(fact),value:'Pending direction'}}];h.objections=[issues[0]!.id];x.record.history.push(h);}
   const old=structuredClone(prior.objectionResponses),before=JSON.stringify(x.record),ref='contribution:'+id+'#/roleOutput/objectionResponses',call=vi.fn(async(p:string)=>{const packet=decodePrompt(p),view=packet.contributions.production_director;expect(view.objectionResponses).toEqual([]);expect(view.priorObjectionResponseArchive).toMatchObject({sourceContributionId:id,count:20,sha256:recordHash(old),access:ref,notRead:true});expect(view.priorObjectionResponseArchive).not.toHaveProperty('index');expect((retrieveCrewEvidence(x.brief,x.record,[ref],{[id]:prior})[ref] as any).value).toEqual(old);for(const o of issues)expect(packet.productionRecord.objections).toContainEqual(o);expect(packet.contributions.production_director.directions).toEqual(prior.directions);if(kind==='requested')return{contextRequests:[ref]};return{summary:'Current original issues reviewed; all conditions still hold',directions:[],findings:[],decision:'hold',objectionResponses:issues.map(o=>({objectionId:o.id,outcome:'carried',rationale:'Fresh current condition remains unmet',evidence:'Current supplied issue inspected'}))};});
   const task=dispatchCrewTask({...x.input,chapterBytes:80000,reviewRecordedProposal:true,contributions:{production_director:prior},retainedContributions:{[id]:prior},call});if(kind==='compact'){const result=await task;expect(result.objectionResponses).toHaveLength(20);expect(result.objectionResponses![0]!.rationale).toBe('Fresh current condition remains unmet');expect(call).toHaveBeenCalledTimes(1);}else{await expect(task).rejects.toThrow('Crew input held before submission');expect(call).toHaveBeenCalledTimes(kind==='requested'?1:0);}expect(JSON.stringify(x.record)).toBe(before);expect(prior.objectionResponses).toEqual(old);
  })();
 });
 it('keeps the Staging instruction body before optional foreign issue and review prose',async()=>{
  const x=setup('staging_designer'),prior:CrewContribution={summary:'Complete current staging handoff',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact supported action '+s.id+' '+('physical staging '+s.id+' ').repeat(8),scriptureBasis:'Source'})),findings:[{shotId:'s0',severity:'blocking',evidence:'Own exact constraint',requestedChange:'Verify supported transfer',confidence:90,limitations:'Later target not seen'}]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');
  x.record.revision='older';const archive:CrewContribution={summary:'Foreign old advice',directions:[],findings:Array.from({length:30},(_,i)=>({shotId:null,severity:'advisory',evidence:'Unpassed foreign '+i,requestedChange:('Future target condition '+i+' ').repeat(20),confidence:90,limitations:'Later media'}))};archive.exchange=saveContribution(x.record,x.brief,'sound_designer',1,archive,'planning');x.record.revision='run';const foreign:CrewContribution={summary:'Foreign review explanation '.repeat(3000),directions:[],findings:[],treatmentReview:{status:'clear',evidence:'Foreign substantive explanation '.repeat(20),requestedChange:'Retain sound plan',confidence:90,limitations:'Not listened'}};foreign.exchange=saveContribution(x.record,x.brief,'sound_designer',1,foreign,'planning');const before=JSON.stringify(x.record);
  const call=vi.fn(async(p:string)=>{const packet=decodePrompt(p);expect(packet.contributions.staging_designer.directions).toEqual(prior.directions);expect(packet.contributions.staging_designer.directionIndex).toBeUndefined();for(const o of x.record.objections.filter(o=>o.owner==='staging_designer'&&o.status==='open'))expect(packet.productionRecord.objections).toContainEqual(o);expect(packet.chapterIssueIndex.filter((o:any)=>o.owner==='sound_designer')).toHaveLength(30);expect(packet.brief.source).toEqual(x.brief.source);return{summary:'Complete staging instructions inspected; actual target checks remain',directions:[],findings:[]};});
  await dispatchCrewTask({...x.input,chapterBytes:70000,reviewRecordedProposal:true,contributions:{staging_designer:prior,sound_designer:foreign},call});expect(call).toHaveBeenCalledTimes(1);expect(JSON.stringify(x.record)).toBe(before);
 });
 it.each(['staging_designer','production_director'] as const)('uses the explicit complete-instruction leaf instead of replaying archived exchanges for %s',async role=>{
  const x=setup(role),prior:CrewContribution={summary:'Saved current owner handoff',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Complete instruction '+s.id,scriptureBasis:'Exact source'})),findings:[],...(role==='production_director'?{decision:'hold' as const}:{})};prior.exchange=saveContribution(x.record,x.brief,role,1,prior,'planning');const id=prior.exchange[0]!.id,ref='contribution:'+id+'#/roleOutput/directions',before=JSON.stringify(x.record);let calls=0;
  await dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{[role]:prior},retainedContributions:{[id]:prior},call:async p=>{const packet=decodePrompt(p),source=packet.directionSources.find((d:any)=>d.owner===role);expect(source.directionsAccess).toBe(ref);expect(source.directionsSha256).toBe(recordHash(prior.directions));expect(source.objectionResponsesAccess).toBe('contribution:'+id+'#/roleOutput/objectionResponses');expect(p).toContain('do not request the entire archived contribution merely to inspect instructions');if(++calls===1)return{contextRequests:[source.directionsAccess]};expect(packet.retrievedEvidence[ref].value).toEqual(prior.directions);expect(Object.values(packet.retrievedEvidence).some((e:any)=>e.notSuppliedFullBody)).toBe(false);return{summary:'Complete exact instructions inspected without archived exchange',directions:[],findings:[],...(role==='production_director'?{decision:'hold'}:{})};}});expect(calls).toBe(2);expect(JSON.stringify(x.record)).toBe(before);
 });
 it('holds before submission when required Director review explanations cannot fit',async()=>{
  const x=setup('production_director'),prior:CrewContribution={summary:'Saved handoff',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact '+s.id,scriptureBasis:'Source'})),findings:[]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');const review={status:'clear' as const,evidence:Array.from({length:12000},(_,i)=>'Required unique evidence '+i).join(' '),requestedChange:'Retain source',confidence:90,limitations:'Not media approval'},foreign:CrewContribution={summary:'Current review',directions:[],findings:[],treatmentReview:review},call=vi.fn();
  await expect(dispatchCrewTask({...x.input,chapterBytes:55000,reviewRecordedProposal:true,contributions:{production_director:prior,composer:foreign},call})).rejects.toThrow('Crew input held before submission');expect(call).not.toHaveBeenCalled();expect(foreign.treatmentReview).toEqual(review);
 });
 it('indexes exact-version field locators only for complete role outputs, leaving selected fields and facts unchanged',()=>{
  const full={sha256:'original',value:{contribution:{id:'saved'},roleOutput:{summary:'Exact summary',directions:[]}}},view=oversizedContributionIndex('contribution:saved',full)!;expect(view.value.fields).toContainEqual({pointer:'/roleOutput/summary',access:'contribution:saved#/roleOutput/summary',bytes:15,sha256:recordHash('Exact summary')});expect(oversizedContributionIndex('contribution:saved#/roleOutput/summary',full)).toBeUndefined();expect(oversizedContributionIndex('fact:any',full)).toBeUndefined();expect(oversizedContributionIndex('contribution:saved',view)).toBeUndefined();expect(full.value.roleOutput.summary).toBe('Exact summary');
 });
 it('requires a final review at the explicitly extended third round without changing the default ceiling or schema',async()=>{
  const x=setup(),prior:CrewContribution={summary:'Saved proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Original '+s.id,scriptureBasis:'Source'})),findings:[]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');
  const schemaBefore=JSON.stringify(x.input.schema),recordBefore=JSON.stringify(x.record),pending={role:x.input.role,nextRound:3 as const,refs:['shot:s0'],originEventId:'source:lighting_designer:1:chapter-rollup:task-1:evidence-2'},call=vi.fn(async(p:string,s:any)=>{expect(p).toContain('evidence 3/3.');expect(p).toContain('FINAL EVIDENCE ROUND');expect(s.properties.contextRequests.maxItems).toBe(0);expect(decodePrompt(p).retrievedEvidence['shot:s0']).toEqual(retrieveCrewEvidence(x.brief,x.record,['shot:s0'])['shot:s0']);return{summary:'Owner retains unresolved limitations',directions:[],findings:[]};});
  await expect(dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:prior},pendingEvidence:pending,call})).rejects.toThrow('Invalid retained chapter evidence');expect(call).not.toHaveBeenCalled();
  const out=await dispatchCrewTask({...x.input,maxEvidenceRounds:3,reviewRecordedProposal:true,contributions:{lighting_designer:prior},pendingEvidence:pending,call});expect(call).toHaveBeenCalledTimes(1);expect(out.directions).toEqual(prior.directions);expect(JSON.stringify(x.input.schema)).toBe(schemaBefore);expect(JSON.stringify(x.record)).toBe(recordBefore);
 });
 it('returns explicit known-scene fact absence with real entity/key hints without inventing a value',()=>{
  const x=setup(),before=JSON.stringify(x.record),ref='fact:'+JSON.stringify(['a','states','a','lighting']),e:any=retrieveCrewEvidence(x.brief,x.record,[ref])[ref];expect(e.notAFact).toBe(true);expect(e.value).toMatchObject({status:'not_recorded',notAFact:true,notAnApproval:true,sourceSnapshotSha256:recordHash(x.record.snapshots[0])});expect(e.value.availableInLayer).toContainEqual(expect.objectContaining({entityId:'state:s0',factKeys:expect.arrayContaining(['light.direction'])}));expect(e.value).not.toHaveProperty('value');expect(JSON.stringify(x.record)).toBe(before);expect(()=>retrieveCrewEvidence(x.brief,x.record,['fact:'+JSON.stringify(['missing','states','a','lighting'])])).toThrow('Missing or unsupported');expect(()=>retrieveCrewEvidence(x.brief,x.record,['fact:'+JSON.stringify(['a','invalid','a','lighting'])])).toThrow('Invalid exact fact');
 });
 it('never accepts an absence placeholder as retrieved before-fact authority',async()=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);const ref='fact:'+JSON.stringify(['a','states','a','lighting']),absent:any=(retrieveCrewEvidence(x.brief,x.record,[ref])[ref] as any).value;let calls=0;await expect(dispatchCrewTask({...x.input,validate:raw=>raw as CrewContribution,call:async p=>++calls===1?{contextRequests:[ref]}:{...answer(p),filmChanges:[{target:{layer:'states',entityId:'a',fact:'lighting'},before:absent,after:absent}]}})).rejects.toThrow('retrieved exact before-fact');expect(calls).toBe(2);
 });
 it('restores cumulative evidence in bounded local lookup groups without adding an inference round',async()=>{
  const x=setup(),prior:CrewContribution={summary:'Recorded proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact instruction',scriptureBasis:'Source'})),findings:[]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');const refs=Array.from({length:16},(_,i)=>'shot:s'+i),call=vi.fn(async(p:string)=>{const packet=decodePrompt(p);expect(p).toContain('evidence 2/2.');for(const ref of refs)expect(packet.retrievedEvidence[ref]).toEqual(retrieveCrewEvidence(x.brief,x.record,[ref])[ref]);return{summary:'Final owner reply, not approval',directions:[],findings:[]};});
  await dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:prior},pendingEvidence:{role:x.input.role,nextRound:2,refs,originEventId:'prior:lighting_designer:1:chapter-rollup:task-1:evidence-1'},call});expect(call).toHaveBeenCalledTimes(1);
  const invalid=vi.fn();await expect(dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:prior},pendingEvidence:{role:x.input.role,nextRound:2,refs:Array.from({length:25},(_,i)=>'shot:s'+i),originEventId:'prior:lighting_designer:1:chapter-rollup:task-1:evidence-1'},call:invalid})).rejects.toThrow('Invalid retained');expect(invalid).not.toHaveBeenCalled();expect(()=>retrieveCrewEvidence(x.brief,x.record,refs)).toThrow('1-12');
 });
 it('indexes foreign interpretive prose with exact retrieval while retaining review actions and current-role prose',async()=>{
  const x=setup(),prior:CrewContribution={summary:'Own complete summary',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact instruction',scriptureBasis:'Source'})),findings:[]};prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');const contributions:any={lighting_designer:prior},retained:any={};
  for(const role of ['composer','sound_designer','picture_editor'] as const){const c:any={summary:('Unique '+role+' summary. ').repeat(200),directions:prior.directions,findings:[],treatmentReview:{status:'concern',evidence:('Detailed '+role+' rationale. ').repeat(200),requestedChange:'Keep exact '+role+' action',confidence:90,limitations:'No target media reviewed'},...(['composer','sound_designer'].includes(role)?{audioCues:[],generationRequests:[]}:{edits:[],pauses:[],coverageRequests:[]})};c.exchange=saveContribution(x.record,x.brief,role,1,c,'planning');contributions[role]=c;retained[c.exchange[0].id]=c;}
  const before=JSON.stringify(x.record);await dispatchCrewTask({...x.input,chapterBytes:35000,reviewRecordedProposal:true,contributions,retainedContributions:retained,call:async p=>{const packet=decodePrompt(p);expect(packet.foreignReviewReadPolicy).toContain('were not read');expect(packet.contributions.lighting_designer.summary).toBe(prior.summary);for(const role of ['composer','sound_designer','picture_editor']){const view=packet.contributions[role];expect(view.treatmentReview).toMatchObject({status:'concern',requestedChange:'Keep exact '+role+' action',confidence:90});expect(view.treatmentReview).not.toHaveProperty('evidence');expect(view.treatmentReview.indexedEvidence.sha256).toBe(recordHash(contributions[role].treatmentReview));const ref=view.treatmentReview.indexedEvidence.access;expect((retrieveCrewEvidence(x.brief,x.record,[ref],retained)[ref] as any).value).toEqual(contributions[role].treatmentReview);}return{summary:'Owner checked own task',directions:[],findings:[]};}});expect(JSON.stringify(x.record)).toBe(before);
 });
 it.each(['script_supervisor','fidelity_challenger','production_director'] as const)('fits %s issues as a complete action index without clearing blockers or hiding unknown owners',async foreignRole=>{
  const x=setup(),prior:CrewContribution={summary:'Saved complete role',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Retain exact instruction',scriptureBasis:'Source'})),findings:[]};
  prior.exchange=saveContribution(x.record,x.brief,'lighting_designer',1,prior,'planning');
  const foreign:CrewContribution={summary:'Foreign issues',directions:prior.directions,findings:Array.from({length:45},(_,i)=>({shotId:'s'+i%40,severity:'blocking' as const,evidence:'Unique issue '+i+' '+('specific evidence '+i+' ').repeat(100),requestedChange:'Keep exact action '+i,confidence:90,limitations:'Planning evidence '+i}))};
  foreign.exchange=saveContribution(x.record,x.brief,foreignRole,1,foreign,'planning');
  const unknown=x.record.objections[0]!;unknown.owner='unknown_owner' as any;x.record.history.find(h=>h.id===unknown.id)!.owner='unknown_owner' as any;
  const before=JSON.stringify(x.record),call=vi.fn(async(p:string)=>{const packet=decodePrompt(p),visible=new Map([...packet.productionRecord.objections,...packet.chapterIssueIndex].map((o:any)=>[o.id,o]));for(const o of x.record.objections){expect(visible.get(o.id)).toMatchObject({id:o.id,owner:o.owner,status:o.status,severity:o.severity,shotId:o.shotId});if(o.owner!=='unknown_owner')expect((visible.get(o.id) as any).requestedChange).toBe(o.requestedChange);}expect(packet.productionRecord.objections).toContainEqual(unknown);expect(packet.contributions[foreignRole].objectionResponseSource.access).toContain('previous_role:'+foreignRole);return{summary:'Fresh review; blockers remain',directions:[],findings:[]};});
  await dispatchCrewTask({...x.input,chapterBytes:40000,reviewRecordedProposal:true,contributions:{lighting_designer:prior,[foreignRole]:foreign},call});expect(call).toHaveBeenCalledTimes(1);expect(JSON.stringify(x.record)).toBe(before);
 });
 it('supplies exact foreign responses to the current owners issues while indexing unrelated responses',async()=>{
  const x=setup(),prior:CrewContribution={summary:'Original instructions',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact instruction',scriptureBasis:'Source'})),findings:[{shotId:'s0',severity:'blocking',evidence:'Owner issue',requestedChange:'Review',confidence:90,limitations:'Planning'}]};
  prior.exchange=saveContribution(x.record,x.brief,'lighting_designer',1,prior,'planning');const own=x.record.objections[0]!.id;
  const relevant={objectionId:own,outcome:'resolved' as const,rationale:'Exact supplied owner answer',evidence:'Exact target evidence'},other={objectionId:'unrelated',outcome:'carried' as const,rationale:'Unrelated prose',evidence:'Unrelated evidence'};
  const foreign:CrewContribution={summary:'Camera answer',directions:prior.directions,findings:[],objectionResponses:[relevant,other]};
  await dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:prior,cinematographer:foreign},call:async p=>{const packet=decodePrompt(p);expect(packet.contributions.cinematographer.objectionResponses).toEqual([relevant]);expect(packet.contributions.cinematographer.objectionResponseIndex).toEqual([{objectionId:'unrelated',outcome:'carried'}]);return{summary:'Fresh review',directions:[],findings:[]};}});
  expect(x.record.objections[0]!.status).toBe('open');expect(foreign.objectionResponses).toEqual([relevant,other]);
 });
 it('freshly reviews saved instructions in one call without inheriting findings or dispositions',async()=>{
  const x=setup(),prior:CrewContribution={summary:'Prior held proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Retained instruction '+s.id,scriptureBasis:'Exact source'})),findings:[{shotId:'s0',severity:'blocking',evidence:'Old unresolved issue',requestedChange:'Owner review',confidence:90,limitations:'Planning'}]};
  prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');
  const before=JSON.stringify(x.record),call=vi.fn(async(p:string)=>{const packet=decodePrompt(p);expect(packet.recordedProposalReview.sourceContributionId).toBe(prior.exchange![0]!.id);expect(packet.brief.source).toEqual(x.brief.source);expect(p).toContain('FRESH whole-chapter owner correction');return{summary:'Instructions retained; issue carried',directions:[],findings:[]};});
  const result=await dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:prior},call});
  expect(call).toHaveBeenCalledTimes(1);expect(result.directions).toEqual(prior.directions);expect(result.findings).toEqual([]);expect(result.exchange).toBeUndefined();expect(JSON.stringify(x.record)).toBe(before);expect(x.record.objections[0]!.status).toBe('open');expect(x.record.acceptedContributionIds).toEqual([]);
 });
 it.each(['missing','duplicate','foreign','unrecorded'])('rejects unsafe saved correction coverage (%s)',async kind=>{
  const x=setup(),prior:CrewContribution={summary:'Saved proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact instruction',scriptureBasis:'Exact source'})),findings:[]};
  prior.exchange=saveContribution(x.record,x.brief,x.input.role,1,prior,'planning');
  if(kind==='missing')prior.directions.pop();if(kind==='duplicate')prior.directions[1]!.shotId='s0';if(kind==='foreign')prior.directions[0]!.shotId='foreign';if(kind==='unrecorded')x.record.history=[];
  const call=vi.fn();await expect(dispatchCrewTask({...x.input,reviewRecordedProposal:true,contributions:{lighting_designer:prior},call})).rejects.toThrow('complete matching saved role directions');expect(call).not.toHaveBeenCalled();
 });
 it.each(['final','request_again'])('continues pending evidence at round1 with exact records and preserves the original two-round cap (%s)',async mode=>{
  const x=setup('production_director'),directions=x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact original instruction '+s.id,scriptureBasis:'v1'})),parts=[{summary:'Complete verified detail',directions,findings:[]}];let calls=0;
  const attempt=dispatchCrewTask({...x.input,retainedShotTasks:parts,reconcileRetainedResponses:true,pendingEvidence:{role:'production_director',nextRound:1,refs:['current_direction:s7'],originEventId:'source:production_director:1:chapter-rollup:task-1:evidence-0'},call:async p=>{
   calls++;const packet=decodePrompt(p);expect(p).toContain(`evidence ${calls}/2.`);expect(packet.retrievedEvidence['current_direction:s7'].value).toEqual(directions[7]);expect(packet.retainedEvidenceRequest.originEventId).toContain('source:production_director');
   if(calls===1)return{summary:'One more exact instruction',directions:[],findings:[],contextRequests:['current_direction:s8']};expect(packet.retrievedEvidence['current_direction:s8'].value).toEqual(directions[8]);
   return mode==='request_again'?{summary:'Not accepted',directions:[],findings:[],contextRequests:['current_direction:s9']}:{summary:'Still no approval',directions:[],findings:[],decision:'hold',decisionConfidence:90,decisionLimitations:'Further prerequisites',acceptedContributionIds:[],acceptanceChecks:{status:'unverified',evidence:'No target media'}};
  }});
  if(mode==='request_again')await expect(attempt).rejects.toThrow('Evidence round limit');else expect((await attempt).directions).toEqual(directions);expect(calls).toBe(2);
 });
 it('holds a recorded Director correction locally rather than submitting indexed sole-generation instructions',async()=>{
  const x=setup('production_director'),prior:CrewContribution={summary:'Saved Director correction',directions:x.brief.shots.map((s,i)=>({shotId:s.id,scriptureBasis:'Source',instruction:Array.from({length:220},(_,j)=>`Unique recorded direction ${i} component ${j};`).join(' ')})),findings:[]};prior.exchange=saveContribution(x.record,x.brief,'production_director',1,prior,'planning');const before=JSON.stringify(prior),call=vi.fn();
  await expect(dispatchCrewTask({...x.input,chapterBytes:50000,reviewRecordedProposal:true,contributions:{production_director:prior},call})).rejects.toThrow('Crew input held before submission');expect(call).not.toHaveBeenCalled();expect(JSON.stringify(prior)).toBe(before);
 });
 it('indexes oversized already-reviewed directions, retrieves an exact body and preserves every instruction and finding without approving the chapter',async()=>{
  const x=setup('production_director'),oldFinding={shotId:'s7',severity:'blocking' as const,evidence:'Original owner issue',requestedChange:'Review exact instruction',confidence:90,limitations:'Planning only'};
  saveContribution(x.record,x.brief,'production_director',0,{summary:'Earlier issue',directions:[],findings:[oldFinding]},'planning');const issue=x.record.objections[0]!.id;
  const directions=x.brief.shots.map((s,i)=>({shotId:s.id,scriptureBasis:'v1',instruction:Array.from({length:220},(_,j)=>`Unique instruction ${i} component ${j};`).join(' ')}));
  const parts=[0,20].map((at,i)=>({summary:'Completed original detail '+i,directions:directions.slice(at,at+20),findings:[{...oldFinding,evidence:'LOCAL_FINDING_MUST_STAY_'+i}]}));const before=JSON.stringify(x.record);let calls=0;
  const result=await dispatchCrewTask({...x.input,chapterBytes:50000,retainedShotTasks:parts,reconcileRetainedResponses:true,call:async p=>{
   calls++;const packet=decodePrompt(p),current=packet.contributions.production_director;expect(packet.brief.source).toEqual(x.brief.source);expect(packet.brief.shots).toHaveLength(40);expect(current.directions).toEqual([]);expect(current.directionIndex).toHaveLength(40);expect(current.findings).toHaveLength(2);expect(packet.productionRecord.objections).toContainEqual(x.record.objections[0]);expect(p).toContain('not directly viewed in this consolidation');
   if(calls===1)return{summary:'Exact indexed instruction needed',directions:[],findings:[],contextRequests:['current_direction:s7']};
   const retrieved=packet.retrievedEvidence['current_direction:s7'];expect(retrieved.value).toEqual(directions[7]);expect(retrieved.sha256).toBe(current.directionIndex[7].sha256);expect(retrieved.source.proposalSha256).toBe(packet.chapterDetailReview.proposalSha256);expect(retrieved.source.role).toBe('production_director');
   return{summary:'No chapter acceptance',directions:[],findings:[],decision:'hold',decisionConfidence:90,decisionLimitations:'Remaining prerequisites',acceptedContributionIds:[],acceptanceChecks:{status:'unverified',evidence:'No target media inspected'},objectionResponses:[{objectionId:issue,outcome:'carried',rationale:'Exact instruction checked; further requirements remain',evidence:'Supplied instruction and original issue'}]};
  }});expect(calls).toBe(2);expect(result.directions).toEqual(directions);expect(result.findings).toEqual(parts.flatMap(p=>p.findings));expect(result.decision).toBe('hold');expect(JSON.stringify(x.record)).toBe(before);
 });
 it.each(['unreviewed','partial','duplicate'])('refuses an unsafe indexed current-direction fallback (%s)',async kind=>{
  const x=setup('production_director'),call=vi.fn(),directions=x.brief.shots.map(s=>({shotId:s.id,instruction:'Source-grounded instruction',scriptureBasis:'v1'}));if(kind==='partial')directions.pop();if(kind==='duplicate')directions[1]!.shotId=directions[0]!.shotId;
  await expect(dispatchCrewTask({...x.input,chapterBytes:1000,taskMode:'chapter-rollup',rollup:{proposal:{summary:'Proposed directions',directions,findings:[]},detailRequests:kind==='unreviewed'?0:2},call})).rejects.toThrow('complete unique reviewed direction coverage');expect(call).not.toHaveBeenCalled();
 });
 it('rejects missing, foreign and ambiguous current-direction evidence without inventing a body',()=>{
  const x=setup(),d={shotId:'s0',instruction:'Exact scoped instruction',scriptureBasis:'v1'},current={role:'production_director' as const,proposal:{summary:'Current proposal',directions:[d],findings:[]}};
  expect(()=>retrieveCrewEvidence(x.brief,x.record,['current_direction:s0'])).toThrow();expect(()=>retrieveCrewEvidence(x.brief,x.record,['current_direction:foreign'],{},current)).toThrow();expect(()=>retrieveCrewEvidence(x.brief,x.record,['current_direction:s0'],{},{...current,proposal:{...current.proposal,directions:[d,d]}})).toThrow();
 });
 it.each(['script_supervisor','sound_designer','composer','picture_editor','fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'] as const)('resumes completed %s details with one whole-chapter call, retaining findings and exact foreign-response retrieval',async role=>{
  const x=setup(role);
  const issueFinding={shotId:'s0',severity:'blocking' as const,evidence:'Earlier written question',requestedChange:'Owner must decide',confidence:90,limitations:'Planning only'};
  saveContribution(x.record,x.brief,role,0,{summary:'Previous issue',directions:[],findings:[issueFinding]},'planning');const issue=x.record.objections[0]!.id;
  saveContribution(x.record,x.brief,'cinematographer',0,{summary:'Earlier camera question',directions:[],findings:[issueFinding]},'planning');const cameraIssue=x.record.objections.at(-1)!.id;
  const explanation='EXACT_FOREIGN_RESPONSE_EXPLANATION';
  const camera:CrewContribution={summary:'Current camera decision',directions:[],findings:[],objectionResponses:[{objectionId:cameraIssue,outcome:'resolved',rationale:explanation,evidence:'Reviewed source geometry'}]};camera.exchange=saveContribution(x.record,x.brief,'cinematographer',1,camera,'planning');
  const parts=[0,20].map((at,i)=>({summary:'Original completed detail '+i,directions:x.brief.shots.slice(at,at+20).map(s=>({shotId:s.id,instruction:'Retain original source action',scriptureBasis:'v1'})),findings:[{...issueFinding,shotId:'s'+at,evidence:'Original retained detail finding '+i}],objectionResponses:[{objectionId:issue,outcome:i?'resolved' as const:'carried' as const,rationale:'Original scoped response '+i,evidence:'Original scope '+i}]}));
  const before=JSON.stringify(x.record);let calls=0;
  const retainedContributions={[camera.exchange[0]!.id]:camera};
  const result=await dispatchCrewTask({...x.input,contributions:{cinematographer:camera},retainedContributions,retainedShotTasks:parts,reconcileRetainedResponses:true,call:async(p)=>{
   calls++;expect(p).toContain('TASK CONTEXT: chapter-rollup;');const packet=decodePrompt(p);expect(packet.task).toBeUndefined();expect(packet.chapterDetailReview.detailRequests).toBe(2);expect(packet.contributions[role].directions).toHaveLength(40);expect(packet.contributions[role].findings).toHaveLength(2);
   expect(packet.contributions.cinematographer.objectionResponses).toEqual([]);expect(packet.contributions.cinematographer.objectionResponseIndex).toEqual([{objectionId:cameraIssue,outcome:'resolved'}]);expect(p).not.toContain(explanation);
   expect(JSON.stringify(retrieveCrewEvidence(x.brief,x.record,[packet.contributions.cinematographer.objectionResponseSource.access],retainedContributions))).toContain(explanation);expect(packet.historyIndex.every((h:any)=>['proposal','revision'].includes(h.kind))).toBe(true);
   const recipes=role==='production_director'?{decision:'hold',decisionConfidence:90,decisionLimitations:'Written plan only',acceptedContributionIds:[],acceptanceChecks:{status:'unverified',evidence:'No chapter approval'}}:role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:['sound_designer','composer'].includes(role)?{audioCues:[],generationRequests:[]}:{};
   return{...recipes,summary:'Explicit whole-chapter owner review',directions:[],findings:[],objectionResponses:[{objectionId:issue,outcome:'resolved',rationale:'Whole source and current proposal inspected',evidence:'Original issue and all response scopes supplied'}]};
  }});
  expect(calls).toBe(1);expect(result.directions).toHaveLength(40);expect(result.findings).toHaveLength(2);expect(result.objectionResponses![0]!.outcome).toBe('resolved');expect(JSON.stringify(x.record)).toBe(before);
 });
 it('aliases only exact foreign finding duplicates while retaining live blockers, resolved status and unmatched evidence',async()=>{
  const x=setup('script_supervisor'),f={shotId:'s0',severity:'blocking' as const,evidence:'EXACT_REGISTERED_FINDING',requestedChange:'Reconcile source geometry',confidence:90,limitations:'Planning only'};
  const camera:CrewContribution={summary:'Current camera proposal',directions:[],findings:[f]};camera.exchange=saveContribution(x.record,x.brief,'cinematographer',1,camera,'planning');const issue=x.record.objections.find(o=>o.owner==='cinematographer')!;
  const unmatched={...f,evidence:'UNMATCHED_CURRENT_FINDING'};camera.findings.push(unmatched);
  const parts=[{summary:'Complete original Script details',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Source intent',scriptureBasis:'v1'})),findings:[]}];const before=JSON.stringify(x.record);
  await dispatchCrewTask({...x.input,contributions:{cinematographer:camera},retainedShotTasks:parts,reconcileRetainedResponses:true,call:async(p)=>{
   const packet=decodePrompt(p);expect(packet.contributions.cinematographer.findings).toEqual([unmatched]);expect(packet.contributions.cinematographer.findingIssueIds).toEqual([issue.id]);expect(packet.productionRecord.objections).toContainEqual(issue);expect(issue.status).toBe('open');return{summary:'No approval claimed',directions:[],findings:[]};
  }});expect(JSON.stringify(x.record)).toBe(before);
  saveContribution(x.record,x.brief,'cinematographer',2,{summary:'Owner explicitly reconciled own issue',directions:[],findings:[],objectionResponses:[{objectionId:issue.id,outcome:'resolved',rationale:'Written geometry corrected',evidence:'Source and governing references'}]},'planning');
  const after=JSON.stringify(x.record);
  await dispatchCrewTask({...x.input,contributions:{cinematographer:camera},retainedShotTasks:parts,reconcileRetainedResponses:true,call:async(p)=>{const packet=decodePrompt(p);expect(packet.contributions.cinematographer.findingIssueIds).toContain(issue.id);expect([...packet.productionRecord.objections,...packet.chapterIssueIndex].find((o:any)=>o.id===issue.id).status).toBe('resolved');expect(packet.contributions.cinematographer.findings).toEqual([unmatched]);expect(JSON.stringify(retrieveCrewEvidence(x.brief,x.record,[`contribution:${issue.id}`]))).toContain(f.evidence);return{summary:'Still no chapter approval',directions:[],findings:[]};}});expect(JSON.stringify(x.record)).toBe(after);
 });
 it('holds retained Script details that contain a global verdict before making another call',async()=>{
  const x=setup('script_supervisor'),call=vi.fn();const part={summary:'Not a pure detail',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Source action',scriptureBasis:'v1'})),findings:[],decision:'approve'};
  await expect(dispatchCrewTask({...x.input,retainedShotTasks:[part as any],reconcileRetainedResponses:true,call})).rejects.toThrow();expect(call).not.toHaveBeenCalled();
 });
 function conflictSetup(){
  const x=setup('staging_designer');
  saveContribution(x.record,x.brief,'staging_designer',0,{summary:'Earlier eyeline concern',directions:[],findings:[{shotId:'s0',severity:'blocking',evidence:'Written eyelines conflict',requestedChange:'Reconcile the planning axis; verify actual footage later',confidence:90,limitations:'Planning'}]},'planning');
  return{...x,issue:x.record.objections[0]!.id};
 }
 it.each(['carried','resolved'] as const)('requests one explicit owner outcome (%s), preserving all task findings and actual source scope',async outcome=>{
  const x=conflictSetup(),original=JSON.stringify(x.record);let scoped=0,rollups=0;
  const result=await dispatchCrewTask({...x.input,call:async(p,schema)=>{
   const packet=decodePrompt(p);
   if(p.includes('TASK CONTEXT: chapter-rollup;')){
    const strict:any=codexOutputSchema(schema),responseItem=strict.properties.objectionResponses.anyOf[1].items;
    expect(responseItem.additionalProperties).toBe(false);expect(responseItem.required.sort()).toEqual(Object.keys(responseItem.properties).sort());expect(responseItem.properties.objectionId.enum).toEqual([x.issue]);
    rollups++;expect(packet.shotTaskResponseReconciliation.candidates.flatMap((c:any)=>c.responses.map((r:any)=>r.outcome))).toEqual(['carried','resolved']);
    expect(packet.contributions.staging_designer.directions).toHaveLength(40);
    return{summary:'Owner explicitly reconciled the issue scope',directions:[],findings:[],objectionResponses:[{objectionId:x.issue,outcome,rationale:'Explicit owner scope decision',evidence:'Written plan reviewed; actual pixels remain unverified'}]};
   }
   const reply=answer(p);scoped++;reply.findings=[{shotId:reply.directions[0]!.shotId,severity:'blocking',evidence:`Unverified actual target ${scoped}`,requestedChange:'Keep actual target QC pending',confidence:90,limitations:'Planning only'}];
   reply.objectionResponses=[{objectionId:x.issue,outcome:scoped===1?'carried':'resolved',rationale:`Original part ${scoped} rationale`,evidence:`Original part ${scoped} evidence`}];return reply;
  }});
  expect(scoped).toBe(2);expect(rollups).toBe(1);expect(result.directions).toHaveLength(40);expect(new Set(result.directions.map(d=>d.shotId)).size).toBe(40);expect(result.findings).toHaveLength(2);expect(result.objectionResponses![0]!.outcome).toBe(outcome);expect(JSON.stringify(x.record)).toBe(original);
 });
 it('retains complete conflicting parts and makes only the consolidation request, rejecting omitted issue answers',async()=>{
  const x=conflictSetup();
  const parts=[x.brief.shots.slice(0,32),x.brief.shots.slice(32)].map((shots,i):CrewContribution=>({summary:'Original task',directions:shots.map(s=>({shotId:s.id,instruction:'Preserve source',scriptureBasis:'Source'})),findings:[],objectionResponses:[{objectionId:x.issue,outcome:i===0?'carried':'resolved',rationale:'Original scope',evidence:'Original evidence'}]}));
  const call=vi.fn(async(p:string)=>{expect(p).toContain('TASK CONTEXT: chapter-rollup;');return{summary:'Missing answer is not acceptance',directions:[],findings:[],objectionResponses:[]};});
  await expect(dispatchCrewTask({...x.input,retainedShotTasks:parts,reconcileRetainedResponses:true,call})).rejects.toThrow('explicitly answer');expect(call).toHaveBeenCalledTimes(1);expect(x.record.objections[0]!.status).toBe('open');
 });
 it('keeps archived prior-role exchanges out of consolidation while retaining exact retrieval and current findings',async()=>{
  const x=conflictSetup(),camera:CrewContribution={summary:'Current camera proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact camera intent',scriptureBasis:'Source'})),findings:[]};
  camera.exchange=saveContribution(x.record,x.brief,'cinematographer',1,camera,'planning');
  const original=JSON.stringify(camera),id=camera.exchange[0]!.id;
  const parts=[x.brief.shots.slice(0,32),x.brief.shots.slice(32)].map((shots,i):CrewContribution=>({summary:'Original task',directions:shots.map(s=>({shotId:s.id,instruction:'Preserve source',scriptureBasis:'Source'})),findings:[],objectionResponses:[{objectionId:x.issue,outcome:i===0?'carried':'resolved',rationale:'Original scope',evidence:'Original evidence'}]}));
  const call=vi.fn(async(p:string)=>{
   const packet=decodePrompt(p);expect(packet.contributions.cinematographer.exchange).toBeUndefined();expect(packet.contributions.cinematographer.summary).toBe(camera.summary);
   expect(packet.directionSources.find((s:any)=>s.owner==='cinematographer').contributionId).toBe(id);
   expect(packet.productionRecord.objections.find((o:any)=>o.id===x.issue).status).toBe('open');
   return{summary:'Owner retains issue',directions:[],findings:[],objectionResponses:[{objectionId:x.issue,outcome:'carried',rationale:'Actual evidence still needed',evidence:'Full issue reviewed'}]};
  });
  const result=await dispatchCrewTask({...x.input,contributions:{cinematographer:camera},retainedShotTasks:parts,reconcileRetainedResponses:true,call});
  expect(result.directions).toHaveLength(40);expect(call).toHaveBeenCalledTimes(1);expect(JSON.stringify(camera)).toBe(original);
  expect((retrieveCrewEvidence(x.brief,x.record,[`contribution:${id}`],{[id]:camera})[`contribution:${id}`] as any).value.roleOutput).toEqual(camera);
 });
 it.each(['carried','resolved'] as const)('finishes missing scope before an explicit whole-owner decision (%s)',async outcome=>{
  const x=conflictSetup(),part:CrewContribution={summary:'Interrupted pure part',directions:[{shotId:'s0',instruction:'Source',scriptureBasis:'Source'}],findings:[],objectionResponses:[{objectionId:x.issue,outcome:'resolved',rationale:'Original proposed disposition',evidence:'Original inspected scope'}]};
  const original=JSON.stringify(part),seen:string[]=[];let rollups=0;
  const result=await dispatchCrewTask({...x.input,retainedShotTasks:[part],reconcileRetainedResponses:true,call:async p=>{
   const packet=decodePrompt(p);expect(x.record.objections[0]!.status).toBe('open');
   if(p.includes('TASK CONTEXT: chapter-rollup;')){
    rollups++;expect(new Set(seen).size).toBe(39);expect(packet.contributions.staging_designer.directions).toHaveLength(40);
    expect(packet.shotTaskResponseReconciliation.candidates[0].responses[0].outcome).toBe('resolved');
    return{summary:'Whole owner decision',directions:[],findings:[],objectionResponses:[{objectionId:x.issue,outcome,rationale:'Whole-role disposition',evidence:'All scope now inspected'}]};
   }
   const ids:string[]=packet.task.shotIds;
   if(ids.includes('s1'))expect(packet.contributions.staging_designer.directions.some((d:any)=>d.shotId==='s0')).toBe(true);
   expect(ids).not.toContain('s0');seen.push(...ids);
   return{summary:'Remaining scope',directions:Object.fromEntries(ids.map(id=>[id,{instruction:'Remaining source direction',scriptureBasis:'Source'}])),findings:[],objectionResponses:[]};
  }});
  expect(rollups).toBe(1);expect(result.directions).toHaveLength(40);expect(result.objectionResponses![0]!.outcome).toBe(outcome);
  expect(JSON.stringify(part)).toBe(original);expect(x.record.objections[0]!.status).toBe('open');
 });
 it('holds failed remaining coverage before consolidation or issue closure',async()=>{
  const x=conflictSetup(),part:CrewContribution={summary:'Pure part',directions:[{shotId:'s0',instruction:'Source',scriptureBasis:'Source'}],findings:[],objectionResponses:[{objectionId:x.issue,outcome:'resolved',rationale:'Provisional',evidence:'Partial scope'}]};
  const call=vi.fn(async()=>({summary:'Missing directions',directions:{},findings:[]}));
  await expect(dispatchCrewTask({...x.input,retainedShotTasks:[part],reconcileRetainedResponses:true,call})).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(1);expect(x.record.objections[0]!.status).toBe('open');
 });
});
describe('verified partial camera dispatch',()=>{
 it('submits only missing shots, supplies neighboring retained work and retains every concern',async()=>{
  const x=setup('cinematographer'),retained:CrewContribution={summary:'Original completed part',directions:x.brief.shots.slice(0,24).map(s=>({shotId:s.id,instruction:'Original camera instruction',scriptureBasis:'Exact source'})),findings:[{shotId:'s23',severity:'blocking',evidence:'Pending target evidence',requestedChange:'Review actual target',confidence:90,limitations:'Planning'}]};
  const original=JSON.stringify(retained),call=vi.fn(async(p:string)=>{
   const packet=decodePrompt(p);expect(packet.retainedTaskProgress.shotIds).toHaveLength(24);
   expect(packet.contributions.cinematographer.directions.some((d:any)=>d.shotId==='s23')).toBe(true);
   return answer(p);
  });
  const result=await dispatchCrewTask({...x.input,maxShotTaskSize:16,retainedShotTasks:[retained],call});
  expect(call).toHaveBeenCalledTimes(1);expect(decodePrompt(call.mock.calls[0]![0]).task.shotIds).toEqual(x.brief.shots.slice(24).map(s=>s.id));
  expect(result.directions).toHaveLength(40);expect(new Set(result.directions.map(d=>d.shotId)).size).toBe(40);expect(result.findings).toEqual(retained.findings);expect(JSON.stringify(retained)).toBe(original);
 });
 it.each(['overlap','foreign','resolution','mutation','role','size'])('rejects unsafe partial retention before submission (%s)',async(kind)=>{
  const x=setup('cinematographer'),call=vi.fn(),part:CrewContribution={summary:'Retained task',directions:[{shotId:'s0',instruction:'Camera plan',scriptureBasis:'Source'}],findings:[]};
  const retained=[part];let maxShotTaskSize=16;
  if(kind==='overlap')retained.push(structuredClone(part));if(kind==='foreign')part.directions[0]!.shotId='other';
  if(kind==='resolution')part.objectionResponses=[{objectionId:'pending',outcome:'resolved',rationale:'Unsafe closure',evidence:'No global review'}];
  if(kind==='mutation')part.edits=[{shotId:'s0',sourceStartMs:0,durationMs:1}];if(kind==='role')x.input.role='script_supervisor';if(kind==='size')maxShotTaskSize=33;
  await expect(dispatchCrewTask({...x.input,maxShotTaskSize,retainedShotTasks:retained,call})).rejects.toThrow();expect(call).not.toHaveBeenCalled();
 });
});
const answer=(p:string):CrewContribution=>{const data=decodePrompt(p);return{summary:'Task checked',directions:(data.task?.shotIds??data.brief.shots.map((s:any)=>s.id)).map((id:string)=>({shotId:id,instruction:'Preserve observed lighting',scriptureBasis:'Supplied source'})),findings:[]};};
describe('bounded crew task and evidence protocol',()=>{
 it('retrieves exact selected role fields with source hashes without replaying full directions',()=>{
  const x=setup(),output:CrewContribution={summary:'Exact retained global assessment',directions:[{shotId:'s0',instruction:'UNNEEDED_BODY_'.repeat(5000),scriptureBasis:'v1'}],findings:[]};
  const [saved]=saveContribution(x.record,x.brief,'creative_director',1,output,'planning'),retained={[saved!.id]:output},base=`contribution:${saved!.id}`,ref=base+'#/roleOutput/summary',before=JSON.stringify({output,record:x.record});
  const full:any=retrieveCrewEvidence(x.brief,x.record,[base],retained)[base],selected:any=retrieveCrewEvidence(x.brief,x.record,[ref],retained)[ref];
  expect(selected).toEqual({sha256:recordHash(output.summary),value:output.summary,selection:{sourceRef:base,sourceSha256:full.sha256,pointer:'/roleOutput/summary',partial:true,present:true,notAnApproval:true}});
  expect(JSON.stringify(selected)).not.toContain('UNNEEDED_BODY_');expect(JSON.stringify(full)).toContain('UNNEEDED_BODY_');
  expect(JSON.stringify({output,record:x.record})).toBe(before);
  const prior='previous_role:creative_director#/roleOutput/summary';expect((retrieveCrewEvidence(x.brief,x.record,[prior],retained)[prior] as any).value).toBe(output.summary);
 });
 it('reports a missing selected field explicitly without inventing a prior review',()=>{
  const x=setup(),output:CrewContribution={summary:'A',directions:[],findings:[]};const [saved]=saveContribution(x.record,x.brief,'creative_director',1,output,'planning');
  const ref=`contribution:${saved!.id}#/roleOutput/treatmentReview`,value:any=retrieveCrewEvidence(x.brief,x.record,[ref],{[saved!.id]:output})[ref];
  expect(value.value).toMatchObject({status:'field_not_recorded',notAnApproval:true});expect(value.selection).toMatchObject({present:false,partial:true});
  for(const suffix of ['#bad','#/roleOutput/~2bad','#/roleOutput/summary#extra'])expect(()=>retrieveCrewEvidence(x.brief,x.record,[`contribution:${saved!.id}`+suffix],{[saved!.id]:output})).toThrow('field selector');
 });
 it('does not let a selected summary satisfy the full-contribution withdrawal gate',async()=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);const output:CrewContribution={summary:'Earlier proposal',directions:[],findings:[]};const [saved]=saveContribution(x.record,x.brief,'lighting_designer',1,output,'planning');
  x.record.revision='fresh-run';let calls=0;const ref=`contribution:${saved!.id}#/roleOutput/summary`;
  await expect(dispatchCrewTask({...x.input,retainedContributions:{[saved!.id]:output},call:async p=>++calls===1?{contextRequests:[ref]}:{...answer(p),withdrawals:[{contributionId:saved!.id,rationale:'Only read summary',evidence:'Partial evidence'}]}})).rejects.toThrow('exact contribution retrieval');
  expect(calls).toBe(2);
 });
 it('bounds old exchange metadata to the current revision and latest owner proposal without losing exact history or retrieval guards',async()=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);
  for(let i=1;i<=80;i++)saveContribution(x.record,x.brief,'lighting_designer',i,{summary:`Exact retained task explanation ${i}`,directions:[],findings:[]},'planning');
  const original=JSON.stringify(x.record),first=x.record.history[0]!.id;
  x.record.revision='fresh-run';
  const p=scopedCrewPacket(x.brief,{},x.record,['s0'],'lighting_designer');
  expect(p.exchangeIndex).toHaveLength(1);expect(p.archivedExchangeIndex!.total).toBe(80);
  expect(p.audit.archivedAncestryLinks).toBeUndefined();expect(p.audit.archivedAncestryIndex!.sha256).toBe(recordHash(chapterCrewPacket(x.brief,{},x.record).audit?.archivedAncestryLinks??[]));
  expect(p.productionRecord!.history).toHaveLength(0);
  expect((retrieveCrewEvidence(x.brief,x.record,[`contribution:${first}`])[`contribution:${first}`] as any).value.rationale).toBe('Exact retained task explanation 1');
  expect((retrieveCrewEvidence(x.brief,x.record,['history_page:0'])['history_page:0'] as any).value.entries[0].id).toBe(`contribution:${first}`);
  await expect(dispatchCrewTask({...x.input,call:async prompt=>({...answer(prompt),withdrawals:[{contributionId:first,rationale:'Cannot rely on unseen prose',evidence:'Synthetic only'}]})})).rejects.toThrow('exact contribution retrieval');
  expect(JSON.stringify({...x.record,revision:'run'})).toBe(original);
 });
 it('rebinds exact retained findings without reopening resolved issues while fresh observations remain separate',()=>{
  const b=fixture(),r=newProductionRecord(b,'old-run','hash'),role='costume_designer' as const;
  const report:CrewContribution={summary:'Original source-bound report',directions:[],findings:[{shotId:'s0',severity:'blocking',evidence:'Exact conflict',requestedChange:'Inspect approved reference',confidence:90,limitations:'Planning only'}]};
  const old=saveContribution(r,b,role,1,report,'planning')[1]!.id;
  saveContribution(r,b,role,2,{summary:'Owner resolved original issue',directions:[],findings:[],objectionResponses:[{objectionId:old,outcome:'resolved',rationale:'Exact owner evidence',evidence:'Synthetic fixture only'}]},'planning');
  const before=JSON.stringify(r.objections);r.revision='new-run';
  const retained=saveContribution(r,b,role,1,{...report,objectionResponses:[{objectionId:old,outcome:'resolved',rationale:'Exact owner evidence',evidence:'Synthetic fixture only'}]},'planning',true);
  expect(retained).toHaveLength(1);expect(retained[0]!.id).toBe('new-run:costume_designer:1');expect(retained[0]!.relatedContributions).toContain(old);expect(retained[0]!.relatedContributions).toContain('old-run:costume_designer:2:objection:0');
  expect(JSON.stringify(r.objections)).toBe(before);expect(r.objections[0]!.status).toBe('resolved');
  saveContribution(r,b,role,2,report,'planning');
  expect(r.objections).toHaveLength(2);expect(r.objections[1]!.status).toBe('open');expect(r.objections[0]!.status).toBe('resolved');
 });
 it('indexes foreign whole-role summaries and response prose while keeping outcomes and exact current-role retrieval',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');
  const original:CrewContribution={summary:'FULL_CAMERA_SUMMARY '.repeat(150),directions:[{shotId:'s0',instruction:'KEEP_CURRENT_CAMERA_DIRECTION',scriptureBasis:'v1'}],findings:[{shotId:null,severity:'advisory',evidence:'KEEP_GLOBAL_CAMERA_ISSUE',requestedChange:'Review actual pixels',confidence:90,limitations:'Planning'}]};
  original.exchange=saveContribution(r,b,'cinematographer',1,original,'planning');
  const reply:CrewContribution={summary:'FULL_UPDATED_CAMERA_SUMMARY '.repeat(150),directions:original.directions,findings:[],objectionResponses:[{objectionId:original.exchange[1]!.id,outcome:'carried',rationale:'EXACT_CARRIED_REASON '.repeat(100),evidence:'EXACT_CARRIED_EVIDENCE'}]};
  reply.exchange=saveContribution(r,b,'cinematographer',2,reply,'planning');
  const before=JSON.stringify({r,reply}),p=scopedCrewPacket(b,{cinematographer:reply},r,['s0'],'choreographer');
  expect(JSON.stringify(p)).not.toContain('FULL_UPDATED_CAMERA_SUMMARY');expect(JSON.stringify(p)).not.toContain('EXACT_CARRIED_REASON');
  expect(JSON.stringify(p)).toContain('KEEP_CURRENT_CAMERA_DIRECTION');expect(p.offTaskIssueIndex).toContainEqual(expect.objectContaining({owner:'cinematographer',severity:'advisory',status:'open',advisoryRequest:'Review actual pixels'}));
  expect(p.roleProseIndex[0]!.objectionResponses[0]).toMatchObject({objectionId:original.exchange[1]!.id,outcome:'carried'});
  const ref=p.roleProseIndex[0]!.ref,retained={[reply.exchange[0]!.id]:reply};
  expect((retrieveCrewEvidence(b,r,[ref],retained)[ref] as any).value.roleOutput).toEqual(reply);
  expect(JSON.stringify(scopedCrewPacket(b,{cinematographer:reply},r,['s0'],'cinematographer'))).toContain('FULL_UPDATED_CAMERA_SUMMARY');
  expect(JSON.stringify({r,reply})).toBe(before);
 });
 it('indexes no-change exchange prose while preserving issue bodies, current directions, exact retrieval and pending fact proposals',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');
  const out:CrewContribution={summary:'HISTORICAL_SUMMARY '.repeat(100),directions:[{shotId:'s0',instruction:'CURRENT_TASK_DIRECTION',scriptureBasis:'v1'}],findings:[{shotId:null,severity:'blocking',evidence:'CONTROLLING_OPEN_HOLD',requestedChange:'Preserve source',confidence:99,limitations:'Not approval'}]};
  out.exchange=saveContribution(r,b,'creative_director',1,out,'planning');
  const fact=r.snapshots[0]!.shots[0]!.facts.framing!;
  const pending=saveContribution(r,b,'cinematographer',1,{summary:'Pending actual framing proposal',directions:[],findings:[],filmChanges:[{target:{layer:'shots',entityId:'s0',fact:'framing'},before:structuredClone(fact),after:{...structuredClone(fact),value:'new close framing',status:'proposed',approvalRecord:null,reason:'Task-specific proposal'}}]},'planning');
  const before=JSON.stringify({b,r,out}),p=scopedCrewPacket(b,{creative_director:out},r,['s0'],'lighting_designer');
  expect(p.exchangeIndex.map(h=>h.id)).toContain(out.exchange[0]!.id);
  expect(p.productionRecord!.history.map(h=>h.id)).toContain(pending[0]!.id);
  expect(p.productionRecord!.history).not.toContainEqual(expect.objectContaining({id:out.exchange[0]!.id}));
  expect(JSON.stringify(p.productionRecord)).not.toContain('HISTORICAL_SUMMARY');
  expect(JSON.stringify(p)).toContain('CURRENT_TASK_DIRECTION');expect(JSON.stringify(p)).toContain('CONTROLLING_OPEN_HOLD');
  const entry=p.exchangeIndex.find(h=>h.id===out.exchange[0]!.id)!;
  const ref=`contribution:${entry.id}`,retrieved:any=retrieveCrewEvidence(b,r,[ref]);
  expect(retrieved[ref].value.rationale).toContain('HISTORICAL_SUMMARY');
  expect(retrieved[ref].value.scope.shotIds).toHaveLength(40);
  expect(JSON.stringify({b,r,out})).toBe(before);
  expect(()=>acceptProductionRecord(r,{summary:'No waiver',directions:[],findings:[],acceptedContributionIds:[]})).toThrow('Unresolved blocking');
 });
 it('indexes resolved global history while preserving open global holds and exact resolution evidence',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');
  const saved=saveContribution(r,b,'creative_director',1,{summary:'Earlier review',directions:[],findings:[
   {shotId:null,severity:'blocking',evidence:'CLOSED_GLOBAL_BODY',requestedChange:'Earlier correction',confidence:95,limitations:'Planning'},
   {shotId:null,severity:'blocking',evidence:'OPEN_GLOBAL_BODY',requestedChange:'Still required',confidence:95,limitations:'Planning'}]},'planning');
  saveContribution(r,b,'creative_director',2,{summary:'Correction verified',directions:[],findings:[],objectionResponses:[{objectionId:saved[1]!.id,outcome:'resolved',rationale:'CLOSED_RESOLUTION_BODY',evidence:'Exact prior evidence'}]},'planning');
  const before=JSON.stringify(r),p=scopedCrewPacket(b,{},r,['s0'],'lighting_designer');
  expect(p.offTaskIssueIndex).toEqual([expect.objectContaining({id:saved[1]!.id,shotId:null,status:'resolved'})]);
  expect(JSON.stringify(p)).not.toContain('CLOSED_GLOBAL_BODY');expect(JSON.stringify(p)).not.toContain('CLOSED_RESOLUTION_BODY');
  expect(JSON.stringify(p)).toContain('OPEN_GLOBAL_BODY');expect(p.offTaskOpenBlockingCount).toBe(0);
  expect(p.offTaskIssueIndex[0]).not.toHaveProperty('evidenceRef');const ref=`contribution:${p.offTaskIssueIndex[0]!.id}`;
  expect((retrieveCrewEvidence(b,r,[ref])[ref] as any).value.findingRecord).toMatchObject({evidence:'CLOSED_GLOBAL_BODY',status:'resolved'});
  expect(scopedCrewPacket(b,{},r,['s0'],'creative_director').offTaskIssueIndex).toEqual([]);
  expect(JSON.stringify(chapterCrewPacket(b,{},r))).toContain('CLOSED_GLOBAL_BODY');expect(JSON.stringify(r)).toBe(before);
 });
 it('keeps every source verse in a printed en-dash task range',()=>{
  const b=fixture();b.shots[0]!.verseRef='Mark 6:1\u20132';
  expect(scopedCrewPacket(b,{},undefined,['s0'],'lighting_designer').brief.source.text).toEqual(b.source.text);
 });
 it('requires exact retrieval before withdrawing an indexed proposal',async()=>{
  const x=setup(),saved=saveContribution(x.record,x.brief,'lighting_designer',1,{summary:'Earlier own proposal',directions:[],findings:[]},'planning');
  await expect(dispatchCrewTask({...x.input,call:async p=>({...answer(p),withdrawals:[{contributionId:saved[0]!.id,rationale:'Withdraw without reading',evidence:'Unseen'}]})})).rejects.toThrow('exact contribution retrieval');
  let n=0;
  const result=await dispatchCrewTask({...x.input,call:async p=>{
   n++;if(!decodePrompt(p).retrievedEvidence[`contribution:${saved[0]!.id}`])return{contextRequests:[`contribution:${saved[0]!.id}`]};
   return{...answer(p),withdrawals:[{contributionId:saved[0]!.id,rationale:'Withdraw after exact evidence',evidence:'Earlier own proposal'}]};
  }});
  expect(result.withdrawals).toHaveLength(1);
 });
 it('records precise affected-shot finding scopes while global findings retain chapter scope',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');
  const findings=[{shotId:'s30',severity:'blocking' as const,evidence:'Specific later scene',requestedChange:'Correct later pose',confidence:90,limitations:'Planning only'},
   {shotId:null,severity:'blocking' as const,evidence:'Global source hold',requestedChange:'Preserve every source word',confidence:99,limitations:'Not native attestation'}];
  const saved=saveContribution(r,b,'creative_director',1,{summary:'Source-grounded findings',directions:[],findings},'planning');
  expect(saved[1]!.scope).toMatchObject({shotIds:['s30'],sceneIds:['b'],verseRefs:['v2']});
  expect(saved[2]!.scope.shotIds).toHaveLength(40);
 });
 it('indexes off-task findings without losing global holds, owned findings, exact retrieval or original state',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash'),marker='OFF_TASK_EXPLANATION '.repeat(100);
  const output:CrewContribution={summary:'Earlier review',directions:[],findings:[{shotId:'s30',severity:'blocking',evidence:marker,requestedChange:marker,confidence:91,limitations:'Planning only'},
   {shotId:null,severity:'blocking',evidence:'GLOBAL_HOLD_KEEP',requestedChange:'Retain source',confidence:99,limitations:'Not native attestation'}]};
  output.exchange=saveContribution(r,b,'creative_director',1,output,'planning');
  // Emulate the old broad scope without rewriting it in the projection.
  output.exchange[1]!.scope=structuredClone(output.exchange[0]!.scope);
  saveContribution(r,b,'lighting_designer',1,{summary:'Own unresolved finding',directions:[],findings:[{shotId:'s31',severity:'blocking',evidence:'OWN_FINDING_KEEP',requestedChange:'Check light',confidence:90,limitations:'Planning only'}]},'planning');
  const before=JSON.stringify({b,r,output}),p=scopedCrewPacket(b,{creative_director:output},r,['s0'],'lighting_designer');
  expect(p.offTaskIssueIndex).toEqual([expect.objectContaining({id:output.exchange[1]!.id,owner:'creative_director',shotId:'s30',severity:'blocking',status:'open',confidence:91})]);
  expect(p.offTaskOpenBlockingCount).toBe(1);
  expect(JSON.stringify(p)).not.toContain(marker);
  expect(JSON.stringify(p)).toContain('GLOBAL_HOLD_KEEP');expect(JSON.stringify(p)).toContain('OWN_FINDING_KEEP');
  expect(p.offTaskIssueIndex[0]).not.toHaveProperty('evidenceRef');const ref=`contribution:${p.offTaskIssueIndex[0]!.id}`;
  expect((retrieveCrewEvidence(b,r,[ref])[ref] as any).value.rationale).toBe(marker);
  expect((retrieveCrewEvidence(b,r,[ref])[ref] as any).value.findingRecord).toMatchObject({shotId:'s30',evidence:marker,owner:'creative_director',status:'open'});
  expect(JSON.stringify(chapterCrewPacket(b,{creative_director:output},r))).toContain(marker);
  expect(()=>acceptProductionRecord(r,{summary:'No waiver',directions:[],findings:[],acceptedContributionIds:[]})).toThrow('Unresolved blocking');
  expect(JSON.stringify({b,r,output})).toBe(before);
  saveContribution(r,b,'creative_director',2,{summary:'Resolve after supplied evidence',directions:[],findings:[],objectionResponses:[{objectionId:output.exchange[1]!.id,outcome:'resolved',rationale:'Exact correction reviewed',evidence:'Saved evidence'}]},'planning');
  const later=scopedCrewPacket(b,{},r,['s0'],'lighting_designer');
  expect(later.offTaskIssueIndex[0]).toMatchObject({status:'resolved'});expect(later.offTaskOpenBlockingCount).toBe(0);
  expect((retrieveCrewEvidence(b,r,[later.offTaskIssueIndex[0]!.resolutionRef!])[later.offTaskIssueIndex[0]!.resolutionRef!] as any).value.resolution.outcome).toBe('accepted');
 });
 it('does not reintroduce duplicate whole-chapter exchange envelopes into scoped role replies',()=>{
  const b=fixture(),record=newProductionRecord(b,'run','hash');
  const output:CrewContribution={summary:'Keep the established state',directions:[{shotId:'s0',instruction:'Retain pose',scriptureBasis:'v1'}],findings:[{shotId:null,severity:'advisory',evidence:'Global concern',requestedChange:'Review continuity',confidence:90,limitations:'Planning only'}]};
  output.exchange=saveContribution(record,b,'creative_director',1,output,'planning');
  const before=JSON.stringify({output,record}),packet=scopedCrewPacket(b,{creative_director:output},record,['s0']);
  expect(packet.contributions.creative_director!.exchange).toBeUndefined();
  expect(packet.contributions.creative_director!.directions).toEqual(output.directions);
  expect(packet.productionRecord!.history).toEqual([]);
  expect(packet.historyIndex.map(h=>h.id)).toEqual(output.exchange.filter(h=>h.kind==='proposal'||h.kind==='revision').map(h=>h.id));
  expect(packet.productionRecord!.objections).toContainEqual(expect.objectContaining({evidence:'Global concern'}));
  const ref=`contribution:${output.exchange[0]!.id}`;
  expect((retrieveCrewEvidence(b,record,[ref],{[output.exchange[0]!.id]:output})[ref] as any).value.roleOutput).toEqual(output);
  expect(JSON.stringify({output,record})).toBe(before);
 });
 it('retrieves the exact retained role reply on demand without replaying other role history',async()=>{
  const x=setup('creative_director'),old:CrewContribution={summary:'Earlier full treatment',directions:[{shotId:'s0',instruction:'EXACT_RETAINED_DETAIL',scriptureBasis:'v1'}],findings:[]};
  const [saved]=saveContribution(x.record,x.brief,'creative_director',1,old,'planning');
  const retained={[saved!.id]:old,unrelated:{summary:'DO_NOT_REPLAY',directions:[],findings:[]}};
  let calls=0;
  await dispatchCrewTask({...x.input,retainedContributions:retained,call:async p=>{
   expect(p).not.toContain('DO_NOT_REPLAY');
   if(++calls===1){expect(p).not.toContain('EXACT_RETAINED_DETAIL');return{contextRequests:[`contribution:${saved!.id}`]};}
   const e=decodePrompt(p).retrievedEvidence[`contribution:${saved!.id}`];
   expect(e.value.roleOutput).toEqual(old);expect(e.value.notAnApproval).toBe(true);
   return answer(p);
  }});
  expect(calls).toBe(2);
  const prior:any=retrieveCrewEvidence(x.brief,x.record,['previous_role:creative_director'],retained)['previous_role:creative_director'];
  expect(prior.value.roleOutput).toEqual(old);
  expect(()=>retrieveCrewEvidence(x.brief,x.record,['contribution:unrelated'],retained)).toThrow('Missing or unsupported');
 });
 it('keeps applicable/unknown instructions and adjacent source/reference verses with exact omitted-verse retrieval',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash'),before=JSON.stringify({b,r});const p=scopedCrewPacket(b,{},r,['s0']);
  expect(p.task.continuityShotIds).toEqual(['s1']);expect(p.brief.source.text).toEqual([b.source.text[0]]);expect(p.brief.source.reference).toEqual([b.source.reference[0]]);
  expect(p.audit.omittedReferenceVerses).toEqual([2]);
  expect((retrieveCrewEvidence(b,r,['source_verse:2'])['source_verse:2'] as any).value).toEqual({source:b.source.text[1],reference:b.source.reference[1],notAnApproval:true});
  expect(()=>retrieveCrewEvidence(b,r,['source_verse:99'])).toThrow('Missing or unsupported');
  expect(p.brief.producerNotes.map(n=>n.id)).toEqual(['global','local','unknown']);expect(JSON.stringify({b,r})).toBe(before);
 });
 it('preserves accepted semantic changes and exact fact authority behind immutable snapshot hashes',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash'),fact=r.snapshots[0]!.shots[0]!.facts.framing!;fact.value='producer-approved close-up';fact.status='approved';
  const p=chapterCrewPacket(b,{},r,'script_supervisor');expect(p.productionRecord!.snapshots).toEqual([]);expect(p.acceptedFactDifferences).toContainEqual(expect.objectContaining({currentValue:'producer-approved close-up',status:'approved',owner:'cinematographer'}));
  const ref='fact:'+JSON.stringify(['a','shots','s0','framing']);expect(retrieveCrewEvidence(b,r,[ref])[ref]).toEqual({sha256:recordHash(fact),value:fact});
 });
 it('indexes historical foreign chapter advisories and resolved issues while keeping owned, blocking and current evidence in full',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');
  const finding=(shotId:string|null,severity:'advisory'|'blocking',evidence:string)=>({shotId,severity,evidence,requestedChange:`Exact action for ${evidence}`,confidence:90,limitations:'Original scope'});
  saveContribution(r,b,'lighting_designer',0,{summary:'Earlier lighting',directions:[],findings:[finding('s0','advisory','HISTORICAL_LOCAL_BODY'),finding(null,'advisory','HISTORICAL_GLOBAL_BODY'),finding('s1','blocking','BLOCKING_BODY')]},'planning');
  saveContribution(r,b,'script_supervisor',0,{summary:'Earlier own issue',directions:[],findings:[finding('s2','advisory','OWNED_BODY')]},'planning');
  saveContribution(r,b,'staging_designer',0,{summary:'Earlier stage issue',directions:[],findings:[finding('s4','advisory','RESOLVED_BODY')]},'planning');
  const resolved=r.objections.find(o=>o.evidence==='RESOLVED_BODY')!;saveContribution(r,b,'staging_designer',1,{summary:'Stage explicitly resolved own issue',directions:[],findings:[],objectionResponses:[{objectionId:resolved.id,outcome:'resolved',rationale:'Written issue reconciled',evidence:'Current source and plan'}]},'planning');
  const camera:CrewContribution={summary:'Current camera',directions:[],findings:[finding('s3','advisory','CURRENT_BODY')]};camera.exchange=saveContribution(r,b,'cinematographer',1,camera,'planning');
  const before=JSON.stringify(r),p=chapterCrewPacket(b,{cinematographer:camera},r,'script_supervisor'),visible=p.productionRecord!.objections.map(o=>o.evidence);
  expect(visible).toEqual(expect.arrayContaining(['BLOCKING_BODY','OWNED_BODY','CURRENT_BODY']));expect(visible).not.toEqual(expect.arrayContaining(['HISTORICAL_LOCAL_BODY']));expect(visible).not.toContain('RESOLVED_BODY');
  const local=r.objections.find(o=>o.evidence==='HISTORICAL_LOCAL_BODY')!,index=p.chapterIssueIndex!.find(o=>o.id===local.id)!;expect(index).toEqual({id:local.id,owner:'lighting_designer',shotId:'s0',severity:'advisory',status:'open'});
  expect(p.chapterIssueIndex!.find(o=>o.shotId===null)?.globalAdvisoryRequest).toBe('Exact action for HISTORICAL_GLOBAL_BODY');expect(p.chapterIssueIndex!.find(o=>o.id===resolved.id)?.status).toBe('resolved');
  expect(JSON.stringify(retrieveCrewEvidence(b,r,[`contribution:${index.id}`]))).toContain('HISTORICAL_LOCAL_BODY');expect(JSON.stringify(retrieveCrewEvidence(b,r,[`contribution:${resolved.id}`]))).toContain(resolved.resolutionId!);expect(JSON.stringify(r)).toBe(before);
  expect(p.audit.fullRecordSha256).toBe(recordHash(r));expect(p.audit.retainedContributionIds).toBeUndefined();expect(p.audit.retainedContributionIndex?.count).toBeGreaterThan(0);expect(p.chapterIssueArchive?.count).toBe(p.chapterIssueIndex!.length);expect(p.chapterIssueArchive?.sha256).toHaveLength(64);
 });
 it('retains unknown or substantive pending-linked chapter issues and preserves unscoped legacy packets',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');saveContribution(r,b,'lighting_designer',0,{summary:'Pending linked advisory',directions:[],findings:[{shotId:'s0',severity:'advisory',evidence:'Keep exact pending evidence',requestedChange:'Review linked proposal',confidence:90,limitations:'Original scope'}]},'planning');
  const issue=r.objections[0]!,proposal=r.history.find(h=>h.kind==='proposal')!;proposal.proposedChanges=[{futureOpaqueFact:'retain rather than discard'} as never];proposal.relatedContributions.push(issue.id);
  expect(chapterCrewPacket(b,{},r,'script_supervisor').productionRecord!.objections).toContainEqual(issue);
  proposal.proposedChanges=[];issue.owner='unknown_future_owner' as never;expect(chapterCrewPacket(b,{},r,'script_supervisor').productionRecord!.objections).toContainEqual(issue);
  issue.owner='lighting_designer';const legacy=chapterCrewPacket(b,{},r);expect(legacy.productionRecord!.objections).toContainEqual(issue);expect(legacy.chapterIssueIndex).toBeUndefined();
 });
 it('indexes old media notes but retrieves their exact unedited text when needed',()=>{
  const b=fixture();b.mediaReviewEvidence=[{id:'old-qc',shotId:'s0',createdAt:1,note:'Original failed take; does not approve current pixels'}];
  const p=chapterCrewPacket(b,{},undefined);expect(p.brief.mediaReviewEvidence![0]).not.toHaveProperty('note');expect((retrieveCrewEvidence(b,undefined,['media_review:old-qc'])['media_review:old-qc'] as any).value.note).toContain('failed take');
 });
 it('dispatches every shot exactly once in bounded design tasks and merges the role into one complete contribution',async()=>{
  const x=setup();const output=await dispatchCrewTask({...x.input,call:async p=>answer(p)});
  expect(x.requests.length).toBeGreaterThan(1);expect(output.directions).toHaveLength(40);expect(new Set(output.directions.map(d=>d.shotId)).size).toBe(40);
  for(const p of x.requests)expect(Buffer.byteLength(p)).toBeLessThan(200000);
 });
 it('constrains actual shot identifiers before inference without changing the shared schema',async()=>{
  for(const role of ['lighting_designer','script_supervisor'] as const){
   const x=setup(role),before=JSON.stringify(x.input.schema);
   await dispatchCrewTask({...x.input,call:async(p,schema)=>{
    const data=decodePrompt(p),properties:any=schema.properties;
    expect(codexInputBudget(p,schema,[],200000).suppliedTextBytes).toBeLessThanOrEqual(200000);
    const output=answer(p),first=output.directions[0]!;
    const visible=data.task?.shotIds??data.brief.shots.map((s:any)=>s.id);
    if(data.task){
     const validate=new Ajv2020({strict:false}).compile(properties.directions);
     const keyed=Object.fromEntries(output.directions.map(({shotId,...value})=>[shotId,value]));
     expect(validate(keyed)).toBe(true);
     expect(validate({...keyed,'foreign-uuid':keyed[visible[0]]})).toBe(false);
     const missing={...keyed};delete missing[visible[0]];expect(validate(missing)).toBe(false);
     expect(validate({})).toBe(true); // provisional evidence request only
     expect(properties.findings.items.properties.shotId.enum).toContain('s39');
     return {...output,directions:keyed};
    }
    const validate=new Ajv2020({strict:false}).compile(properties.directions.items);
    expect(validate(first)).toBe(true);
    expect(validate({...first,shotId:'nearly-matching-foreign-uuid'})).toBe(false);
    expect(properties.directions.items.properties.shotId.enum).toEqual(visible);
    // A chapter-wide finding may refer outside this local task, but its ID
    // must still belong to the real chapter; null remains a global finding.
    const finding=properties.findings.items.properties.shotId;
    expect(finding.enum).toContain('s39');expect(finding.nullable).toBe(true);
    return output;
   }});
   expect(JSON.stringify(x.input.schema)).toBe(before);
  }
 });
 it('normalizes keyed coverage in target order and rejects omitted IDs or embedded replacements',()=>{
  const values={s1:{instruction:'one',scriptureBasis:'source'},s0:{instruction:'zero',scriptureBasis:'source'}};
  expect((normalizeTaskDirections({directions:values},['s0','s1']).directions as any[]).map(d=>d.shotId)).toEqual(['s0','s1']);
  expect(()=>normalizeTaskDirections({directions:{}},['s0'])).toThrow('exactly');
  expect(()=>normalizeTaskDirections({directions:{s0:{...values.s0,shotId:'s1'}}},['s0'])).toThrow('inner shotId');
 });
 it('retrieves exact earlier evidence in a fresh bounded request without carrying the preceding model reply',async()=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);let calls=0;
  await dispatchCrewTask({...x.input,call:async p=>{calls++;const data=decodePrompt(p);if(calls===1)return{summary:'Need evidence; DO_NOT_RELAY_THIS_REPLY',directions:[],findings:[],contextRequests:['producer_note:global']};
   expect(p).not.toContain('DO_NOT_RELAY_THIS_REPLY');expect(data.retrievedEvidence['producer_note:global'].value.note).toBe(x.brief.producerNotes[0]!.note);return answer(p);}});
  expect(calls).toBe(2);
 });
 it('attaches only applicable canon boards while retaining unscoped visual evidence',async()=>{
  const x=setup('cinematographer');
  x.brief.canon=[{id:'c1',name:'First',region:'Papuan',versionId:'v1',notes:null,joinedAt:null},{id:'c2',name:'Later',region:'Papuan',versionId:'v2',notes:null,joinedAt:null}];
  x.brief.shots[0]!.characterIds=['c1'];x.brief.shots[39]!.characterIds=['c2'];
  const images=[{mimeType:'image/jpeg',data:'AA==',caption:'First canon',characterIds:['c1']},{mimeType:'image/jpeg',data:'AA==',caption:'Later canon',characterIds:['c2']},{mimeType:'image/jpeg',data:'AA==',caption:'Global perspective evidence'}];
  await dispatchCrewTask({...x.input,media:images,call:async(p,_s,media)=>{
   const d=decodePrompt(p),ids=d.brief.canon.map((c:any)=>c.id);
   expect(media.map(m=>m.caption)).toContain('Global perspective evidence');
   expect(media.some(m=>m.caption==='First canon')).toBe(ids.includes('c1'));
   expect(media.some(m=>m.caption==='Later canon')).toBe(ids.includes('c2'));
   return answer(p);
  }});
  expect(images).toHaveLength(3);
 });
 it('holds unknown evidence and excessive retrieval rounds without inventing a contribution',async()=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);const call=vi.fn(async()=>({contextRequests:['producer_note:missing']}));
  await expect(dispatchCrewTask({...x.input,call})).rejects.toThrow('Missing or unsupported');expect(call).toHaveBeenCalledTimes(1);
  const repeats=vi.fn(async()=>({contextRequests:['producer_note:global']}));await expect(dispatchCrewTask({...x.input,call:repeats})).rejects.toThrow('Evidence round limit');expect(repeats).toHaveBeenCalledTimes(3);
 });
 it('keeps chapter reviewers on a single full-chapter task, including every source word and shot',async()=>{
  const x=setup('script_supervisor');await dispatchCrewTask({...x.input,call:async p=>{const d=decodePrompt(p);expect(d.brief.shots).toHaveLength(40);expect(d.brief.source.text).toEqual(x.brief.source.text);return answer(p);}});expect(x.requests).toHaveLength(1);
 });
 it.each([{cap:110000,repeats:1000},{cap:2400000,repeats:7000}])('consolidates chapter detail across byte or transport limits without losing evidence ($cap)',async({cap,repeats})=>{
  const x=setup('script_supervisor'),camera:CrewContribution={summary:'Current camera proposal',directions:x.brief.shots.map((s,i)=>({shotId:s.id,instruction:`EXACT_CAMERA_${i} `+'detail '.repeat(repeats),scriptureBasis:'v1'})),findings:[]};
  camera.exchange=saveContribution(x.record,x.brief,'cinematographer',1,camera,'planning');
  const retained={[camera.exchange[0]!.id]:camera},before=JSON.stringify({brief:x.brief,record:x.record,camera}),modes:string[]=[],seen:string[]=[];
  const finding={shotId:'s0',severity:'blocking' as const,evidence:'Local unresolved continuity',requestedChange:'Owner must inspect',confidence:90,limitations:'Planning only'};
  const result=await dispatchCrewTask({...x.input,chapterBytes:cap,contributions:{cinematographer:camera},retainedContributions:retained,call:async(p,s,m)=>{
   codexInputBudget(p,s,m,cap);const packet=decodePrompt(p),mode=p.match(/TASK CONTEXT: ([^;]+)/)![1]!;modes.push(mode);
   expect(packet.brief.source).toEqual(x.brief.source);expect(packet.brief.shots).toHaveLength(40);
   const strict=codexOutputSchema(s);expect(()=>new Ajv2020({strict:false}).compile(strict)).not.toThrow();
   if(mode==='chapter-detail'){seen.push(...packet.task.shotIds);return{...answer(p),findings:packet.task.shotIds.includes('s0')?[finding]:[]};}
   expect(packet.chapterDetailReview.uniqueShots).toBe(40);expect(packet.contributions.cinematographer.directions).toEqual([]);
   expect(packet.contributions.script_supervisor.findings).toContainEqual(finding);
   const ref=`direction_shot:${camera.exchange![0]!.id}:s30`;
   if(!packet.retrievedEvidence[ref])return{contextRequests:[ref]};
   expect(packet.retrievedEvidence[ref].value).toEqual(camera.directions[30]);
   return{summary:'Explicit chapter-wide consolidation',directions:[],findings:[]};
  }});
  expect(seen).toHaveLength(40);expect(new Set(seen).size).toBe(40);expect(modes.filter(m=>m==='chapter-rollup')).toHaveLength(2);
  expect(result.directions).toHaveLength(40);expect(result.findings).toContainEqual(finding);
  expect(JSON.stringify({brief:x.brief,record:x.record,camera})).toBe(before);
 });
 it.each(['carried','resolved','missing'] as const)('reconciles conflicting pure chapter-detail responses only in the mandatory whole-chapter owner review (%s)',async outcome=>{
  const x=setup('script_supervisor'),camera:CrewContribution={summary:'Camera',directions:x.brief.shots.map((s,i)=>({shotId:s.id,instruction:`Camera ${i} `+'detail '.repeat(1000),scriptureBasis:'v1'})),findings:[]};
  camera.exchange=saveContribution(x.record,x.brief,'cinematographer',1,camera,'planning');
  saveContribution(x.record,x.brief,'script_supervisor',0,{summary:'Prior continuity issue',directions:[],findings:[{shotId:'s0',severity:'blocking',evidence:'Earlier written continuity conflict',requestedChange:'Owner must reconcile full chapter scope',confidence:90,limitations:'Planning only'}]},'planning');
  const issue=x.record.objections.find(o=>o.owner==='script_supervisor')!.id,before=JSON.stringify(x.record);let parts=0,rollups=0;
  const finding={shotId:'s0',severity:'blocking' as const,evidence:'Retained actual-target prerequisite',requestedChange:'Review actual media later',confidence:90,limitations:'No actual media supplied'};
  const pending=dispatchCrewTask({...x.input,chapterBytes:110000,contributions:{cinematographer:camera},call:async(p,s)=>{
   const packet=decodePrompt(p);
   if(packet.task){parts++;return{...answer(p),findings:packet.task.shotIds.includes('s0')?[finding]:[],objectionResponses:[{objectionId:issue,outcome:parts===1?'carried':'resolved',rationale:'Original task scope',evidence:'Original scoped planning evidence'}]};}
   rollups++;expect(p).toContain('TASK CONTEXT: chapter-rollup;');expect(packet.chapterDetailReview.uniqueShots).toBe(40);expect(packet.brief.shots).toHaveLength(40);
   const responses=packet.shotTaskResponseReconciliation.candidates.flatMap((c:any)=>c.responses);expect(responses.some((r:any)=>r.outcome==='carried')).toBe(true);expect(responses.some((r:any)=>r.outcome==='resolved')).toBe(true);
   expect(packet.contributions.script_supervisor.findings).toContainEqual(finding);expect(packet.contributions.script_supervisor.directions).toHaveLength(40);
   const strict:any=codexOutputSchema(s);expect(strict.properties.objectionResponses.anyOf[1].items.properties.objectionId.enum).toEqual([issue]);
   return{summary:'Explicit whole chapter owner decision',directions:[],findings:[],objectionResponses:outcome==='missing'?[]:[{objectionId:issue,outcome,rationale:'Full chapter planning reviewed',evidence:'All issue bodies and original response scopes supplied'}]};
  }});
  if(outcome==='missing')await expect(pending).rejects.toThrow('explicitly answer');else{const result=await pending;expect(result.directions).toHaveLength(40);expect(result.findings).toContainEqual(finding);expect(result.objectionResponses![0]!.outcome).toBe(outcome);}
  expect(parts).toBeGreaterThan(1);expect(rollups).toBe(1);expect(JSON.stringify(x.record)).toBe(before);
 });
 it('never allows scoped Director details to issue a chapter verdict',async()=>{
  const x=setup('production_director'),camera:CrewContribution={summary:'Camera',directions:x.brief.shots.map((s,i)=>({shotId:s.id,instruction:`Camera ${i} `+'detail '.repeat(1000),scriptureBasis:'v1'})),findings:[]};
  camera.exchange=saveContribution(x.record,x.brief,'cinematographer',1,camera,'planning');
  let global=0;
  const output=await dispatchCrewTask({...x.input,chapterBytes:110000,contributions:{cinematographer:camera},call:async(p,s)=>{
   const packet=decodePrompt(p);
   if(packet.task){expect((s.properties as any).decision).toBeUndefined();expect(p).toContain('never chapter approval');return answer(p);}
   global++;expect((s.properties as any).decision).toBeDefined();
   return{summary:'Chapter remains held',directions:[],findings:[],decision:'hold',decisionConfidence:90,decisionLimitations:'Original unresolved evidence remains',acceptedContributionIds:[],acceptanceChecks:{status:'hold',evidence:'Owner correction required'}};
  }});
  expect(global).toBe(1);expect(output.decision).toBe('hold');expect(output.directions).toHaveLength(40);expect(x.record.acceptedContributionIds).toEqual([]);
 });
 it.each(['sound_designer','composer','picture_editor'] as const)('keeps %s whole-treatment judgments and recipes in the required chapter rollup',async(role)=>{
  const x=setup(role),camera:CrewContribution={summary:'Complete technical proposal',directions:x.brief.shots.map((s,i)=>({shotId:s.id,instruction:`Camera ${i} `+'detail '.repeat(1000),scriptureBasis:'v1'})),findings:[]};
  const review={status:'unverified' as const,evidence:'Whole chapter reviewed; no actual cut supplied',requestedChange:'Review actual cut before acceptance',confidence:80,limitations:'Planning only'};
  let parts=0,rollups=0;
  const result=await dispatchCrewTask({...x.input,chapterBytes:110000,contributions:{cinematographer:camera},call:async(p,s)=>{
   const mode=p.match(/TASK CONTEXT: ([^;]+)/)![1]!,properties=s.properties as Record<string,unknown>;
   if(mode==='chapter-detail'){
    parts++;expect(properties.treatmentReview).toBeUndefined();expect(properties.audioCues).toBeUndefined();expect(properties.generationRequests).toBeUndefined();expect(properties.craftAssessment).toBeUndefined();return answer(p);
   }
   rollups++;expect(mode).toBe('chapter-rollup');expect(properties.treatmentReview).toBeDefined();
   expect(decodePrompt(p).chapterDetailReview.uniqueShots).toBe(40);
   return{summary:'Required whole-chapter assessment',directions:[],findings:[],treatmentReview:review,...(role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:{audioCues:[],generationRequests:[]})};
  }});
  expect(parts).toBeGreaterThan(1);expect(rollups).toBe(1);expect(result.directions).toHaveLength(40);expect(result.treatmentReview).toEqual(review);
 });
 it('rejects a task changing another shot and rejects conflicting cross-task owner responses',async()=>{
  const x=setup();await expect(dispatchCrewTask({...x.input,call:async p=>{const o=answer(p);o.directions[0]!.shotId='s39';return o;}})).rejects.toThrow('Task directions');
  const base={summary:'A',directions:[],findings:[]};expect(()=>mergeShotTaskOutputs([{...base,ownerResponses:[{contributionId:'proposal',outcome:'accepted',rationale:'a',evidence:'a'}]},{...base,ownerResponses:[{contributionId:'proposal',outcome:'rejected',rationale:'b',evidence:'b'}]}])).toThrow('Conflicting ownerResponses');
 });
 it('retains distinct supporting explanations for the same owner disposition without changing task replies',()=>{
  const base={summary:'Task reviewed',directions:[],findings:[]};
  const outputs=[{...base,objectionResponses:[{objectionId:'issue',outcome:'resolved' as const,rationale:'First exact reason',evidence:'First exact evidence'}],ownerResponses:[{contributionId:'proposal',outcome:'accepted' as const,rationale:'First domain reason',evidence:'First domain evidence'}]},
   {...base,objectionResponses:[{objectionId:'issue',outcome:'resolved' as const,rationale:'Second exact reason',evidence:'Second exact evidence'}],ownerResponses:[{contributionId:'proposal',outcome:'accepted' as const,rationale:'Second domain reason',evidence:'Second domain evidence'}]}];
  const before=JSON.stringify(outputs),merged=mergeShotTaskOutputs([...outputs,outputs[0]!]);
  expect(merged.objectionResponses).toHaveLength(1);expect(merged.objectionResponses![0]).toMatchObject({objectionId:'issue',outcome:'resolved'});
  expect(merged.objectionResponses![0]!.rationale).toBe('First exact reason\nAdditional task rationale:\nSecond exact reason');
  expect(merged.objectionResponses![0]!.evidence).toContain('Second exact evidence');
  expect(merged.ownerResponses![0]!.rationale).toContain('First domain reason');expect(merged.ownerResponses![0]!.rationale).toContain('Second domain reason');
  expect(JSON.stringify(outputs)).toBe(before);
 });
 it('retains overflowing task prose exactly with scope and targeted retrieval instead of truncating or widening the summary limit',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');
  const originals=[{summary:'FIRST_EXACT '+ 'a'.repeat(6500),directions:[{shotId:'s0',instruction:'first',scriptureBasis:'v1'}],findings:[]},{summary:'SECOND_EXACT '+ 'b'.repeat(6500),directions:[{shotId:'s30',instruction:'second',scriptureBasis:'v2'}],findings:[]}];
  const before=JSON.stringify(originals),merged=mergeShotTaskOutputs(originals);
  expect(merged.summary.length).toBeLessThan(12000);expect(merged.taskSummaries!.map(t=>t.summary)).toEqual(originals.map(o=>o.summary));
  expect(()=>validateContribution(merged,'staging_designer',b)).not.toThrow();
  merged.exchange=saveContribution(r,b,'staging_designer',1,merged,'planning');
  const packet=scopedCrewPacket(b,{staging_designer:merged},r,['s0'],'lighting_designer');
  expect(packet.contributions.staging_designer!.taskSummaries).toHaveLength(1);
  expect(JSON.stringify(packet)).not.toContain('SECOND_EXACT');
  expect(packet.taskSummaryIndex).toHaveLength(1);expect(packet.taskSummarySources[0]!.taskNumbers).toEqual([1,2]);
  const ref=`task_summary_shot:${packet.taskSummarySources[0]!.contributionId}:s30`;
  const value:any=retrieveCrewEvidence(b,r,[ref],{[merged.exchange[0]!.id]:merged})[ref];
  expect(value.value.summaries[0].summary).toBe(originals[1]!.summary);expect(value.value.summaries[0].shotIds).toEqual(['s30']);
  expect(JSON.stringify(originals)).toBe(before);
 });
 it('still rejects opposing objection dispositions and explanations exceeding the exchange bound',()=>{
  const base={summary:'Task reviewed',directions:[],findings:[]};
  const a={...base,objectionResponses:[{objectionId:'issue',outcome:'resolved' as const,rationale:'a',evidence:'a'}]};
  expect(()=>mergeShotTaskOutputs([a,{...base,objectionResponses:[{objectionId:'issue',outcome:'carried',rationale:'b',evidence:'b'}]}])).toThrow('Conflicting objectionResponses');
  expect(()=>mergeShotTaskOutputs([a,{...base,objectionResponses:[{objectionId:'issue',outcome:'resolved',rationale:'b'.repeat(12000),evidence:'b'}]}])).toThrow('no evidence truncated');
 });
 it('never drops a protected oversized note to make a request fit',async()=>{
  const x=setup();x.brief.shots=x.brief.shots.slice(0,1);x.brief.producerNotes[0]!.note='protected '.repeat(10000);const call=vi.fn();await expect(dispatchCrewTask({...x.input,specialistBytes:20000,call})).rejects.toThrow('before submission');expect(call).not.toHaveBeenCalled();
 });
 it('preserves open cross-scene objections in a local task',()=>{
  const b=fixture(),r=newProductionRecord(b,'run','hash');r.objections=[{id:'old',owner:'script_supervisor',shotId:'s30',severity:'blocking',status:'open',evidence:'Wrong identity',requestedChange:'Repair',confidence:90,limitations:'Fixture'}];
  r.history=[{id:'old',kind:'objection',inputRevision:'older',inputBriefSha256:'older',owner:'script_supervisor',scope:{projectId:'p',sceneIds:['b'],shotIds:['s30'],verseRefs:['v2'],audioBindingRefs:[]},proposedChanges:[],rationale:'Wrong identity',evidence:[],objections:[],destination:{roles:['production_director'],stage:'planning',subjectId:'p'},relatedContributions:[],supersedes:null,finding:{severity:'blocking',confidence:90,limitations:'Fixture'},resolution:null}];
  expect(scopedCrewPacket(b,{},r,['s0']).productionRecord!.objections[0]!.id).toBe('old');
 });
});

it('uses one bounded audiovisual request and never starts paid evidence iterations',async()=>{
 const x=setup('lighting_designer');const call=vi.fn(async()=>({contextRequests:['producer_note:global']}));
 await expect(dispatchCrewTask({...x.input,media:[{mimeType:'video/mp4',data:'AA=='}],call})).rejects.toThrow('cannot dispatch extra paid');expect(call).toHaveBeenCalledTimes(1);expect(x.requests[0]).toContain('TASK CONTEXT: chapter');
});
it('does not allow scoped continuation to reset the physical call counter',async()=>{
 const x=setup(),call=vi.fn();await expect(runCrew({phase:'planning',brief:x.brief,boundedContext:true,scopedContext:true,call,log:()=>{},resumeFirstPass:{contributions:{},completedRoles:[],calls:1,failedRole:'creative_director',previousError:'fixture'}})).rejects.toThrow('retained physical inference count');expect(call).not.toHaveBeenCalled();
});

it('retrieves another specialists full previous mix recipe without copying it into every review',()=>{
 const b=fixture();b.render={id:'render',path:'cut.mp4',sha256:'hash',durationMs:10000,timeline:[],finishing:{baseRenderId:'base',basePath:'base.mp4',baseSha256:'base-hash',previousDecisions:{composer:{summary:'Full retained cue recipe',directions:[],findings:[],audioCues:[{assetId:'cue',startMs:0,endMs:1000,sourceStartMs:0,gainDb:-18,reason:'Source-supported'}]}}}};
 expect(chapterCrewPacket(b,{},undefined,'picture_editor').brief.render!.finishing!.previousDecisions).toEqual({});
 expect((retrieveCrewEvidence(b,undefined,['previous_role:composer'])['previous_role:composer'] as any).value.audioCues[0].assetId).toBe('cue');
});
it('reports the explicit absence of optional prior-role history without inventing approval',async()=>{
 const x=setup('creative_director');let calls=0;
 await dispatchCrewTask({...x.input,call:async p=>{
  if(++calls===1)return{summary:'Check whether a previous Director verdict exists',directions:[],findings:[],contextRequests:['previous_role:production_director']};
  const evidence=decodePrompt(p).retrievedEvidence['previous_role:production_director'];
  expect(evidence.value).toMatchObject({status:'not_recorded',role:'production_director',notAnApproval:true});
  expect(evidence.value).not.toHaveProperty('decision');return answer(p);
 }});
 expect(calls).toBe(2);expect(x.record.acceptedContributionIds).toEqual([]);
 expect(()=>retrieveCrewEvidence(x.brief,x.record,['previous_role:invented_role'])).toThrow('Missing or unsupported');
 expect(()=>retrieveCrewEvidence(x.brief,x.record,['producer_note:missing'])).toThrow('Missing or unsupported');
});
it('retrieves the latest saved role envelope with its provenance instead of falsely reporting absence',()=>{
 const x=setup();saveContribution(x.record,x.brief,'production_director',1,{summary:'Hold: current owners must review',directions:[],findings:[],decision:'hold'},'planning');
 const before=JSON.stringify(x.record),evidence:any=retrieveCrewEvidence(x.brief,x.record,['previous_role:production_director'])['previous_role:production_director'];
 expect(evidence.value).toMatchObject({status:'recorded_contribution',notAnApproval:true,contribution:{owner:'production_director',rationale:'Hold: current owners must review'}});
 expect(evidence.sha256).toBe(recordHash(evidence.value));expect(JSON.stringify(x.record)).toBe(before);
});
it('requires a retrieved exact before-fact before accepting a task fact proposal',async()=>{
 const x=setup();x.brief.shots=x.brief.shots.slice(0,1);const before=x.record.snapshots[0]!.shots[0]!.facts.framing!;
 const proposal={target:{layer:'shots' as const,entityId:'s0',fact:'framing'},before,after:{...before,value:'close-up'}};
 await expect(dispatchCrewTask({...x.input,call:async p=>({...answer(p),filmChanges:[proposal]})})).rejects.toThrow('retrieved exact before-fact');
 let calls=0;const output=await dispatchCrewTask({...x.input,call:async p=>++calls===1?{contextRequests:['fact:'+JSON.stringify(['a','shots','s0','framing'])]}:{...answer(p),filmChanges:[proposal]}});
 expect(calls).toBe(2);expect(output.filmChanges).toEqual([proposal]);
});
