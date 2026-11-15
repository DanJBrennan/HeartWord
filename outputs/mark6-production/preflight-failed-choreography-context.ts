import {writeFileSync} from 'node:fs';
import {getDb} from '../../src/db/client.js';
import {dispatchCrewTask} from '../../src/pipeline/creative-direction/crew-tasks.js';
import {crewSchema,validateContribution} from '../../src/pipeline/creative-direction/crew.js';
const db=getDb(),runId='163b7760-a2ff-424e-9d1d-b8e7d6fab397';
const run=db.prepare('SELECT * FROM production_runs WHERE id=?').get(runId)!;
if(run.status!=='incomplete')throw Error('Only the terminal failed run may be inspected');
const brief=JSON.parse(String(run.brief_json)),result=JSON.parse(String(run.result_json));
const failed=db.prepare("SELECT * FROM production_events WHERE run_id=? AND role='choreographer' AND error IS NOT NULL").get(runId)!;
let requestBytes=0;
try{
 await dispatchCrewTask({prompt:String(failed.prompt),schema:crewSchema('choreographer','planning',false,true),media:[],role:'choreographer',phase:'planning',brief,contributions:result.contributions,record:result.productionRecord,
 specialistBytes:200000,chapterBytes:600000,onRequest:p=>{requestBytes=Buffer.byteLength(p)},validate:raw=>validateContribution(raw,'choreographer',brief),
 call:async()=>{throw Error('OFFLINE_PREFLIGHT_REACHED_SUBMISSION_NO_PROVIDER_CALL')}});
 throw Error('Preflight unexpectedly completed a contribution');
}catch(error){if((error as Error).message!=='OFFLINE_PREFLIGHT_REACHED_SUBMISSION_NO_PROVIDER_CALL')throw error;}
const value={status:'r23_failed_input_now_reaches_submission_within_original_byte_guard',runId,previousFailure:failed.error,requestPromptBytes:requestBytes,successfulSavedRoles:Object.keys(result.contributions),providerCalls:0,acceptedContribution:false,limitsUnchanged:true};
writeFileSync('outputs/mark6-production/choreography-context-preflight-r23.json',JSON.stringify(value,null,2));console.log(JSON.stringify(value));
