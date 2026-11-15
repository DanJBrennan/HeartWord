import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
import {requireCurrentPlan,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {crewBriefHash,loadCrewBrief} from '../../src/pipeline/creative-direction/crew-context.js';
const db=getDb(),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856',folder='outputs/mark6-production/selected-shot-assembly-20261107';mkdirSync(folder,{recursive:true});
const plan=requireCurrentPlan(db,data,project),before=crewBriefHash(loadCrewBrief(db,data,project,'planning'),'planning'),rows=db.prepare("SELECT ga.id,ga.shot_id,ga.result_asset_path,cl.timeline_end_ms-cl.timeline_start_ms durationMs FROM clips cl JOIN generation_attempts ga ON ga.id=cl.generation_attempt_id JOIN shots sh ON sh.id=ga.shot_id JOIN scenes sc ON sc.id=sh.scene_id WHERE sc.project_id=? AND ga.status='accepted' AND ga.operation IN ('generate_final_video','lip_sync','trim_final_video') ORDER BY sc.sequence,sh.sequence").all(project);
if(rows.length!==7||new Set(rows.map(r=>r.shot_id)).size!==7)throw Error('Expected seven current independently selected raw shots; inspect changed inventory');
const results=[];
for(const row of rows){
 const record=join(folder,String(row.shot_id)+'.json');if(existsSync(record)){const saved=JSON.parse(readFileSync(record,'utf8'));if(saved.rawAttemptId!==row.id)throw Error('Changed selected source requires reconciliation');results.push(saved);continue;}
 validateAttemptRevision(db,data,project,String(row.id));
 const sourcePath=join(data,'assets',String(row.result_asset_path)),sourceSha256=createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
 const assembled=assembleSingleShot(db,String(row.shot_id));
 if(assembled.durationMs!==row.durationMs||createHash('sha256').update(readFileSync(sourcePath)).digest('hex')!==sourceSha256||crewBriefHash(loadCrewBrief(db,data,project,'planning'),'planning')!==before)throw Error('Assembly changed selected timing, source bytes or accepted planning authority');
 const proof={at:new Date().toISOString(),productionRunId:plan.id,rawAttemptId:row.id,sourcePath:row.result_asset_path,sourceSha256,assembled,assembledSha256:createHash('sha256').update(readFileSync(join(data,'assets',assembled.assembledVideoPath))).digest('hex'),planningBriefHash:before,providerCalls:0,scope:'Selected shot only, not source-placed chapter cut or final mix approval'};writeFileSync(record,JSON.stringify(proof,null,2),{flag:'wx'});results.push(proof);console.log(JSON.stringify({shotId:row.shot_id,durationMs:assembled.durationMs,hasDialogueAudio:assembled.hasDialogueAudio}));
}
writeFileSync(join(folder,'summary.json'),JSON.stringify({at:new Date().toISOString(),selectedShots:results.length,inventoryDurationMs:results.reduce((n,r)=>n+r.assembled.durationMs,0),results,wholeFilmReady:false,sourcePlaced:false,approvedFinalMixUnchanged:true,newProviderCalls:0},null,2));db.close();
