import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {retainedInitialPlanningDirectionProposals} from '../../src/pipeline/creative-direction/crew-store.js';
import {crewBriefHash} from '../../src/pipeline/creative-direction/crew-context.js';
import {executableProductionRolesFor} from '../../src/pipeline/creative-direction/role-registry.js';
import {runCrew} from '../../src/pipeline/creative-direction/crew.js';
import {newProductionRecord} from '../../src/pipeline/creative-direction/production-record.js';
import type {CrewBrief,CrewContribution,CrewRole} from '../../src/pipeline/creative-direction/crew-types.js';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const databases:InstanceType<typeof DatabaseSync>[]=[];afterEach(()=>{for(const db of databases.splice(0))db.close();});
function fixture(){
 const brief:CrewBrief={project:{id:'p',language:'hatam',book:'mark',chapter:6},source:{text:[{verse:1,text:'Exact source'}],reference:[{verse:1,text:'English reference'}],hashes:['source-hash']},audio:[],canon:[],shots:[{id:'s',sceneId:'scene',sceneSequence:1,sequence:1,verseRef:'Mark 6:1',action:'Source action',framing:'medium',cameraMovement:'static',continuity:'Retain state',lighting:'day',needsLipSync:false,characterIds:[],dialogueCharacterId:null,beats:[],clip:null}],producerNotes:[],audioAssets:[],spentUsd:0};
 const direction={shotId:'s',instruction:'Retain source action',scriptureBasis:'Exact source'},reply:CrewContribution={summary:'Original completed review',directions:[direction],findings:[{shotId:'s',severity:'blocking',evidence:'Body reference missing',requestedChange:'Owner supplies matching reference',confidence:90,limitations:'Planning only'}]};
 const roles=executableProductionRolesFor('planning').filter(r=>r!=='production_director') as CrewRole[];
 const prefix=Object.fromEntries(roles.slice(0,roles.indexOf('script_supervisor')).map(role=>[role,{summary:'Verified upstream proposal',directions:[direction],findings:[]}])) as Partial<Record<CrewRole,CrewContribution>>;
 const db=new DatabaseSync(':memory:');databases.push(db);
 db.exec('CREATE TABLE production_runs(id TEXT,project_id TEXT,phase TEXT,brief_hash TEXT,brief_json TEXT,status TEXT);CREATE TABLE production_events(id TEXT,run_id TEXT,role TEXT,round INTEGER,model TEXT,output_json TEXT,error TEXT);');
 db.prepare('INSERT INTO production_runs VALUES (?,?,?,?,?,?)').run('source','p','planning',crewBriefHash(brief,'planning'),JSON.stringify(brief),'incomplete');
 for(const [role,output]of Object.entries({...prefix,script_supervisor:reply}))db.prepare('INSERT INTO production_events VALUES (?,?,?,?,?,?,NULL)').run('source:'+role+':1','source',role,1,'codex_cli:requested:gpt-6.1-sol',JSON.stringify(output));
 return{db,brief,prefix,reply};
}
describe('exact initial direction-prefix recovery',()=>{
 it('retains the actual complete review and every finding without writing approval or repeating inference',()=>{
  const x=fixture(),before=x.db.prepare('SELECT * FROM production_events').all();
  const result=retainedInitialPlanningDirectionProposals(x.db,'p',x.brief,{script_supervisor:'source'},x.prefix);
  expect(result.script_supervisor!.reply).toEqual(x.reply);expect(result.script_supervisor!.provenance.newProviderCalls).toBe(0);
  expect(result.script_supervisor!.provenance.sourceEventId).toBe('source:script_supervisor:1');
  expect(x.db.prepare('SELECT * FROM production_events').all()).toEqual(before);
 });
 it.each(['source','upstream','missing','running','model','coverage','mutation','director'])('rejects changed or ineligible recovery evidence (%s)',kind=>{
  const x=fixture();let ids:Partial<Record<CrewRole,string>>={script_supervisor:'source'};
  if(kind==='source')x.brief.source.text[0]!.text='Changed source';
  if(kind==='upstream')x.prefix.lighting_designer={...x.prefix.lighting_designer!,summary:'Changed upstream proposal'};
  if(kind==='missing')delete x.prefix.lighting_designer;
  if(kind==='running')x.db.prepare("UPDATE production_runs SET status='running'").run();
  if(kind==='model')x.db.prepare("UPDATE production_events SET model='caller_supplied_unreported' WHERE role='script_supervisor'").run();
  if(kind==='coverage')x.db.prepare("UPDATE production_events SET output_json=? WHERE role='script_supervisor'").run(JSON.stringify({...x.reply,directions:[]}));
  if(kind==='mutation')x.db.prepare("UPDATE production_events SET output_json=? WHERE role='script_supervisor'").run(JSON.stringify({...x.reply,edits:[{shotId:'s',sourceStartMs:0,durationMs:1}]}));
  if(kind==='director')ids={production_director:'source'};
  expect(()=>retainedInitialPlanningDirectionProposals(x.db,'p',x.brief,ids,x.prefix)).toThrow();
 });
 it('rebases the retained review through normal checks and stops at the next actual role call',async()=>{
  const x=fixture(),p=x.prefix;
  p.creative_director={...p.creative_director!,emotionalTreatment:{version:1,progression:'One source-grounded beat',beats:[{id:'b1',shotIds:['s'],sourceTrigger:{verseRef:'Mark 6:1',textKind:'source',quote:'Exact source'},audienceExperience:'Attention',characterResponse:'Listening',intensity:'Restrained',filmableMeans:'Source action',progression:'Opening to end',limitations:'Fixture only'}],pauses:[],cues:[]}};
  p.scripture_cultural_reviewer={...p.scripture_cultural_reviewer!,treatmentReview:{status:'clear',evidence:'Exact source matched',requestedChange:'Retain source',confidence:90,limitations:'Fixture'}};
  const call=vi.fn(async()=>{throw Error('Next role sentinel');}),record=newProductionRecord(x.brief,'new-run','new-hash');
  const result=await runCrew({phase:'planning',brief:x.brief,productionRecord:record,call,log:()=>{},retainedInitialCreativeReply:p.creative_director,retainedInitialScriptureReply:p.scripture_cultural_reviewer,retainedInitialCameraReply:p.cinematographer,retainedInitialChoreographyReply:p.choreographer,retainedInitialStagingReply:p.staging_designer,retainedInitialCostumeReply:p.costume_designer,retainedInitialLightingReply:p.lighting_designer,retainedInitialPlanningReplies:{script_supervisor:x.reply}});
  expect(result.summary).toContain('Next role sentinel');expect(call).toHaveBeenCalledTimes(1);expect(result.summary).toContain('sound_designer');
  expect(result.contributions.script_supervisor!.findings).toEqual(x.reply.findings);
  expect(result.contributions.script_supervisor!.exchange![0]!.inputRevision).toBe(record.inputRevision);
  expect(result.contributions.script_supervisor!.exchange![0]!.id).toBe('new-run:script_supervisor:1');expect(result.productionRecord!.acceptedContributionIds).toEqual([]);
 });
});
