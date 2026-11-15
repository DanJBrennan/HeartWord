import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
const db=getDb(),project='c457a815-d07d-4902-91b5-7b936b549856',shot='72f96eff-3aab-4786-ba4d-89c03539e160',folder='outputs/mark6-production/native-motion/scene1-shot3-continued-teaching-take2-v1';
try{const plan=requireCurrentPlan(db,getDataDir(),project),e=JSON.parse(readFileSync(folder+'/continuity-frame-extraction.json','utf8')),review=JSON.parse(readFileSync(folder+'/continuity-frame-review.json','utf8'));
if(review.sourceFrame!==47||e.sourceAttemptId!=='cc0b364a-d2ca-4f50-852f-b793618429df')throw Error('Wrong reviewed parent');
const before=crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning'),id=randomUUID(),reason='Source0–30789ms needs30.789s actual moving coverage; available firstfour shots total12s, deficit18.789s. First10s candidate continues already-approved back-view Sabbath teaching from actual last selected parentframe47, mouth unseen, same ten actors, quiet attention. Preserve existing2s distinct take, no freeze/loop/slowdown/new internal Hatam boundary/pause. Fullactual newmotion review required; remainder staysopen.';
db.exec('BEGIN IMMEDIATE');
const pin={kind:'same_approved_action',runId:plan.id,briefHash:before,acceptedAttemptId:e.sourceAttemptId,reason};
db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(id,project,shot,'Production Director approved source coverage v1:'+JSON.stringify(pin),Date.now());
if(crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning')!==before)throw Error('Extension note changed planning brief');
writeFileSync(folder+'/additional-coverage-request.json',JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,shotId:shot,acceptedAttemptId:e.sourceAttemptId,requestNoteId:id,reason,planningBriefHash:before,providerCalls:0},null,2),{flag:'wx'});db.exec('COMMIT');console.log(JSON.stringify({requestNoteId:id,planningBriefHash:before}));}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
