import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {requireCurrentPlan} from '../../src/pipeline/creative-direction/crew-store.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
const db=getDb(),project='c457a815-d07d-4902-91b5-7b936b549856',shot='72f96eff-3aab-4786-ba4d-89c03539e160',folder='outputs/mark6-production/native-motion/scene1-shot3-continued-teaching-take3-v1';
try{const plan=requireCurrentPlan(db,getDataDir(),project),e=JSON.parse(readFileSync(folder+'/continuity-frame-extraction.json','utf8')),review=JSON.parse(readFileSync(folder+'/continuity-frame-review.json','utf8'));
if(review.sourceFrame!==239||e.sourceAttemptId!=='8a041f6b-a7b6-4b2e-82a3-279d348ea641')throw Error('Wrong reviewed parent');
const before=crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning'),id=randomUUID(),reason='Source0–30789ms requires30.789s actual moving picture including recordedheading. Existingarrival5+lateral2+originalteaching2+listeners3+acceptedteachingtake2ten=22s; remaining8.789s. Next10s candidate continues same approved back-view teaching from ACTUAL lastselected take2frame239, same tenactors/currentclothes/hall/daylight, mouthunseen, handsresting and independentlytimed quietbreathing. Preserve oldtakes and allsource/title/quiet, no loops/freeze/slowmotion or inferred internalHatam timing. Actualreturnedusablecapacity and allsource placement stillneed review.';
db.exec('BEGIN IMMEDIATE');
const pin={kind:'same_approved_action',runId:plan.id,briefHash:before,acceptedAttemptId:e.sourceAttemptId,reason};
db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(id,project,shot,'Production Director approved source coverage v1:'+JSON.stringify(pin),Date.now());
if(crewBriefHash(loadCrewBrief(db,getDataDir(),project,'planning'),'planning')!==before)throw Error('Extension note changed planning brief');
writeFileSync(folder+'/additional-coverage-request.json',JSON.stringify({at:new Date().toISOString(),productionRunId:plan.id,shotId:shot,acceptedAttemptId:e.sourceAttemptId,requestNoteId:id,reason,planningBriefHash:before,providerCalls:0},null,2),{flag:'wx'});db.exec('COMMIT');console.log(JSON.stringify({requestNoteId:id,planningBriefHash:before}));}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
