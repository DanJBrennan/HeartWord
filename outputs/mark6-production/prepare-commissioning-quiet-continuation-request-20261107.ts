import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
const db=getDb(),project='c457a815-d07d-4902-91b5-7b936b549856',shot='2408a829-dba4-43d6-89d3-09b02d9b77a0',folder='outputs/mark6-production/native-motion/scene2-shot1-commissioning-quiet-continuation-v1';
try{const plan=requireCurrentPlan(db,getDataDir(),project),e=JSON.parse(readFileSync(folder+'/continuity-frame-extraction.json','utf8')),review=JSON.parse(readFileSync(folder+'/continuity-frame-review.json','utf8'));
if(review.sourceFrame!==71||e.sourceAttemptId!=='4586bbd6-4ef0-41d4-ae06-66163302494f')throw Error('Wrong reviewed parent');
const before=crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning'),id=randomUUID(),reason='Shared Mark6:7 source98679–116189ms requires17.510s moving picture. Only the reviewed quiet raw168–239 range3s is selected; original collective-bow parent remains held. Remaining source14.510s. Request5s same upright quiet gathering from ACTUAL last selected native frame71(original239); planned10s Peter/Andrew medium supplies other coverage if actual motion passes. Exactly13original people, eyes at teacher-eye level and heads upright, original staff/clothes/set/daylight; tiny independent breathing/blinks and leaves/cloth naturally move. No synchronized bow, new words, authority ritual, departure, loop/freeze/slowmotion or invented source boundary. Preserve selected3s, all rejected history, and every source sample; requested durations are not proof of returned usable coverage.';
db.exec('BEGIN IMMEDIATE');
const pin={kind:'same_approved_action',runId:plan.id,briefHash:before,acceptedAttemptId:e.sourceAttemptId,reason};
db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(id,project,shot,'Production Director approved source coverage v1:'+JSON.stringify(pin),Date.now());
if(crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning')!==before)throw Error('Extension note changed planning brief');
writeFileSync(folder+'/additional-coverage-request.json',JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,shotId:shot,acceptedAttemptId:e.sourceAttemptId,requestNoteId:id,reason,planningBriefHash:before,providerCalls:0},null,2),{flag:'wx'});db.exec('COMMIT');console.log(JSON.stringify({requestNoteId:id,planningBriefHash:before}));}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
