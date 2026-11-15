// Operational handoff only: run AFTER the known worker has stopped at a
// no-inference boundary. Never kills a process or submits a model request.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
import {recoverInterruptedCrew,retainedInitialCreativeProposal,retainedInitialScriptureProposal,retainedInitialCameraProposal,retainedInitialChoreographyProposal,retainedInitialStagingProposal,retainedInitialCostumeProposal,retainedInitialLightingProposal,retainedInitialPlanningDirectionProposals} from '../../src/pipeline/creative-direction/crew-store.js';
import type {CrewResult,CrewRole} from '../../src/pipeline/creative-direction/crew-types.js';
const root='outputs/mark6-production',runId='298a1ce7-8f2b-4d30-bab8-40abd55a3692',projectId='c457a815-d07d-4902-91b5-7b936b549856';
const read=(name:string)=>JSON.parse(readFileSync(`${root}/${name}`,'utf8'));
const db=getDb(),data=getDataDir();
const run=db.prepare('SELECT status,worker_pid FROM production_runs WHERE id=? AND project_id=?').get(runId,projectId)!;
if(!run)throw Error('Expected known Mark6 worker');
try{process.kill(Number(run.worker_pid),0);throw Error('Known worker is still alive; do not recover');}
catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
if(existsSync(`${root}/allowance-permit.json`))throw Error('Unconsumed permit must be reconciled first');
const pending=existsSync(`${root}/allowance-pending.json`)?read('allowance-pending.json'):undefined;
if(run.status==='running'){
 if(!pending?.eventId?.startsWith(`${runId}:`)||pending.eventId.split(':')[2]!=='2')throw Error('Expected explicit round2 local permit boundary');
 const state=read('bounded-resume-20261104.json');
 if(state.reservations.some((r:{id:string})=>r.id===pending.eventId))throw Error('Boundary request was reserved; reconcile actual submission first');
 recoverInterruptedCrew(db,projectId,runId);
}
const brief=loadCrewBrief(db,data,projectId,'planning'),prefix:Partial<CrewResult['contributions']>={};
prefix.creative_director=retainedInitialCreativeProposal(db,data,projectId,brief,'b66c122d-7722-436b-bab7-a09f4091159f').reply;
prefix.scripture_cultural_reviewer=retainedInitialScriptureProposal(db,projectId,brief,'4511c6c3-f3cb-4a7f-8b65-936dc9fdac8e',prefix.creative_director).reply;
prefix.cinematographer=retainedInitialCameraProposal(db,data,projectId,brief,'844299e7-6367-4c90-906b-d051bada1dd0',prefix.creative_director,prefix.scripture_cultural_reviewer).reply;
prefix.choreographer=retainedInitialChoreographyProposal(db,projectId,brief,'7181d4c9-606c-46b1-b482-0976d204d3e6',prefix.creative_director,prefix.scripture_cultural_reviewer,prefix.cinematographer).reply;
prefix.staging_designer=retainedInitialStagingProposal(db,data,projectId,brief,'9298c395-6570-444d-8b08-71244b1c8fc1',prefix).reply;
prefix.costume_designer=retainedInitialCostumeProposal(db,projectId,brief,'5eeda48e-84a7-4e78-bb5d-fc727134d46c',prefix).reply;
prefix.lighting_designer=retainedInitialLightingProposal(db,projectId,brief,'25ed817f-cae7-4a39-86af-8ce9429295e7',prefix).reply;
const sourceRunIds:Partial<Record<CrewRole,string>>={script_supervisor:'dbd6b9cb-ca53-4033-9f6f-adbb14996c42',sound_designer:runId,composer:runId,picture_editor:runId};
const additional=retainedInitialPlanningDirectionProposals(db,projectId,brief,sourceRunIds,prefix);
if(Object.keys(additional).length!==4)throw Error('All four additional original roles required');
const proof={status:'verified_original_initial_directions_not_fresh_image_review',at:new Date().toISOString(),sourceRunIds,verifiedRoles:[...Object.keys(prefix),...Object.keys(additional)],provenance:Object.fromEntries(Object.entries(additional).map(([k,v])=>[k,v!.provenance])),newProviderCalls:0,limitation:'Original directions and every finding retained. Fresh critics, owners and Director must review actual supplemental images through normal checks.'};
writeFileSync(`${root}/reference-handoff-prefix-proof-20261105.json`,JSON.stringify(proof,null,2));
writeFileSync(`${root}/retained-additional-initial-directions-20261105.json`,JSON.stringify({status:'requires_exact_brief_and_complete_upstream_prefix_verification',sourceRunIds,newProviderCalls:0,limitation:proof.limitation},null,2));
console.log(JSON.stringify({verifiedRoles:proof.verifiedRoles,newProviderCalls:0}));
