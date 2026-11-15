import {afterEach,describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyInitialCameraContinuation,verifyInitialSpecialistContinuation,rebaseVerifiedContinuation} from '../../src/pipeline/creative-direction/crew-continuation.js';
import {runProductionCrew} from '../../src/pipeline/creative-direction/crew-store.js';
import {mergeShotTaskOutputs,shotTaskResponseReconciliation,normalizeResponseReconciliation} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewBriefHash} from '../../src/pipeline/creative-direction/crew-context.js';
import {executableProductionRolesFor} from '../../src/pipeline/creative-direction/role-registry.js';
import {crewSchema,validateContribution} from '../../src/pipeline/creative-direction/crew.js';
import {codexInputBudget,codexPrompt} from '../../src/providers/codex-text.js';
import {encodeCrewPacket} from '../../src/pipeline/creative-direction/crew-packet.js';
import {recordHash,newProductionRecord,saveContribution,acceptProductionRecord} from '../../src/pipeline/creative-direction/production-record.js';
import type {CrewBrief,CrewContribution} from '../../src/pipeline/creative-direction/crew-types.js';
const cleanups:Array<()=>void>=[];afterEach(()=>{for(const f of cleanups.splice(0))f();});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'heartword-camera-resume-')),db=new DatabaseSync(':memory:');cleanups.push(()=>{db.close();rmSync(root,{recursive:true,force:true});});
 db.exec('CREATE TABLE production_runs(id TEXT,project_id TEXT,phase TEXT,brief_hash TEXT,brief_json TEXT,status TEXT,result_json TEXT,worker_pid INTEGER,created_at INTEGER);CREATE TABLE production_events(id TEXT,run_id TEXT,sequence INTEGER,role TEXT,round INTEGER,model TEXT,output_json TEXT,error TEXT);CREATE TABLE edit_commands(project_id TEXT,command_type TEXT,payload TEXT,sequence INTEGER);');
 const brief:CrewBrief={project:{id:'p',language:'hatam',book:'mark',chapter:6},source:{hashes:['source'],text:[{verse:1,text:'Exact source'}],reference:[{verse:1,text:'Exact reference'}]},audio:[],canon:[],shots:Array.from({length:3},(_,i)=>({id:'s'+i,sceneId:'scene',sceneSequence:1,sequence:i,verseRef:'v1',action:'Source action',framing:'medium',cameraMovement:'static',continuity:'Continuous',lighting:'day',needsLipSync:false,characterIds:[],dialogueCharacterId:null,beats:[],clip:null})),producerNotes:[],audioAssets:[],spentUsd:0};
 const hash=crewBriefHash(brief,'planning'),record=newProductionRecord(brief,'source',hash),contributions:any={};let seq=0;
 const media=[{mimeType:'image/png',data:Buffer.from('image evidence').toString('base64'),caption:'Approved pinned reference'}];
 const native=(role:string,task:number,body:unknown,failed=false,runId='source',target='s0',mode='',evidenceRound=0,schemaOverride?:any)=>{
  const eventId=`${runId}:${role}:1:${mode?mode+':':''}task-${task}:evidence-${evidenceRound}`,folder=join(root,'assets','preparation','crew-reasoning','p',eventId.replaceAll(':','_'));mkdirSync(folder,{recursive:true});
  const schema=schemaOverride??(mode?{type:'object',properties:{directions:{anyOf:[{type:'array',items:{type:'object'}}]}}}:['cinematographer','choreographer'].includes(role)?{type:'object',properties:{directions:{anyOf:[{type:'object',properties:{[target]:{type:'object'}}}]}}}:{type:'object',properties:{summary:{type:'string'}}});
  const prompt='Exact immutable source and task',input=codexInputBudget(prompt,schema,media,200000);
  const attachments=media.map((m,i)=>{const bytes=Buffer.from(m.data,'base64'),path=join(folder,`input-${i}.bin`);writeFileSync(path,bytes);return{mimeType:m.mimeType,caption:m.caption,path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};});
  writeFileSync(join(folder,'request.json'),JSON.stringify({prompt,schema,input,requestedModel:'gpt-6.1-sol',reasoningEffort:'medium',media:attachments}));
  const stream=failed?[{type:'turn.started'}]:[{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(body)}},{type:'turn.completed',usage:{input_tokens:20,cached_input_tokens:0,output_tokens:10}}];
  writeFileSync(join(folder,'response.jsonl'),stream.map(e=>JSON.stringify(e)).join('\n'));
  if(!failed)writeFileSync(join(folder,'usage.json'),JSON.stringify({requestedModel:'gpt-6.1-sol',authentication:'chatgpt',reasoningEffort:'medium',inputSha256:input.sha256,usage:{inputTokens:20,cachedInputTokens:0,outputTokens:10,reasoningOutputTokens:null}}));
  const insert=(kind:string,payload:any)=>db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p',kind,JSON.stringify({eventId,...payload}),++seq);
  insert('submit_crew_reasoning',{briefHash:hash,input,evidenceDir:folder});insert('complete_crew_reasoning',failed?{transport:'exited_unsuccessfully',exitCode:null,reason:'Codex request timed out; reconcile its retained submission before retrying.',resultAccepted:false}:{transport:'exited_successfully',exitCode:0});return folder;
 };
 for(const [i,role]of ['creative_director','scripture_cultural_reviewer'].entries()){
  const reply:CrewContribution={summary:'Completed concern-bearing review',directions:brief.shots.map(s=>({shotId:s.id,instruction:'Retain exact source',scriptureBasis:'Source'})),findings:[]};
  if(i===1)reply.treatmentReview={status:'concern',evidence:'Still needs target review',requestedChange:'Keep pending',confidence:90,limitations:'Planning only'};
  native(role,1,reply);
  if(reply.treatmentReview)reply.findings.push({shotId:null,severity:'blocking',evidence:'Emotional treatment (concern): Still needs target review',requestedChange:'Keep pending',confidence:90,limitations:'Planning only'});
  reply.exchange=saveContribution(record,brief,role as any,1,reply,'planning');contributions[role]=reply;
  db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`source:${role}:1`,'source',i+1,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(reply));
 }
 const part=native('cinematographer',1,{summary:'Completed camera part',directions:{s0:{instruction:'Original camera view',scriptureBasis:'Source'}},findings:[]}),failed=native('cinematographer',2,null,true);
 db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('source:cinematographer:1','source',3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
 db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('source','p','planning',hash,JSON.stringify(brief),'incomplete',JSON.stringify({status:'incomplete',calls:3,inferenceCalls:4,contributions,productionRecord:record}),null,1);
 const verify=()=>verifyInitialCameraContinuation(db,root,'p',brief,'source',media,[]);
 return{db,root,brief,media,part,failed,verify,native,hash};
}
function correction(blockerOwner?:string){
 const x=fixture(),roles=[...executableProductionRolesFor('planning').filter(r=>r!=='production_director'),'fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'];
 const seedRecord=newProductionRecord(x.brief,'held',x.hash),seed:any={};
 const treatment={version:1,progression:'Source-grounded progression',beats:[{id:'b1',shotIds:['s0','s1','s2'],sourceTrigger:{verseRef:'Mark 6:1',textKind:'source',quote:'Exact source'},audienceExperience:'Attention',characterResponse:'Listen',intensity:'Restrained',filmableMeans:'Source action',progression:'Source progression',limitations:'Fixture'}],pauses:[],cues:[]};
 for(const [i,role]of roles.entries()){
  const c:any={summary:'Prior held proposal',directions:x.brief.shots.map(s=>({shotId:s.id,instruction:'Exact instruction '+s.id,scriptureBasis:'Source'})),findings:role===blockerOwner?[{shotId:null,severity:'blocking',evidence:'Await current complete reviews',requestedChange:'Original owner must assess current reviews',confidence:95,limitations:'Planning only'}]:[],...(['sound_designer','composer'].includes(role)?{audioCues:[],generationRequests:[]}:{}),...(role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:{}),...(role==='creative_director'?{emotionalTreatment:treatment}:{}),...(role==='production_director'?{decision:'hold'}:{})};
  c.exchange=saveContribution(seedRecord,x.brief,role as any,1,c,'planning');seed[role]=c;x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('held:'+role+':1','held',i+1,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(c));
 }
 const seedResult=JSON.stringify({contributions:seed,productionRecord:seedRecord});x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('held','p','planning',x.hash,JSON.stringify(x.brief),'held',seedResult,null,2);
 const record=structuredClone(seedRecord);record.revision='correction';const contributions=structuredClone(seed);
 for(const [i,role]of ['creative_director','scripture_cultural_reviewer'].entries()){
  const raw:any={summary:'Fresh validated owner review',directions:[],findings:[],...(i===0?{emotionalTreatment:treatment}:{treatmentReview:{status:'clear',evidence:'Source matched',requestedChange:'Retain',confidence:90,limitations:'Planning only'}})};
  x.native(role,1,raw,false,'correction','s0','chapter-rollup');const body={...raw,directions:seed[role].directions};body.exchange=saveContribution(record,x.brief,role as any,1,body,'planning');contributions[role]=body;x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('correction:'+role+':1','correction',i+1,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(body));
 }
 const folder=x.native('cinematographer',1,{summary:'Exact evidence needed',directions:[],findings:[],contextRequests:['current_direction:s0']},false,'correction','s0','chapter-rollup');
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('correction:cinematographer:1','correction',3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol','Codex transport character limit exceeded before submission; split the task context.');
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('correction','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({calls:3,inferenceCalls:3,contributions,productionRecord:record}),null,3);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','review_held_planning_proposals',JSON.stringify({runId:'correction',sourceRunId:'held',sourceResultSha256:createHash('sha256').update(seedResult).digest('hex'),sourceBriefHash:x.hash,currentBriefHash:x.hash}),100);
 return{...x,folder,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'correction',x.media,[])};
}
function timedOutCorrection(kind='valid'){
 const x=correction(),v=x.verify(),runId='timed-out-correction',rebound=rebaseVerifiedContinuation(v,x.brief,runId);
 x.native('cinematographer',1,{summary:'One more exact record',directions:[],findings:[],contextRequests:['current_direction:s1']},false,runId,'s0','chapter-rollup',1);
 const folder=x.native('cinematographer',1,null,true,runId,'s0','chapter-rollup',2);
 if(kind==='completed')writeFileSync(join(folder,'response.jsonl'),JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));
 if(kind==='agent_result')writeFileSync(join(folder,'response.jsonl'),JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}}));
 if(kind==='unknown_error')writeFileSync(join(folder,'response.jsonl'),JSON.stringify({type:'error',message:'Unknown provider failure'}));
 if(kind==='known_notice')writeFileSync(join(folder,'response.jsonl'),[{type:'thread.started',thread_id:'known'},{type:'item.completed',item:{type:'error',message:'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable features.code_mode_host.'}},{type:'turn.started'}].map(e=>JSON.stringify(e)).join('\n'));
 for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':'+c.role+':1',runId,i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run(runId+':cinematographer:1',runId,3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol',kind==='wrong_error'?'Unrelated failure':'Codex request timed out; reconcile its retained submission before retrying.');
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId,'p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({calls:4,inferenceCalls:kind==='reset'?3:5,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,4);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...v.provenance,runId,originalCalls:3,originalInferenceCalls:3,rebasedCompletedRoles:v.resume.completedRoles}),101);
 return{...x,runId,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,runId,x.media,[])};
}
function rejectedInputCorrection(kind='valid'){
 const x=timedOutCorrection(),folder=join(x.root,'assets','preparation','crew-reasoning','p',x.runId+'_cinematographer_1_chapter-rollup_task-1_evidence-2'),path=join(folder,'request.json'),request=JSON.parse(readFileSync(path,'utf8'));request.prompt='x'.repeat(1100000);request.input=codexInputBudget(request.prompt,request.schema,x.media,1750000);writeFileSync(path,JSON.stringify(request));
 const eventId=x.runId+':cinematographer:1:chapter-rollup:task-1:evidence-2',reason='Codex multipart RPC failed; retain and reconcile the submission.';
 for(const row of x.db.prepare("SELECT rowid,command_type,payload FROM edit_commands WHERE command_type IN ('submit_crew_reasoning','complete_crew_reasoning')").all()){const p=JSON.parse(String(row.payload));if(p.eventId===eventId){if(row.command_type==='submit_crew_reasoning')p.input=request.input;else p.reason=reason;x.db.prepare('UPDATE edit_commands SET payload=? WHERE rowid=?').run(JSON.stringify(p),row.rowid);}}
 const actual=Array.from(codexPrompt(request.prompt,x.media)).length,stream:any[]=[{id:3,result:{model:kind==='preparedModel'?'other':'gpt-6.1-sol',modelProvider:'openai',reasoningEffort:'medium',approvalPolicy:'never',sandbox:{type:'readOnly'},instructionSources:[],thread:{id:'ephemeral',ephemeral:true,turns:[]}}},{id:4,error:{code:-32602,data:{input_error_code:'input_too_large',max_chars:kind==='limit'?10:1048576,actual_chars:kind==='chars'?actual-1:actual},message:'Input exceeds the maximum length of 1048576 characters.'}}];
 if(kind==='started')stream.push({method:'turn/started',params:{threadId:'ephemeral',turn:{id:'turn'}}});if(kind==='accepted')stream[1]={id:4,result:{turn:{id:'turn',status:'inProgress'}}};writeFileSync(join(folder,'response.jsonl'),stream.map(e=>JSON.stringify(e)).join('\n'));
 if(kind==='usage')writeFileSync(join(folder,'usage.json'),'{}');x.db.prepare('UPDATE production_events SET error=? WHERE run_id=? AND role=?').run(kind==='wrongError'?'Other failure':reason,x.runId,'cinematographer');
 return{...x,folder};
}
describe('receipted correction continuation',()=>{
 it.each(['valid','preparedModel','limit','chars','started','accepted','usage','wrongError'])('distinguishes a proven pre-model size rejection from unknown submitted usage: %s',kind=>{
  const x=rejectedInputCorrection(kind);if(kind!=='valid'){expect(()=>x.verify()).toThrow();return;}
  const v=x.verify();expect(v.resume.inferenceCalls).toBe(5);expect(v.resume.calls).toBe(4);expect(v.pendingEvidence).toMatchObject({nextRound:2,refs:['current_direction:s0','current_direction:s1']});expect(v.provenance.inputRejectedPendingEvidence).toMatchObject({modelTurnStarted:false,reason:'input_too_large',maximumCharacters:1048576,retrySameRound:true});expect(v.provenance.receipts.at(-1)!.inputRejectedBeforeModel).toEqual(v.provenance.inputRejectedPendingEvidence);expect(v.provenance.receipts.at(-1)).not.toHaveProperty('usageSha256');expect(v.provenance.receipts.at(-1)).not.toHaveProperty('completedStreamUsage');expect(v.provenance.timedOutPendingEvidence).toBeUndefined();expect(v.provenance.newProviderCalls).toBe(0);
 });
 it.each(['valid','known_notice','completed','agent_result','wrong_error','reset','unknown_error'])('retries an unfinished timed-out evidence round without inventing completion or resetting usage: %s',kind=>{
  const x=timedOutCorrection(kind);if(!['valid','known_notice'].includes(kind)){expect(()=>x.verify()).toThrow();return;}const v=x.verify();expect(v.pendingEvidence).toMatchObject({nextRound:2,refs:['current_direction:s0','current_direction:s1']});expect(v.resume.calls).toBe(4);expect(v.resume.inferenceCalls).toBe(5);expect(v.provenance.receipts).toHaveLength(5);expect(v.provenance.timedOutPendingEvidence).toMatchObject({round:2,usageUnknown:true,retrySameRound:true});expect(v.resume.completedRoles).toHaveLength(2);
 });
 it('verifies a native direction delta after a timed-out final round and retains its exact completed owner before the next local hold',()=>{
  const x=timedOutCorrection(),v=x.verify(),runId='after-timeout-delta',rebound=rebaseVerifiedContinuation(v,x.brief,runId),proposal=v.planningProposals!.cinematographer!,replacement={...proposal.directions[0]!,instruction:'Corrected physical key only'},raw={summary:'Selected correction; unrelated instructions retained',directions:[],findings:[],directionUpdates:{baseDirectionsSha256:recordHash(proposal.directions),updates:[replacement]}};
  const schema:any={type:'object',properties:{directions:{anyOf:[{type:'array',items:{type:'object'}}]}}};schema.properties.directionUpdates={type:'object',properties:{baseDirectionsSha256:{type:'string',enum:[recordHash(proposal.directions)]},updates:{type:'array',items:{type:'object'}}}};x.native('cinematographer',1,raw,false,runId,'s0','chapter-rollup',2,schema);
  for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':'+c.role+':1',runId,i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
  const reply:any={summary:raw.summary,directions:proposal.directions.map((d,i)=>i===0?replacement:d),findings:[]};reply.exchange=saveContribution(rebound.record,x.brief,'cinematographer',1,reply,'planning');rebound.resume.contributions.cinematographer=reply;
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':cinematographer:1',runId,3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(reply));x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run(runId+':choreographer:1',runId,4,'choreographer',1,'not_submitted','Codex transport character limit exceeded before submission; split the task context.');
  x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId,'p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({calls:6,inferenceCalls:6,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,5);x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...v.provenance,runId,originalCalls:4,originalInferenceCalls:5,rebasedCompletedRoles:v.resume.completedRoles}),102);
  const child=verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,runId,x.media,[]);expect(child.resume.completedRoles).toEqual(['creative_director','scripture_cultural_reviewer','cinematographer']);expect(child.resume.contributions.cinematographer!.directions).toEqual(reply.directions);expect(child.resume.inferenceCalls).toBe(6);expect(child.provenance.receipts).toHaveLength(6);
 });
 it.each(['valid','unrequested','wrong_error','unknown_failure'])('recovers a malformed exact-fact query only from its receipted native request and reproduced syntax error: %s',kind=>{
  const x=correction(),ref='fact:'+JSON.stringify(['scene','states','state:s0','light.direction'])+' trailing prose',file=join(x.folder,'response.jsonl');let failure='';try{JSON.parse(ref.slice(5));}catch(e){failure=(e as Error).message;}
  if(kind!=='unrequested'){const events=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));events[0].item.text=JSON.stringify({summary:'Exact fact requested',directions:[],findings:[],contextRequests:[ref]});writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n'));}
  x.db.prepare("UPDATE production_events SET error=? WHERE run_id='correction' AND role='cinematographer'").run(kind==='unknown_failure'?'Unrelated JSON failure':kind==='wrong_error'?failure+' wrong':failure);
  if(kind!=='valid'){expect(()=>x.verify()).toThrow();return;}const v=x.verify();expect(v.pendingEvidence).toMatchObject({nextRound:1,refs:[ref]});expect(v.resume.inferenceCalls).toBe(3);expect(v.resume.completedRoles).toHaveLength(2);expect(v.provenance.receipts).toHaveLength(3);
 });
 it.each(['valid','missing','wrong_role','wrong_hash','unbounded'])('only resumes exhausted evidence with an exact finite audited extension: %s',kind=>{
  const x=correction();x.native('cinematographer',1,{summary:'Second request',directions:[],findings:[],contextRequests:['current_direction:s1']},false,'correction','s0','chapter-rollup',1);x.native('cinematographer',1,{summary:'Full saved evidence required',directions:[],findings:[],contextRequests:['current_direction:s2']},false,'correction','s0','chapter-rollup',2);
  x.db.prepare("UPDATE production_events SET error='Evidence round limit; no contribution accepted' WHERE run_id='correction' AND role='cinematographer'").run();const row=x.db.prepare("SELECT result_json FROM production_runs WHERE id='correction'").get()!,saved=JSON.parse(String(row.result_json));saved.inferenceCalls=5;const result=JSON.stringify(saved);x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='correction'").run(result);
  const ext={sourceRunId:'correction',role:kind==='wrong_role'?'lighting_designer':'cinematographer',previousMaximum:2,maximum:kind==='unbounded'?99:3,sourceResultSha256:kind==='wrong_hash'?'bad':createHash('sha256').update(result).digest('hex'),briefHash:x.hash,actor:'Test owner',authority:'Explicit finite extension'};
  if(kind!=='missing')x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','extend_crew_evidence_rounds',JSON.stringify(ext),110);
  if(kind!=='valid'){expect(()=>x.verify()).toThrow();return;}const v=x.verify();expect(v.pendingEvidence).toMatchObject({nextRound:3,refs:['current_direction:s0','current_direction:s1','current_direction:s2']});expect(v.evidenceRoundLimits).toEqual({cinematographer:3});expect(v.resume.inferenceCalls).toBe(5);expect(v.resume.completedRoles).toHaveLength(2);expect(v.provenance.receipts).toHaveLength(5);
 });
 it.each(['known','unknown','unrequested'])('handles a locally absent exact fact only with pinned known scope and a real pending native request: %s',kind=>{
  const x=correction(),ref='fact:'+JSON.stringify([kind==='unknown'?'unknown-scene':'scene','states','scene','lighting']),file=join(x.folder,'response.jsonl');
  if(kind!=='unrequested'){const events=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));events[0].item.text=JSON.stringify({summary:'Exact lighting fact required',directions:[],findings:[],contextRequests:[ref]});writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n'));}
  x.db.prepare("UPDATE production_events SET error=? WHERE run_id='correction' AND role='cinematographer'").run('Missing or unsupported saved evidence: '+ref);
  if(kind==='known'){const v=x.verify();expect(v.pendingEvidence).toMatchObject({nextRound:1,refs:[ref]});expect(v.resume.inferenceCalls).toBe(3);expect(v.resume.completedRoles).toHaveLength(2);}else expect(()=>x.verify()).toThrow();
 });
 it.each(['valid','unknown_failure','count_reset','pending_tamper'])('retains a wholly unsubmitted pending retry only with exact inherited receipts and a local budget hold: %s',kind=>{
  const x=correction(),v=x.verify(),childId='unsubmitted',rebound=rebaseVerifiedContinuation(v,x.brief,childId);
  for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(childId+':'+c.role+':1',childId,i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run(childId+':cinematographer:1',childId,3,'cinematographer',1,'not_submitted',kind==='unknown_failure'?'Unknown problem':'Codex transport character limit exceeded before submission; split the task context.');
  x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(childId,'p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({calls:4,inferenceCalls:kind==='count_reset'?0:3,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,4);
  x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...v.provenance,runId:childId,originalCalls:3,originalInferenceCalls:3,rebasedCompletedRoles:v.resume.completedRoles,...(kind==='pending_tamper'?{pendingEvidence:{...v.pendingEvidence,nextRound:2}}:{})}),101);
  const verify=()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,childId,x.media,[]);if(kind!=='valid'){expect(verify).toThrow();return;}const child=verify();expect(child.pendingEvidence).toEqual(v.pendingEvidence);expect(child.resume.calls).toBe(4);expect(child.resume.inferenceCalls).toBe(3);expect(child.provenance.receipts).toEqual(v.provenance.receipts);expect(child.resume.completedRoles).toEqual(v.resume.completedRoles);
 });
 it('carries correction provenance and pending requests across another continuation without resetting rounds',()=>{const x=correction(),v=x.verify(),rebound=rebaseVerifiedContinuation(v,x.brief,'child-correction');x.native('cinematographer',1,{summary:'One more exact direction',directions:[],findings:[],contextRequests:['current_direction:s1']},false,'child-correction','s0','chapter-rollup',1);
  for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('child-correction:'+c.role+':1','child-correction',i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('child-correction:cinematographer:1','child-correction',3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol','Codex transport character limit exceeded before submission; split the task context.');
  x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('child-correction','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({calls:4,inferenceCalls:4,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,4);
  x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...v.provenance,runId:'child-correction',originalCalls:3,originalInferenceCalls:3,rebasedCompletedRoles:v.resume.completedRoles}),101);
  const child=verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'child-correction',x.media,[]);expect(child.pendingEvidence).toMatchObject({nextRound:2,refs:['current_direction:s0','current_direction:s1']});expect(child.provenance.recordedPlanningSource).toEqual(v.provenance.recordedPlanningSource);expect(child.resume.inferenceCalls).toBe(4);expect(child.resume.completedRoles).toHaveLength(2);
 });
 it('retains only the two newly reviewed owners while preserving all fifteen seed proposals and the pending evidence round',()=>{const x=correction(),before=x.db.prepare("SELECT result_json FROM production_runs WHERE id='correction'").get()!.result_json,v=x.verify();expect(v.resume.completedRoles).toEqual(['creative_director','scripture_cultural_reviewer']);expect(v.planningProposals).toBeDefined();expect(Object.keys(v.resume.contributions)).toHaveLength(15);expect(v.tasks).toEqual([]);expect(v.pendingEvidence).toMatchObject({role:'cinematographer',nextRound:1,refs:['current_direction:s0']});expect(v.resume.inferenceCalls).toBe(3);expect(v.provenance.receipts).toHaveLength(3);const rebased=rebaseVerifiedContinuation(v,x.brief,'next');expect(rebased.retained).toHaveLength(2);expect(rebased.resume.contributions.scripture_cultural_reviewer!.treatmentReview!.status).toBe('clear');expect(x.db.prepare("SELECT result_json FROM production_runs WHERE id='correction'").get()!.result_json).toBe(before);});
 it.each(['seedHash','futureRole','receipt','accepted','completedOutput'])('rejects unsafe correction continuation: %s',kind=>{const x=correction();if(kind==='seedHash')x.db.prepare("UPDATE edit_commands SET payload=json_set(payload,'$.sourceResultSha256','changed') WHERE command_type='review_held_planning_proposals'").run();if(kind==='receipt')writeFileSync(join(x.folder,'usage.json'),'{}');if(kind==='accepted'||kind==='futureRole'||kind==='completedOutput'){const s=JSON.parse(String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='correction'").get()!.result_json));if(kind==='accepted')s.productionRecord.acceptedContributionIds=['old'];if(kind==='futureRole')s.contributions.lighting_designer.directions[0].instruction='Changed unreviewed seed';if(kind==='completedOutput')s.contributions.creative_director.summary='Invented completion';x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='correction'").run(JSON.stringify(s));}expect(()=>x.verify()).toThrow();});
});
function chained(){
 const x=fixture(),parent=x.verify(),source=x.db.prepare("SELECT result_json FROM production_runs WHERE id='source'").get()!,saved=JSON.parse(String(source.result_json));
 saved.calls++;saved.inferenceCalls+=2;saved.productionRecord.revision='child';
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('child','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify(saved),null,2);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId:'child',originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls}),99);
 x.native('cinematographer',1,{summary:'Second completed part',directions:{s1:{instruction:'Retain next source action',scriptureBasis:'Source'}},findings:[]},false,'child','s1');
 x.native('cinematographer',2,null,true,'child','s2');
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('child:cinematographer:1','child',1,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
 return{...x,verify:()=>verifyInitialCameraContinuation(x.db,x.root,'p',x.brief,'child',x.media,[])};
}
function completedScriptDetails(target='script_supervisor'){
 const x=fixture(),parent=x.verify(),record=structuredClone(parent.record),runId='script',contributions:any=structuredClone(parent.resume.contributions);record.revision=runId;let requests=0,sequence=0;
 const add=(role:string,shotId:string,task:number,mode='')=>{const reply={summary:'Completed original detail',directions:[{shotId,instruction:'Original '+role+' action',scriptureBasis:'Source'}],findings:[]};const schema={type:'object',properties:{directions:{anyOf:[{type:'object',properties:{[shotId]:{type:'object'}}}]}}};x.native(role,task,{...reply,directions:{[shotId]:{instruction:reply.directions[0]!.instruction,scriptureBasis:'Source'}}},false,runId,shotId,mode,0,schema);requests++;return reply;};
 for(const role of ['cinematographer','choreographer','staging_designer','costume_designer','lighting_designer']){
  const parts=role==='cinematographer'?[...parent.tasks]:[];
  for(const [i,s]of x.brief.shots.entries())if(!(role==='cinematographer'&&s.id==='s0'))parts.push(add(role,s.id,i+1));
  const output=mergeShotTaskOutputs(parts);output.exchange=saveContribution(record,x.brief,role as any,1,output,'planning');contributions[role]=output;
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`${runId}:${role}:1`,runId,++sequence,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 }
 for(const role of ['script_supervisor','sound_designer','composer','picture_editor','fidelity_challenger','clarity_challenger','feasibility_challenger','production_director']){
  const parts=x.brief.shots.map((s,i)=>add(role,s.id,i+1,'chapter-detail'));
  if(role===target){x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run(`script:${role}:1`,runId,++sequence,role,1,'codex_cli:requested:gpt-6.1-sol','Codex transport character limit exceeded before submission; split the task context.');break;}
  const recipes=role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:['sound_designer','composer'].includes(role)?{audioCues:[],generationRequests:[]}:{};
  const raw={...recipes,summary:'Actual whole-chapter owner review',directions:[],findings:[],objectionResponses:[],...(role==='feasibility_challenger'?{treatmentReview:{status:'concern',evidence:'Current execution readiness not inspected',requestedChange:'Keep technical prerequisite pending',confidence:90,limitations:'No actual generation route inspected'}}:{})};
  x.native(role,1,raw,false,runId,'s0','chapter-rollup',0,crewSchema(role as any));requests++;
  const {proposal,candidates}=shotTaskResponseReconciliation(parts),output=validateContribution(normalizeResponseReconciliation(raw,proposal,candidates),role as any,x.brief);
  const review=output.treatmentReview;if(review&&review.status!=='clear')output.findings.push({shotId:null,severity:'blocking',evidence:`Emotional treatment (${review.status}): ${review.evidence}`,requestedChange:review.requestedChange,confidence:review.confidence,limitations:review.limitations});
  output.exchange=saveContribution(record,x.brief,role as any,1,output,'planning');contributions[role]=output;
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`${runId}:${role}:1`,runId,++sequence,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 }
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId,'p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({status:'incomplete',calls:parent.resume.calls+sequence,inferenceCalls:parent.resume.inferenceCalls!+requests,contributions,productionRecord:record}),null,2);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId,originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls}),199);
 return{...x,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,runId,x.media,[])};
}
function pendingDirectorEvidence(){
 const x=completedScriptDetails('production_director'),reply={summary:'Provisional exact-evidence request, not a verdict',directions:[],findings:[],contextRequests:['current_direction:s0','source_verse:1'],decision:'hold',decisionConfidence:0,decisionLimitations:'Provisional',acceptedContributionIds:[],acceptanceChecks:{status:'unverified',evidence:'Evidence needed'}};
 const folder=x.native('production_director',1,reply,false,'script','s0','chapter-rollup',0,crewSchema('production_director'));
 const row=x.db.prepare("SELECT result_json FROM production_runs WHERE id='script'").get()!,saved=JSON.parse(String(row.result_json));saved.inferenceCalls++;x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='script'").run(JSON.stringify(saved));
 return{...x,folder,reply};
}
function heldIndexedDirector(blockerOwner?:string){
 const x=correction(blockerOwner),roles=[...executableProductionRolesFor('planning').filter(r=>r!=='production_director'),'fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'];
 const saved=JSON.parse(String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='correction'").get()!.result_json));
 x.db.prepare("DELETE FROM production_events WHERE run_id='correction' AND role='cinematographer'").run();
 for(const row of x.db.prepare("SELECT rowid,payload FROM edit_commands WHERE command_type IN ('submit_crew_reasoning','complete_crew_reasoning')").all())if(JSON.parse(String(row.payload)).eventId.startsWith('correction:cinematographer:'))x.db.prepare('DELETE FROM edit_commands WHERE rowid=?').run(row.rowid);
 for(let i=2;i<roles.length-1;i++){
  const role=roles[i]!,raw:any={summary:'Exact current owner review',directions:[],findings:[],...(['sound_designer','composer'].includes(role)?{audioCues:[],generationRequests:[]}:{}),...(role==='picture_editor'?{coverageRequests:[],edits:[],pauses:[]}:{}),...(['sound_designer','composer','picture_editor','fidelity_challenger','clarity_challenger','feasibility_challenger'].includes(role)?{treatmentReview:{status:'clear',evidence:'Current written source-grounded proposal checked',requestedChange:'Retain',confidence:90,limitations:'Planning only'}}:{})};
  x.native(role,1,raw,false,'correction','s0','chapter-rollup',0,crewSchema(role as any));
  const output=validateContribution({...raw,directions:saved.contributions[role].directions},role as any,x.brief);output.exchange=saveContribution(saved.productionRecord,x.brief,role as any,1,output,'planning');saved.contributions[role]=output;
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('correction:'+role+':1','correction',i+1,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 }
 x.native('production_director',1,{contextRequests:['current_direction:s0'],directions:[],findings:[]},false,'correction','s0','chapter-rollup',0,crewSchema('production_director'));
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('correction:production_director:1','correction',15,'production_director',1,'codex_cli:requested:gpt-6.1-sol','Codex transport character limit exceeded before submission; split the task context.');
 saved.calls=15;saved.inferenceCalls=15;x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='correction'").run(JSON.stringify(saved));
 const parent=x.verify(),runId='indexed-held-director',rebound=rebaseVerifiedContinuation(parent,x.brief,runId),original=parent.planningProposals!.production_director!.directions;
 for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':'+c.role+':1',runId,i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
 const raw:any={summary:'Only my own full instructions were absent',directions:[],findings:[],decision:'hold',decisionConfidence:99,decisionLimitations:'Own array indexed, not inspected',acceptedContributionIds:[],acceptanceChecks:{status:'hold',evidence:'Fresh complete own instruction review needed'}};
 const folder=x.native('production_director',1,raw,false,runId,'s0','chapter-rollup',1,crewSchema('production_director'));
 // Raw capture marks resultAccepted:false before the separate validated role event is saved.
 for(const row of x.db.prepare("SELECT rowid,payload FROM edit_commands WHERE command_type='complete_crew_reasoning'").all()){const p=JSON.parse(String(row.payload));if(p.eventId.startsWith(runId+':')){p.resultAccepted=false;x.db.prepare('UPDATE edit_commands SET payload=? WHERE rowid=?').run(JSON.stringify(p),row.rowid);}}
 const packet:any={contributions:{production_director:{directions:[],directionIndex:original.map(d=>({shotId:d.shotId,sha256:recordHash(d)}))}}};
 const setPacket=()=>{
  const path=join(folder,'request.json'),request=JSON.parse(readFileSync(path,'utf8'));request.prompt='Exact bounded owner request\nBOUNDED CONTEXT:\n'+encodeCrewPacket(packet);request.input=codexInputBudget(request.prompt,request.schema,x.media,200000);writeFileSync(path,JSON.stringify(request));
  const usagePath=join(folder,'usage.json'),usage=JSON.parse(readFileSync(usagePath,'utf8'));usage.inputSha256=request.input.sha256;writeFileSync(usagePath,JSON.stringify(usage));
  for(const row of x.db.prepare("SELECT rowid,payload FROM edit_commands WHERE command_type='submit_crew_reasoning'").all()){const p=JSON.parse(String(row.payload));if(p.eventId.startsWith(runId+':')){p.input=request.input;x.db.prepare('UPDATE edit_commands SET payload=? WHERE rowid=?').run(JSON.stringify(p),row.rowid);}}
 };setPacket();
 const output=validateContribution({...raw,directions:original},'production_director',x.brief);output.exchange=saveContribution(rebound.record,x.brief,'production_director',1,output,'planning');rebound.record.status='held';rebound.resume.contributions.production_director=output;
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':production_director:1',runId,15,'production_director',1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId,'p','planning',x.hash,JSON.stringify(x.brief),'held',JSON.stringify({status:'held',summary:raw.summary,calls:16,inferenceCalls:16,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,4);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId,originalCalls:15,originalInferenceCalls:15,rebasedCompletedRoles:parent.resume.completedRoles}),199);
 return{...x,runId,folder,packet,setPacket,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,runId,x.media,[])};
}
function approvedHeldDirector(blockerOwner='fidelity_challenger'){
 const x=heldIndexedDirector(blockerOwner),parent=x.verify(),runId='approved-held-director',rebound=rebaseVerifiedContinuation(parent,x.brief,runId),original=parent.planningProposals!.production_director!.directions;
 for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':'+c.role+':1',runId,i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
 const raw:any={summary:'Written plan clear; foreign owner lifecycle still controls',directions:[],findings:[],decision:'approve',decisionConfidence:90,decisionLimitations:'Planning only',acceptedContributionIds:rebound.retained.map(c=>c.output.exchange![0]!.id),acceptanceChecks:{status:'clear',evidence:'Current complete directions and reviews checked'}};
 const folder=x.native('production_director',1,raw,false,runId,'s0','chapter-rollup',0,crewSchema('production_director'));
 const path=join(folder,'request.json'),request=JSON.parse(readFileSync(path,'utf8'));request.prompt='Complete current instruction review\nBOUNDED CONTEXT:\n'+encodeCrewPacket({contributions:{production_director:{directions:original}}});request.input=codexInputBudget(request.prompt,request.schema,x.media,200000);writeFileSync(path,JSON.stringify(request));const usagePath=join(folder,'usage.json'),usage=JSON.parse(readFileSync(usagePath,'utf8'));usage.inputSha256=request.input.sha256;writeFileSync(usagePath,JSON.stringify(usage));
 for(const row of x.db.prepare("SELECT rowid,payload FROM edit_commands WHERE command_type='submit_crew_reasoning'").all()){const p=JSON.parse(String(row.payload));if(p.eventId.startsWith(runId+':')){p.input=request.input;x.db.prepare('UPDATE edit_commands SET payload=? WHERE rowid=?').run(JSON.stringify(p),row.rowid);}}
 const output=validateContribution({...raw,directions:original},'production_director',x.brief);output.exchange=saveContribution(rebound.record,x.brief,'production_director',1,output,'planning');rebound.record.status='held';rebound.resume.contributions.production_director=output;
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':production_director:1',runId,15,'production_director',1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId,'p','planning',x.hash,JSON.stringify(x.brief),'held',JSON.stringify({status:'held',summary:raw.summary,calls:17,inferenceCalls:17,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,5);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId,originalCalls:16,originalInferenceCalls:16,rebasedCompletedRoles:parent.resume.completedRoles}),200);
 return{...x,runId,folder,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,runId,x.media,[])};
}
function correctedHeldSuffix(changed=true){
 const x=approvedHeldDirector(),parent=x.verify(),runId='corrected-held-suffix',rebound=rebaseVerifiedContinuation(parent,x.brief,runId),proposals=parent.planningProposals!;
 for(const [i,c]of rebound.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':'+c.role+':1',runId,i+1,c.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(c.output));
 let directorFolder='';
 for(const [i,role]of ['fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'].entries()){
  const directions=structuredClone(proposals[role as keyof typeof proposals]!.directions);
  if(role==='production_director'&&changed)directions[0]!.instruction='Corrected source binding with current exact target';
  const raw:any={summary:'Original owner assessed current correction',directions:role==='production_director'?directions:[],findings:[],...(role==='production_director'?{decision:'hold',decisionConfidence:90,decisionLimitations:'Original reviewers must reassess correction',acceptedContributionIds:[],acceptanceChecks:{status:'hold',evidence:'Original challenger concerns remain'}}:{treatmentReview:{status:'clear',evidence:'Current source and proposal checked',requestedChange:'Retain',confidence:90,limitations:'Planning only'}})};
  const folder=x.native(role,1,raw,false,runId,'s0','chapter-rollup',0,crewSchema(role as any));
  if(role==='production_director'){
   directorFolder=folder;const path=join(folder,'request.json'),request=JSON.parse(readFileSync(path,'utf8'));request.prompt='Complete correction request\nBOUNDED CONTEXT:\n'+encodeCrewPacket({contributions:{production_director:{directions:proposals.production_director!.directions}}});request.input=codexInputBudget(request.prompt,request.schema,x.media,200000);writeFileSync(path,JSON.stringify(request));const up=join(folder,'usage.json'),u=JSON.parse(readFileSync(up,'utf8'));u.inputSha256=request.input.sha256;writeFileSync(up,JSON.stringify(u));
   for(const row of x.db.prepare("SELECT rowid,payload FROM edit_commands WHERE command_type='submit_crew_reasoning'").all()){const p=JSON.parse(String(row.payload));if(p.eventId.startsWith(runId+':production_director:')){p.input=request.input;x.db.prepare('UPDATE edit_commands SET payload=? WHERE rowid=?').run(JSON.stringify(p),row.rowid);}}
  }
  const output=validateContribution({...raw,directions},role as any,x.brief);output.exchange=saveContribution(rebound.record,x.brief,role as any,1,output,'planning');rebound.resume.contributions[role as keyof typeof proposals]=output;
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(runId+':'+role+':1',runId,12+i,role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 }
 rebound.record.status='held';x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId,'p','planning',x.hash,JSON.stringify(x.brief),'held',JSON.stringify({status:'held',summary:'Corrected instructions require original owners',calls:21,inferenceCalls:21,contributions:rebound.resume.contributions,productionRecord:rebound.record}),null,6);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId,originalCalls:17,originalInferenceCalls:17,rebasedCompletedRoles:parent.resume.completedRoles}),201);
 return{...x,runId,folder:directorFolder,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,runId,x.media,[])};
}
describe('verified original-challenger suffix with a Director correction',()=>{
 it('retains the unchanged prefix and actual corrected proposal without closing blockers or resetting calls',()=>{const x=correctedHeldSuffix(),v=x.verify();expect(v.resume.completedRoles).toHaveLength(11);expect(v.resume.failedRole).toBe('fidelity_challenger');expect(v.resume.calls).toBe(21);expect(v.resume.inferenceCalls).toBe(21);expect(v.planningProposals!.production_director!.directions[0]!.instruction).toContain('Corrected source binding');expect(v.record.acceptedContributionIds).toEqual([]);expect(v.record.objections.some(o=>o.status==='open'&&o.severity==='blocking')).toBe(true);expect(v.provenance.newProviderCalls).toBe(0);expect(rebaseVerifiedContinuation(v,x.brief,'next-corrected-owner').retained).toHaveLength(11);});
 it('rejects repeating an unchanged held Director handoff',()=>{const x=correctedHeldSuffix(false);expect(x.verify).toThrow();});
 it('rejects missing native usage after the suffix',()=>{const x=correctedHeldSuffix();writeFileSync(join(x.folder,'usage.json'),'{}');expect(x.verify).toThrow();});
});
describe('original challenger follow-up after Director approval remains held',()=>{
 it.each([['fidelity_challenger',11],['clarity_challenger',12],['feasibility_challenger',13]] as const)('retains the exact unaffected prefix before %s', (owner,count)=>{const x=approvedHeldDirector(owner),before=String(x.db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(x.runId)!.result_json),v=x.verify();expect(v.resume.completedRoles).toHaveLength(count);expect(v.resume.failedRole).toBe(owner);expect(v.resume.calls).toBe(17);expect(v.resume.inferenceCalls).toBe(17);expect(v.record.objections.some(o=>o.owner===owner&&o.status==='open'&&o.severity==='blocking')).toBe(true);expect(v.record.acceptedContributionIds).toEqual([]);expect(v.planningProposals!.production_director!.decision).toBe('approve');expect(v.provenance.newProviderCalls).toBe(0);expect(rebaseVerifiedContinuation(v,x.brief,'followup').retained).toHaveLength(count);expect(String(x.db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(x.runId)!.result_json)).toBe(before);});
 it('rejects a non-challenger blocker rather than skipping its owner',()=>{const x=approvedHeldDirector('staging_designer');expect(x.verify).toThrow();});
 it('rejects absent real usage',()=>{const x=approvedHeldDirector();writeFileSync(join(x.folder,'usage.json'),'{}');expect(x.verify).toThrow();});
});
describe('fresh indexed-body Director owner correction',()=>{
 it('retains all fourteen exact-input reviews and every call while requiring a fresh Director decision',()=>{
  const x=heldIndexedDirector(),before=String(x.db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(x.runId)!.result_json),v=x.verify();
  expect(v.resume.completedRoles).toHaveLength(14);expect(v.resume.failedRole).toBe('production_director');expect(v.resume.calls).toBe(16);expect(v.resume.inferenceCalls).toBe(16);expect(v.pendingEvidence).toBeUndefined();expect(v.provenance.receipts).toHaveLength(16);expect(v.planningProposals!.production_director!.summary).toContain('Only my own');expect(v.record.acceptedContributionIds).toEqual([]);expect(v.record.status).toBe('held');expect(v.provenance.newProviderCalls).toBe(0);
  const rebased=rebaseVerifiedContinuation(v,x.brief,'fresh-owner');expect(rebased.retained).toHaveLength(14);expect(rebased.resume.contributions.production_director!.decision).toBe('hold');expect(String(x.db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(x.runId)!.result_json)).toBe(before);
 });
 it.each(['alreadyFull','fullElsewhere','indexHash','missingUsage','countReset','changedOwner','accepted','substantive','newFinding','wrongStatus'])('rejects unsafe retained-owner correction: %s',kind=>{
  const x=heldIndexedDirector();
  if(['alreadyFull','fullElsewhere','indexHash'].includes(kind)){const own=x.packet.contributions.production_director,source=JSON.parse(String(x.db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(x.runId)!.result_json)).contributions.production_director.directions;if(kind==='alreadyFull')own.directions=source;if(kind==='fullElsewhere')x.packet.retrievedEvidence={own:{value:source}};if(kind==='indexHash')own.directionIndex[0].sha256='wrong';x.setPacket();}
  if(kind==='missingUsage')writeFileSync(join(x.folder,'usage.json'),'{}');
  if(kind==='wrongStatus')x.db.prepare("UPDATE production_runs SET status='approved' WHERE id=?").run(x.runId);
  if(['countReset','changedOwner','accepted','substantive','newFinding'].includes(kind)){const s=JSON.parse(String(x.db.prepare('SELECT result_json FROM production_runs WHERE id=?').get(x.runId)!.result_json));if(kind==='countReset')s.inferenceCalls=1;if(kind==='changedOwner')s.contributions.staging_designer.directions[0].instruction='Unreviewed alteration';if(kind==='accepted')s.productionRecord.acceptedContributionIds=['old'];if(kind==='substantive')s.contributions.production_director.generationRequests=[{unsupported:true}];if(kind==='newFinding')s.contributions.production_director.findings=[{unsupported:true}];x.db.prepare('UPDATE production_runs SET result_json=? WHERE id=?').run(JSON.stringify(s),x.runId);}
  expect(()=>x.verify()).toThrow();
 });
});
function advanced(){
 const x=chained(),parent=x.verify(),record=structuredClone(parent.record);record.revision='advanced';
 const part:CrewContribution={summary:'Final camera part',directions:[{shotId:'s2',instruction:'Final source view',scriptureBasis:'Source'}],findings:[]};
 x.native('cinematographer',1,{...part,directions:{s2:{instruction:'Final source view',scriptureBasis:'Source'}}},false,'advanced','s2');
 const camera=mergeShotTaskOutputs([...parent.tasks,part]);camera.exchange=saveContribution(record,x.brief,'cinematographer',1,camera,'planning');
 const contributions={...parent.resume.contributions,cinematographer:camera};
 x.native('choreographer',1,{summary:'Completed choreography part',directions:{s0:{instruction:'First source action',scriptureBasis:'Source'}},findings:[]},false,'advanced','s0');
 x.native('choreographer',2,null,true,'advanced','s1');
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('advanced:cinematographer:1','advanced',1,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(camera));
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('advanced:choreographer:1','advanced',2,'choreographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('advanced','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({status:'incomplete',calls:parent.resume.calls+2,inferenceCalls:parent.resume.inferenceCalls!+3,contributions,productionRecord:record}),null,3);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId:'advanced',originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls}),199);
 return{...x,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'advanced',x.media,[])};
}
function conflicted(){
 const x=fixture(),row=x.db.prepare("SELECT result_json FROM production_runs WHERE id='source'").get()!,saved=JSON.parse(String(row.result_json)),record=saved.productionRecord;
 record.revision='earlier';saveContribution(record,x.brief,'cinematographer',1,{summary:'Earlier planning issue',directions:[],findings:[{shotId:'s0',severity:'blocking',evidence:'Planning axis differs',requestedChange:'Resolve written scope and retain footage QC',confidence:90,limitations:'No actual footage'}]},'planning');record.revision='source';
 const issue=record.objections.at(-1)!.id;
 x.db.prepare("DELETE FROM edit_commands WHERE json_extract(payload,'$.eventId') LIKE 'source:cinematographer:%'").run();
 for(let i=0;i<3;i++)x.native('cinematographer',i+1,{summary:'Completed camera part',directions:{['s'+i]:{instruction:'Camera direction '+i,scriptureBasis:'Source'}},findings:[],objectionResponses:[{objectionId:issue,outcome:i===1?'resolved':'carried',rationale:'Original scope '+i,evidence:'Original evidence '+i}]},false,'source','s'+i);
 saved.inferenceCalls=5;x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='source'").run(JSON.stringify(saved));
 x.db.prepare("UPDATE production_events SET error='Conflicting objectionResponses across shot tasks; no implicit overwrite' WHERE role='cinematographer'").run();
 return{...x,issue};
}
function afterOwnerConsolidation(evidenceFirst=false){
 const x=conflicted(),parent=x.verify(),fresh=rebaseVerifiedContinuation(parent,x.brief,'owner');
 for(const [i,r]of fresh.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`owner:${r.role}:1`,'owner',i+1,r.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(r.output));
 const response={summary:'Explicit whole-role owner decision',directions:[],findings:[],objectionResponses:[{objectionId:x.issue,outcome:'carried' as const,rationale:'Written consistency remains distinct from footage verification',evidence:'No unseen footage was approved'}]};
 if(evidenceFirst)x.native('cinematographer',1,{summary:'Request exact source shot',directions:[],findings:[],contextRequests:['shot:s0']},false,'owner','s0','chapter-rollup',0);
 x.native('cinematographer',1,response,false,'owner','s0','chapter-rollup',evidenceFirst?1:0);
 const camera:CrewContribution={...response,directions:parent.tasks.flatMap(t=>t.directions)};camera.exchange=saveContribution(fresh.record,x.brief,'cinematographer',1,camera,'planning');
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('owner:cinematographer:1','owner',3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(camera));
 x.native('choreographer',1,{summary:'Next role part',directions:{s0:{instruction:'First action',scriptureBasis:'Source'}},findings:[]},false,'owner','s0');x.native('choreographer',2,null,true,'owner','s1');
 x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('owner:choreographer:1','owner',4,'choreographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
 x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('owner','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({status:'incomplete',calls:parent.resume.calls+2,inferenceCalls:parent.resume.inferenceCalls!+3+Number(evidenceFirst),contributions:{...fresh.resume.contributions,cinematographer:camera},productionRecord:fresh.record}),null,2);
 x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId:'owner',originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls,rebasedCompletedRoles:parent.resume.completedRoles}),199);
 return{...x,verify:()=>verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'owner',x.media,[])};
}
describe('verified complete-task response reconciliation',()=>{
 it('retains a receipted Director evidence request after an unsubmitted local follow-up hold without resetting attempts or rounds',()=>{
  const x=pendingDirectorEvidence(),before=String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='script'").get()!.result_json),v=x.verify();expect(v.resume.completedRoles).toHaveLength(14);expect(v.tasks).toHaveLength(3);expect(v.pendingEvidence).toEqual({role:'production_director',nextRound:1,refs:x.reply.contextRequests,originEventId:'script:production_director:1:chapter-rollup:task-1:evidence-0'});expect(v.provenance.pendingEvidence).toEqual(v.pendingEvidence);expect(v.provenance.newProviderCalls).toBe(0);expect(v.resume.inferenceCalls).toBe(JSON.parse(before).inferenceCalls);expect(String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='script'").get()!.result_json)).toBe(before);
 });
 it.each(['missingUsage','unknownFailure','partialCoverage','exhaustedRounds','unappliedFinalVerdict'])('rejects unsafe pending-evidence recovery (%s)',kind=>{
  const x=pendingDirectorEvidence();
  if(kind==='missingUsage')rmSync(join(x.folder,'usage.json'));
  else if(kind==='unknownFailure')x.db.prepare("UPDATE production_events SET error='Unknown failure' WHERE run_id='script' AND role='production_director'").run();
  else if(kind==='partialCoverage'){
   const p=join(x.root,'assets/preparation/crew-reasoning/p/script_production_director_1_chapter-detail_task-3_evidence-0/response.jsonl'),lines=readFileSync(p,'utf8').split('\n').map(l=>JSON.parse(l)),m=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(m.item.text);body.directions={s1:{instruction:'Duplicate task',scriptureBasis:'Source'}};m.item.text=JSON.stringify(body);writeFileSync(p,lines.map(l=>JSON.stringify(l)).join('\n'));
  }else{
   let extra=0;const add=(round:number,body:any)=>{x.native('production_director',1,body,false,'script','s0','chapter-rollup',round,crewSchema('production_director'));extra++;};
   if(kind==='exhaustedRounds'){add(1,x.reply);add(2,x.reply);}else{const{contextRequests,...final}=x.reply;add(1,{...final,summary:'Returned final verdict not applied'});}
   const saved=JSON.parse(String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='script'").get()!.result_json));saved.inferenceCalls+=extra;x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='script'").run(JSON.stringify(saved));
  }
  expect(x.verify).toThrow();
 });
 it.each(['decision','acceptedContributionIds','acceptanceChecks'])('rejects whole-chapter Director fields in a retained pure detail (%s)',key=>{
  const x=completedScriptDetails('production_director'),p=join(x.root,'assets/preparation/crew-reasoning/p/script_production_director_1_chapter-detail_task-3_evidence-0/response.jsonl'),lines=readFileSync(p,'utf8').split('\n').map(l=>JSON.parse(l)),m=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(m.item.text);body[key]=key==='decision'?'approve':key==='acceptedContributionIds'?[]:{status:'clear',evidence:'Unseen whole chapter'};m.item.text=JSON.stringify(body);writeFileSync(p,lines.map(l=>JSON.stringify(l)).join('\n'));expect(x.verify).toThrow();
 });
 it.each(['script_supervisor','sound_designer','composer','picture_editor','fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'])('retains all receipted %s detail coverage and exact prefix for mandatory whole-chapter review',role=>{
  const x=completedScriptDetails(role),before=String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='script'").get()!.result_json),v=x.verify();expect(v.resume.completedRoles).toHaveLength(7+['script_supervisor','sound_designer','composer','picture_editor','fidelity_challenger','clarity_challenger','feasibility_challenger','production_director'].indexOf(role));expect(v.resume.failedRole).toBe(role);expect(v.provenance.completedTaskShots).toEqual(['s0','s1','s2']);expect(v.reconcileResponses).toBe(true);expect(v.tasks).toHaveLength(3);expect(v.provenance.newProviderCalls).toBe(0);expect(String(x.db.prepare("SELECT result_json FROM production_runs WHERE id='script'").get()!.result_json)).toBe(before);
 });
 it.each(['sound_designer','composer','picture_editor'])('rejects executable recipes in retained pure %s detail',role=>{
  const x=completedScriptDetails(role),p=join(x.root,`assets/preparation/crew-reasoning/p/script_${role}_1_chapter-detail_task-3_evidence-0/response.jsonl`),lines=readFileSync(p,'utf8').split('\n').map(l=>JSON.parse(l)),m=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(m.item.text);body[role==='picture_editor'?'edits':'audioCues']=[{unreviewed:'executable recipe'}];m.item.text=JSON.stringify(body);writeFileSync(p,lines.map(l=>JSON.stringify(l)).join('\n'));expect(x.verify).toThrow();
 });
 it.each(['missingUsage','wrongCoverage','globalJudgment','unknownFailure'])('holds unsafe completed Script recovery (%s)',kind=>{
  const x=completedScriptDetails(),dir=join(x.root,'assets/preparation/crew-reasoning/p/script_script_supervisor_1_chapter-detail_task-3_evidence-0');
  if(kind==='missingUsage')rmSync(join(dir,'usage.json'));
  else if(kind==='unknownFailure')x.db.prepare("UPDATE production_events SET error='Unknown contract failure' WHERE run_id='script' AND role='script_supervisor'").run();
  else{const p=join(dir,'response.jsonl'),lines=readFileSync(p,'utf8').split('\n').map(l=>JSON.parse(l)),m=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(m.item.text);if(kind==='wrongCoverage')body.directions={s1:{instruction:'Wrong task',scriptureBasis:'Source'}};else body.decision='approve';m.item.text=JSON.stringify(body);writeFileSync(p,lines.map(l=>JSON.stringify(l)).join('\n'));}
  expect(x.verify).toThrow();
 });
 function nextRolePreflightHold(){
  const x=afterOwnerConsolidation();
  x.db.prepare("DELETE FROM edit_commands WHERE json_extract(payload,'$.eventId') LIKE 'owner:choreographer:%'").run();
  x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.inferenceCalls',6) WHERE id='owner'").run();
  x.db.prepare("UPDATE production_events SET error=? WHERE run_id='owner' AND role='choreographer'").run('Crew input held before submission: 497547 supplied text/schema UTF-8 bytes exceed 450000. Scope the review; no facts or objections were silently truncated. This is not a measured model-token count.');
  return x;
 }
 it.each(['bytes','transport'])('retains a fully verified prefix when the next role has no submitted task (%s)',kind=>{
  const x=nextRolePreflightHold();if(kind==='transport')x.db.prepare("UPDATE production_events SET error=? WHERE run_id='owner' AND role='choreographer'").run('Codex transport character limit exceeded before submission; split the task context.');
  const v=x.verify();expect(v.resume.completedRoles).toEqual(['creative_director','scripture_cultural_reviewer','cinematographer']);expect(v.resume.failedRole).toBe('choreographer');expect(v.tasks).toEqual([]);expect(v.reconcileResponses).toBe(false);expect(v.resume.inferenceCalls).toBe(6);expect(v.provenance.newProviderCalls).toBe(0);expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');
 });
 it.each(['unknownFailure','unaccountedSubmission'])('holds unverifiable empty next-role recovery (%s)',kind=>{
  const x=nextRolePreflightHold();if(kind==='unknownFailure')x.db.prepare("UPDATE production_events SET error='Codex request timed out' WHERE run_id='owner' AND role='choreographer'").run();else x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.inferenceCalls',7) WHERE id='owner'").run();expect(x.verify).toThrow();
 });
 function partialPreflightHold(){
  const x=fixture();
  x.db.prepare("DELETE FROM edit_commands WHERE json_extract(payload,'$.eventId')='source:cinematographer:1:task-2:evidence-0'").run();
  x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.inferenceCalls',3) WHERE id='source'").run();
  x.db.prepare("UPDATE production_events SET error=? WHERE role='cinematographer'").run('Crew input held before submission: 401963 supplied text/schema UTF-8 bytes exceed 400000. Scope the review; no facts or objections were silently truncated. This is not a measured model-token count.');
  return x;
 }
 it('retains receipted partial scope after an unsubmitted singleton text-budget hold',()=>{
  const x=partialPreflightHold(),v=x.verify();expect(v.provenance.completedTaskShots).toEqual(['s0']);expect(v.resume.inferenceCalls).toBe(3);expect(v.resume.calls).toBe(3);expect(v.provenance.newProviderCalls).toBe(0);
 });
 it.each(['notOverBudget','unsettledReceipt','invalidResult'])('holds unsafe scoped preflight recovery (%s)',kind=>{
  const x=partialPreflightHold();
  if(kind==='notOverBudget')x.db.prepare("UPDATE production_events SET error=replace(error,'401963','399000') WHERE role='cinematographer'").run();
  if(kind==='unsettledReceipt')x.db.prepare("DELETE FROM edit_commands WHERE command_type='complete_crew_reasoning' AND json_extract(payload,'$.eventId')='source:cinematographer:1:task-1:evidence-0'").run();
  if(kind==='invalidResult')writeFileSync(join(x.part,'response.jsonl'),JSON.stringify({type:'turn.failed'}));
  expect(x.verify).toThrow();
 });
 function completedAfterReconnect(outcome:'carried'|'resolved'='carried'){
  const x=conflicted(),schema=crewSchema('cinematographer'),body:any=Object.fromEntries(Object.keys(schema.properties).map(k=>[k,null]));
  Object.assign(body,{summary:'Actual completed whole-owner reply',directions:[],findings:[],objectionResponses:[{objectionId:x.issue,outcome,rationale:'Explicit complete-scope decision',evidence:'Every source shot reviewed'}]});
  const folder=x.native('cinematographer',1,body,false,'source','s0','chapter-rollup',0,schema),path=join(folder,'response.jsonl');
  const notices=[{type:'error',message:'Reconnecting... 2/5 (stream disconnected before completion: websocket closed by server before response.completed)'},{type:'item.completed',item:{type:'error',message:'Falling back from WebSockets to HTTPS transport. stream disconnected before completion: websocket closed by server before response.completed'}}];
  writeFileSync(path,notices.map(e=>JSON.stringify(e)).join('\n')+'\n'+readFileSync(path,'utf8'));rmSync(join(folder,'usage.json'));
  x.db.prepare("UPDATE edit_commands SET payload=json_set(payload,'$.resultAccepted',json('false')) WHERE command_type='complete_crew_reasoning' AND json_extract(payload,'$.eventId')='source:cinematographer:1:chapter-rollup:task-1:evidence-0'").run();
  const row=x.db.prepare("SELECT result_json FROM production_runs WHERE id='source'").get()!,saved=JSON.parse(String(row.result_json));saved.inferenceCalls=6;x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='source'").run(JSON.stringify(saved));
  x.db.prepare("UPDATE production_events SET error='Codex turn failed; no review or fallback was accepted.' WHERE role='cinematographer'").run();
  return{...x,path};
 }
 it('recovers the genuine completed owner reply without applying its outcomes or inventing usage',()=>{
  const x=completedAfterReconnect('resolved'),v=x.verify();expect(v.completedCameraReply!.directions).toHaveLength(3);expect(v.completedCameraReply!.objectionResponses![0]!.outcome).toBe('resolved');
  expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');expect(v.provenance.receipts.at(-1)!.completedStreamUsage!.inputTokens).toBe(20);expect(v.resume.inferenceCalls).toBe(6);expect(v.provenance.newProviderCalls).toBe(0);
 });
 it.each(['wrongParserFailure','unknownNotice','invalidSchema','foreignOwner'])('rejects unverifiable completed-stream recovery (%s)',kind=>{
  const x=completedAfterReconnect();
  if(kind==='wrongParserFailure')x.db.prepare("UPDATE production_events SET error='Different validation failure' WHERE role='cinematographer'").run();
  else{
   const lines=readFileSync(x.path,'utf8').split('\n').map(l=>JSON.parse(l));
   if(kind==='unknownNotice')lines[0].message='Unknown terminal error';
   else{const message=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(message.item.text);if(kind==='invalidSchema')body.summary=7;else body.objectionResponses[0].objectionId='source:scripture_cultural_reviewer:1:finding:0';message.item.text=JSON.stringify(body);}
   writeFileSync(x.path,lines.map(l=>JSON.stringify(l)).join('\n'));
  }
  expect(x.verify).toThrow();
 });
 it('revalidates a recovered camera reply committed normally before a later role interruption',()=>{
  const x=completedAfterReconnect('resolved'),parent=x.verify(),fresh=rebaseVerifiedContinuation(parent,x.brief,'recovered');
  for(const [i,r]of fresh.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`recovered:${r.role}:1`,'recovered',i+1,r.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(r.output));
  const camera=structuredClone(parent.completedCameraReply!);camera.exchange=saveContribution(fresh.record,x.brief,'cinematographer',1,camera,'planning',true);
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run('recovered:cinematographer:1','recovered',3,'cinematographer',1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(camera));
  x.native('choreographer',1,{summary:'Next role scope',directions:{s0:{instruction:'Source action',scriptureBasis:'Source'}},findings:[]},false,'recovered','s0');x.native('choreographer',2,null,true,'recovered','s1');
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('recovered:choreographer:1','recovered',4,'choreographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
  x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('recovered','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({status:'incomplete',calls:parent.resume.calls+2,inferenceCalls:parent.resume.inferenceCalls!+2,contributions:{...fresh.resume.contributions,cinematographer:camera},productionRecord:fresh.record}),null,2);
  x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId:'recovered',originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls,rebasedCompletedRoles:parent.resume.completedRoles}),199);
  const v=verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'recovered',x.media,[]);expect(v.resume.completedRoles).toContain('cinematographer');expect(v.resume.failedRole).toBe('choreographer');expect(v.resume.inferenceCalls).toBe(8);expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('resolved');
 });
 function partialDisposition(){
  const x=conflicted(),row=x.db.prepare("SELECT result_json FROM production_runs WHERE id='source'").get()!,saved=JSON.parse(String(row.result_json));
  x.db.prepare("DELETE FROM edit_commands WHERE json_extract(payload,'$.eventId') LIKE 'source:cinematographer:%'").run();
  x.native('cinematographer',1,{summary:'Completed pure scoped proposal',directions:{s0:{instruction:'Camera source plan',scriptureBasis:'Source'}},findings:[],objectionResponses:[{objectionId:x.issue,outcome:'resolved',rationale:'Original proposed resolution',evidence:'Inspected task scope'}]});
  x.native('cinematographer',2,null,true,'source','s1');
  rmSync(join(x.root,'assets/preparation/crew-reasoning/p/source_cinematographer_1_task-2_evidence-0/usage.json'));
  saved.inferenceCalls=4;x.db.prepare("UPDATE production_runs SET result_json=? WHERE id='source'").run(JSON.stringify(saved));
  x.db.prepare("UPDATE production_events SET error='Codex request timed out' WHERE role='cinematographer'").run();
  return x;
 }
 it('retains partial owned dispositions as unapplied proposals requiring full owner consolidation',()=>{
  const x=partialDisposition(),v=x.verify();expect(v.provenance.completedTaskShots).toEqual(['s0']);expect(v.reconcileResponses).toBe(true);
  expect(v.tasks[0]!.objectionResponses![0]!.outcome).toBe('resolved');expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');expect(v.resume.inferenceCalls).toBe(4);
 });
 it('retains completed remaining scope if mandatory owner consolidation times out without conflicting proposals',()=>{
  const x=partialDisposition(),parent=x.verify(),fresh=rebaseVerifiedContinuation(parent,x.brief,'partial-owner');
  for(const [i,r]of fresh.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`partial-owner:${r.role}:1`,'partial-owner',i+1,r.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(r.output));
  for(let i=1;i<3;i++)x.native('cinematographer',i,{summary:'Remaining pure scope',directions:{['s'+i]:{instruction:'Retain source camera',scriptureBasis:'Source'}},findings:[]},false,'partial-owner','s'+i);
  x.native('cinematographer',1,null,true,'partial-owner','s0','chapter-rollup');
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('partial-owner:cinematographer:1','partial-owner',3,'cinematographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
  x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('partial-owner','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({status:'incomplete',calls:parent.resume.calls+1,inferenceCalls:parent.resume.inferenceCalls!+3,contributions:fresh.resume.contributions,productionRecord:fresh.record}),null,2);
  x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId:'partial-owner',originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls,rebasedCompletedRoles:parent.resume.completedRoles}),199);
  const v=verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'partial-owner',x.media,[]);
  expect(v.reconcileResponses).toBe(true);expect(v.provenance.completedTaskShots).toEqual(['s0','s1','s2']);expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');expect(v.resume.inferenceCalls).toBe(7);
 });
 it.each(['foreignOwner','mutation'])('rejects unsafe partial dispositions (%s)',kind=>{
  const x=partialDisposition(),p=join(x.part,'response.jsonl'),lines=readFileSync(p,'utf8').split('\n').map(l=>JSON.parse(l)),message=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(message.item.text);
  if(kind==='foreignOwner')body.objectionResponses[0].objectionId='source:scripture_cultural_reviewer:1:finding:0';else body.ownerResponses=[{contributionId:'foreign',decision:'accept',rationale:'Not pure'}];
  message.item.text=JSON.stringify(body);writeFileSync(p,lines.map(l=>JSON.stringify(l)).join('\n'));expect(x.verify).toThrow();
 });
 it.each(['Crew input held before submission: 1048582 supplied text/schema UTF-8 bytes exceed 1000000. Scope the review; no facts or objections were silently truncated. This is not a measured model-token count.','Codex transport character limit exceeded before submission; split the task context.'])('retains complete receipted conflicting tasks after a local consolidation rejection (%s)',error=>{
  const x=conflicted();
  x.db.prepare("UPDATE production_events SET error=? WHERE role='cinematographer'").run(error);
  const v=x.verify();expect(v.reconcileResponses).toBe(true);expect(v.provenance.completedTaskShots).toEqual(['s0','s1','s2']);expect(v.resume.inferenceCalls).toBe(5);expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');
 });
 it.each(['unknown failure','Crew input held before submission: 900 supplied text/schema UTF-8 bytes exceed 1000. Scope the review; no facts or objections were silently truncated. This is not a measured model-token count.'])('rejects an unverifiable consolidation hold (%s)',error=>{
  const x=conflicted();x.db.prepare("UPDATE production_events SET error=? WHERE role='cinematographer'").run(error);expect(x.verify).toThrow();
 });
 it('does not mistake an incomplete technical pass for a completed consolidation budget hold',()=>{
  const x=advanced();x.db.prepare("UPDATE production_events SET error=? WHERE run_id='advanced' AND role='choreographer'").run('Crew input held before submission: 1048582 supplied text/schema UTF-8 bytes exceed 1000000. Scope the review; no facts or objections were silently truncated. This is not a measured model-token count.');expect(x.verify).toThrow();
 });
 it('retains every complete native task and conflicting response for owner consolidation without applying either outcome',()=>{
  const x=conflicted(),v=x.verify();expect(v.reconcileResponses).toBe(true);expect(v.provenance.completedTaskShots).toEqual(['s0','s1','s2']);expect(v.resume.calls).toBe(3);expect(v.resume.inferenceCalls).toBe(5);expect(v.tasks.flatMap(t=>t.objectionResponses!.map(r=>r.outcome))).toEqual(['carried','resolved','carried']);expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');
 });
 it.each(['wrongFailure','noConflict','foreignOwner','missingUsage'])('rejects unverifiable complete-task recovery (%s)',kind=>{
  const x=conflicted();
  if(kind==='wrongFailure')x.db.prepare("UPDATE production_events SET error='Conflicting directions' WHERE role='cinematographer'").run();
  const p=join(x.root,'assets/preparation/crew-reasoning/p/source_cinematographer_1_task-2_evidence-0');
  if(kind==='noConflict'||kind==='foreignOwner'){
   const path=join(p,'response.jsonl'),lines=readFileSync(path,'utf8').split('\n').map(l=>JSON.parse(l)),message=lines.find(e=>e.item?.type==='agent_message')!,body=JSON.parse(message.item.text);
   if(kind==='noConflict')body.objectionResponses[0].outcome='carried';else body.objectionResponses[0].objectionId='source:scripture_cultural_reviewer:1:finding:0';message.item.text=JSON.stringify(body);writeFileSync(path,lines.map(l=>JSON.stringify(l)).join('\n'));
  }
  if(kind==='missingUsage')rmSync(join(p,'usage.json'));
  expect(x.verify).toThrow();
 });
 it.each([false,true])('replays an actual completed owner consolidation and its evidence requests before retaining later-role work (%s)',evidenceFirst=>{
  const x=afterOwnerConsolidation(evidenceFirst),v=x.verify();expect(v.resume.completedRoles).toContain('cinematographer');expect(v.resume.failedRole).toBe('choreographer');expect(v.resume.calls).toBe(5);expect(v.resume.inferenceCalls).toBe(evidenceFirst?9:8);expect(v.tasks.flatMap(t=>t.directions.map(d=>d.shotId))).toEqual(['s0']);expect(v.record.objections.find(o=>o.id===x.issue)!.status).toBe('open');expect(v.resume.contributions.cinematographer!.objectionResponses![0]!.outcome).toBe('carried');
 });
});
describe('verified initial technical-role continuation',()=>{
 it.each(['changedNativeProposal','clearedConcerns','changedPrefix','wrongRole','falseModel'])('rejects changes to completed roles or retained issue state (%s)',kind=>{
  const x=advanced();
  if(kind==='changedNativeProposal'){
   const row=x.db.prepare("SELECT output_json FROM production_events WHERE run_id='advanced' AND role='cinematographer'").get()!,o=JSON.parse(String(row.output_json));o.directions[0].instruction='Unreceipted replacement';
   x.db.prepare("UPDATE production_events SET output_json=? WHERE run_id='advanced' AND role='cinematographer'").run(JSON.stringify(o));x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.contributions.cinematographer',json(?)) WHERE id='advanced'").run(JSON.stringify(o));
  }
  if(kind==='clearedConcerns')x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.productionRecord.objections',json('[]')) WHERE id='advanced'").run();
  if(kind==='changedPrefix')x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.contributions.creative_director.summary','Changed') WHERE id='advanced'").run();
  if(kind==='wrongRole')x.db.prepare("UPDATE production_events SET role='lighting_designer' WHERE run_id='advanced' AND error IS NOT NULL").run();
  if(kind==='falseModel')x.db.prepare("UPDATE production_events SET model='codex_cli:retained:gpt-6.1-sol' WHERE run_id='advanced' AND role='cinematographer'").run();
  expect(x.verify).toThrow();
 });
 it('advances past a completed camera role, preserving the actual remaining choreography task and all counts',()=>{
  const x=advanced(),v=x.verify();expect(v.resume.completedRoles).toEqual(['creative_director','scripture_cultural_reviewer','cinematographer']);expect(v.resume.failedRole).toBe('choreographer');expect(v.resume.calls).toBe(6);expect(v.resume.inferenceCalls).toBe(9);expect(v.tasks.flatMap(t=>t.directions.map(d=>d.shotId))).toEqual(['s0']);expect(v.resume.contributions.cinematographer!.directions).toHaveLength(3);
  expect(()=>verifyInitialCameraContinuation(x.db,x.root,'p',x.brief,'advanced',x.media,[])).toThrow();
 });
 it('makes verified proposals selectable in the current revision while retaining blocking concerns and original evidence',()=>{
  const x=advanced(),verified=x.verify(),original=JSON.stringify(verified),fresh=rebaseVerifiedContinuation(verified,x.brief,'fresh');
  expect(JSON.stringify(verified)).toBe(original);expect(fresh.resume.calls).toBe(6);expect(fresh.resume.inferenceCalls).toBe(9);
  expect(fresh.record.objections).toEqual(verified.record.objections);expect(fresh.record.history.slice(0,verified.record.history.length)).toEqual(verified.record.history);
  const ids=fresh.retained.map(r=>r.output.exchange![0]!.id);expect(ids).toEqual(['fresh:creative_director:1','fresh:scripture_cultural_reviewer:1','fresh:cinematographer:1']);
  const director:CrewContribution={summary:'Fixture director',directions:[],findings:[],acceptedContributionIds:ids};saveContribution(fresh.record,x.brief,'production_director',1,director,'planning');
  expect(()=>acceptProductionRecord(fresh.record,director)).toThrow('blocking');
  // Isolate current-ID selection with a fixture owner resolution; live source
  // concerns are never cleared by rebaseVerifiedContinuation.
  for(const issue of fresh.record.objections){issue.status='resolved';issue.resolutionId='fixture-owner-review';}
  expect(()=>acceptProductionRecord(fresh.record,director)).not.toThrow();expect(fresh.record.acceptedContributionIds).toEqual(ids);
 });
 it('verifies another timeout after retained-prefix events were truthfully rebased without counting them as inference',()=>{
  const x=advanced(),parent=x.verify(),fresh=rebaseVerifiedContinuation(parent,x.brief,'rebased');
  for(const [i,r]of fresh.retained.entries())x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,?,NULL)').run(`rebased:${r.role}:1`,'rebased',i+1,r.role,1,'codex_cli:retained:gpt-6.1-sol',JSON.stringify(r.output));
  x.native('choreographer',1,{summary:'Second choreography part',directions:{s1:{instruction:'Second source action',scriptureBasis:'Source'}},findings:[]},false,'rebased','s1');x.native('choreographer',2,null,true,'rebased','s2');
  x.db.prepare('INSERT INTO production_events VALUES(?,?,?,?,?,?,NULL,?)').run('rebased:choreographer:1','rebased',4,'choreographer',1,'codex_cli:requested:gpt-6.1-sol','Codex request timed out');
  x.db.prepare('INSERT INTO production_runs VALUES(?,?,?,?,?,?,?,?,?)').run('rebased','p','planning',x.hash,JSON.stringify(x.brief),'incomplete',JSON.stringify({status:'incomplete',calls:parent.resume.calls+1,inferenceCalls:parent.resume.inferenceCalls!+2,contributions:fresh.resume.contributions,productionRecord:fresh.record}),null,4);
  x.db.prepare('INSERT INTO edit_commands VALUES(?,?,?,?)').run('p','resume_crew_first_pass',JSON.stringify({...parent.provenance,runId:'rebased',originalCalls:parent.resume.calls,originalInferenceCalls:parent.resume.inferenceCalls,rebasedCompletedRoles:parent.resume.completedRoles}),299);
  const result=verifyInitialSpecialistContinuation(x.db,x.root,'p',x.brief,'rebased',x.media,[]);expect(result.resume.calls).toBe(7);expect(result.resume.inferenceCalls).toBe(11);expect(result.tasks.flatMap(t=>t.directions.map(d=>d.shotId))).toEqual(['s0','s1']);
 });
 it.each(['request','budget'])('persists retained current proposals without resetting original counts through the normal store runner (%s)',async(kind)=>{
  const x=advanced(),before=x.db.prepare("SELECT COUNT(*) n FROM edit_commands WHERE command_type='submit_crew_reasoning'").get()!.n;
  x.db.exec('ALTER TABLE production_runs ADD COLUMN completed_at INTEGER;ALTER TABLE production_events ADD COLUMN prompt TEXT;ALTER TABLE production_events ADD COLUMN cost_usd REAL;ALTER TABLE production_events ADD COLUMN created_at INTEGER;ALTER TABLE edit_commands ADD COLUMN id TEXT;ALTER TABLE edit_commands ADD COLUMN idempotency_key TEXT;ALTER TABLE edit_commands ADD COLUMN applied_at INTEGER;CREATE TABLE projects(id TEXT,language TEXT,book TEXT,chapter INTEGER);');
  const hook=vi.fn(async(_request:{eventId:string;role:string})=>{throw Error('OFFLINE_NEXT_ROLE_SENTINEL');});
  const result=await runProductionCrew('p','planning',{db:x.db,dataDir:x.root,brief:x.brief,media:x.media,reasoningProvider:'codex',scopedContext:true,maxCalls:kind==='request'?33:0,maxInferenceCalls:30,resumeFirstPassRunId:'advanced',maxShotTaskSize:32,resumeFailedRoleTaskSize:1,beforeModelRequest:hook});
  if(kind==='request'){expect(result.summary).toContain('OFFLINE_NEXT_ROLE_SENTINEL');expect(hook).toHaveBeenCalledTimes(1);expect(hook.mock.calls[0]![0]).toMatchObject({role:'choreographer'});expect(result.calls).toBe(7);}
  else{expect(result.summary).toContain('Call budget');expect(hook).not.toHaveBeenCalled();expect(result.calls).toBe(6);expect(result.inferenceCalls).toBe(9);}
  const rows=x.db.prepare('SELECT role,model,error FROM production_events WHERE run_id=? ORDER BY sequence').all(result.runId);expect(rows).toHaveLength(kind==='request'?4:3);expect(rows.slice(0,3).every(r=>r.model==='codex_cli:retained:gpt-6.1-sol'&&!r.error)).toBe(true);
  expect(x.db.prepare("SELECT COUNT(*) n FROM edit_commands WHERE command_type='submit_crew_reasoning'").get()!.n).toBe(before);expect(result.productionRecord!.objections).toHaveLength(1);
  for(const role of ['creative_director','scripture_cultural_reviewer','cinematographer'] as const)expect(result.contributions[role]!.exchange![0]!.id).toBe(`${result.runId}:${role}:1`);
 });
});
describe('store verified initial Camera continuation',()=>{
 it('follows actual immutable continuation provenance across another timeout without repeating either completed part or resetting counts',()=>{
  const x=chained(),result=x.verify();expect(result.tasks.flatMap(t=>t.directions.map(d=>d.shotId))).toEqual(['s0','s1']);expect(result.resume.calls).toBe(4);expect(result.resume.inferenceCalls).toBe(6);expect(result.provenance.receipts).toHaveLength(6);expect(result.record.acceptedContributionIds).toEqual([]);expect(result.resume.contributions.scripture_cultural_reviewer!.findings).toHaveLength(1);
 });
 it.each(['parentHash','cycle','changedRecord','lostCounts','missingAudit','overlap'])('rejects invalid chained provenance (%s)',kind=>{
  const x=chained();
  if(kind==='parentHash')x.db.prepare("UPDATE edit_commands SET payload=json_set(payload,'$.sourceResultSha256','changed') WHERE command_type='resume_crew_first_pass'").run();
  if(kind==='cycle')x.db.prepare("UPDATE edit_commands SET payload=json_set(payload,'$.sourceRunId','child') WHERE command_type='resume_crew_first_pass'").run();
  if(kind==='changedRecord')x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.productionRecord.inputRevision','changed') WHERE id='child'").run();
  if(kind==='lostCounts')x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.calls',3) WHERE id='child'").run();
  if(kind==='missingAudit')x.db.prepare("DELETE FROM edit_commands WHERE command_type='resume_crew_first_pass'").run();
  if(kind==='overlap'){
   const f=join(x.root,'assets/preparation/crew-reasoning/p/child_cinematographer_1_task-1_evidence-0'),p=join(f,'response.jsonl');
   const stream=readFileSync(p,'utf8').replace('s1','s0');writeFileSync(p,stream);
  }
  expect(x.verify).toThrow();
 });
 it('preserves the exact concern-bearing prefix, record and failed request count without new inference or acceptance',()=>{
  const x=fixture(),before=x.db.prepare('SELECT * FROM production_runs').all(),result=x.verify();
  expect(result.resume.calls).toBe(3);expect(result.resume.inferenceCalls).toBe(4);expect(result.tasks.flatMap(t=>t.directions.map(d=>d.shotId))).toEqual(['s0']);
  expect(result.resume.contributions.scripture_cultural_reviewer!.treatmentReview!.status).toBe('concern');expect(result.record.objections.some(o=>o.status==='open')).toBe(true);expect(result.record.acceptedContributionIds).toEqual([]);expect(x.db.prepare('SELECT * FROM production_runs').all()).toEqual(before);
 });
 it.each(['source','media','caption','running','worker','count','event','usage','failedResult','pending'])('rejects changed or uncertain evidence (%s)',kind=>{
  const x=fixture();
  if(kind==='source')x.brief.source.text[0]!.text='Changed';if(kind==='media')x.media[0]!.data=Buffer.from('changed').toString('base64');if(kind==='caption')x.media[0]!.caption='Changed';
  if(kind==='running')x.db.prepare("UPDATE production_runs SET status='running'").run();if(kind==='worker')x.db.prepare('UPDATE production_runs SET worker_pid=?').run(process.pid);
  if(kind==='count')x.db.prepare("UPDATE production_runs SET result_json=json_set(result_json,'$.inferenceCalls',3)").run();if(kind==='event')x.db.prepare("UPDATE production_events SET model='unreported' WHERE role='creative_director'").run();
  if(kind==='usage'){const p=join(x.part,'usage.json'),u=JSON.parse(readFileSync(p,'utf8'));u.inputSha256='changed';writeFileSync(p,JSON.stringify(u));}
  if(kind==='failedResult')writeFileSync(join(x.failed,'response.jsonl'),JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}}));
  if(kind==='pending')x.db.prepare("DELETE FROM edit_commands WHERE command_type='complete_crew_reasoning' AND json_extract(payload,'$.eventId') LIKE '%task-2%'").run();
  expect(x.verify).toThrow();
 });
});
