import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {validateAttemptRevision,productionAuthorization} from '../../src/pipeline/creative-direction/crew-store.js';
const root='outputs/mark6-production',folder=root+'/complete-crowd-listening-source-window-20261109',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),av=read(folder+'/complete-window-av-review.json'),guardian=read(folder+'/goal-guardian-reevaluation.json'),id='8cb21c89-b731-4813-968d-757ede6bcc36',project='c457a815-d07d-4902-91b5-7b936b549856',out=folder+'/original-hold-reevaluation.json';
if(existsSync(out)||av.attemptId!==id||av.response.result.status!=='clear'||Object.keys(av.response.result.checks).length!==14||Object.values(av.response.result.checks).some((v:any)=>v.status!=='clear')||!guardian.decision)throw Error('Actual new evidence required');
const db=getDb();try{productionAuthorization(db,getDataDir(),project).assertCurrent();validateAttemptRevision(db,getDataDir(),project,id);
 if(db.prepare('SELECT id FROM clips WHERE generation_attempt_id=?').get(id))throw Error('Already selected');
 const old=db.prepare("SELECT note,resolved FROM review_notes WHERE id='mark6-crowd170-gesture-push-eyeline-hold' AND project_id=?").get(project);
 if(!old||old.resolved!==0)throw Error('Exact original root QC hold missing');
 const proof={at:new Date().toISOString(),attemptId:id,previousStatus:'retry_modified',newStatus:'hold_for_review',originalRootQcHold:old.note,newEvidence:av.response.result,guardian,scope:'Exact170 root QC hold only; original JSON retained. No Director objection overridden. No source advance until normal output verified.'};
 db.exec('BEGIN IMMEDIATE');try{
 if(db.prepare("UPDATE generation_attempts SET status='hold_for_review' WHERE id=? AND status='retry_modified'").run(id).changes!==1)throw Error('Attempt changed');
 db.prepare("UPDATE review_notes SET resolved=1 WHERE id='mark6-crowd170-gesture-push-eyeline-hold' AND resolved=0").run();
 db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at) VALUES(?,?,'shot',?,'qc',?,1,?)").run('mark6-crowd170-root-reevaluation-20261109',project,'07f97785-2a34-484a-8dee-577bc18bdbd7',JSON.stringify(proof),Date.now());
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 writeFileSync(out,JSON.stringify(proof,null,2),{flag:'wx'});console.log('Exact170 root hold superseded by actual AV116 and dedicated root re-evaluation; normal verification remains.');
}finally{db.close();}
