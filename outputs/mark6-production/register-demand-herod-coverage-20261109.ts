// Register one explicitly derived, still-held covered-speech candidate.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,bindAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {settleAvatarSpend} from '../../src/pipeline/voice-lipsync/performance-direction.js';
const top='outputs/mark6-production',folder=top+'/complete-daughter-demand-coverage-source-window-20261109-v2',project='c457a815-d07d-4902-91b5-7b936b549856',shot='35d20b02-5771-45b3-9d44-27f92e2d518f',reservation='c9f2259f-a996-4ad5-9e6d-dfb04d9e9887';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),m=read(folder+'/review-preparation-proof.json'),direct=read(folder+'/direct-complete-line-review.json'),db=getDb(),data=getDataDir();
try{
 const auth=productionAuthorization(db,data,project);auth.assertCurrent();
 const pending=db.prepare("SELECT payload FROM edit_commands WHERE project_id=? AND command_type='reserve_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation),settled=db.prepare("SELECT id FROM edit_commands WHERE project_id=? AND command_type='settle_avatar_spend' AND json_extract(payload,'$.reservationId')=?").get(project,reservation);
 if(existsSync(folder+'/registration.json')||db.prepare("SELECT id FROM generation_attempts WHERE shot_id=? AND operation='lip_sync'").get(shot)||!pending||settled||JSON.parse(String(pending.payload)).upperBoundUsd!==0||read(top+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed')||m.productionRevision.runId!==auth.runId||m.productionRevision.briefHash!==auth.briefHash||hash(m.candidate)!==m.candidateSha256||hash(join(data,'assets',m.candidateAssetPath))!==m.candidateSha256||m.frames!==210||m.sourceSamples48k!==418608||JSON.stringify(m.actualCuts)!=='[83]'||direct.status!=='direct_complete_picture_and_edges_inspected_heard_review_pending'||direct.wholeSha256!==m.wholeSha256||direct.boundarySha256!==m.boundarySha256||hash(join(data,'assets/generated/lip-sync/ltx-'+reservation+'/line.json'))!==m.originalHeldManifestSha256||m.originalHeldManifestStatus!=='held_reconcile_before_retry')throw Error('Exact held-prefix derivation/current revision/direct-picture inspection and original unsettled zero-dollar reservation required');
 const provenance={kind:'editorial_covered_speech_derivative',wholeSourceMs:m.sourceMs,wholeSamples48k:418608,pictureFrames:210,daughterVisibleFrames:83,herodSilentListenerFrames:127,actualCuts:m.actualCuts,derivation:folder+'/review-preparation-proof.json',derivationSha256:hash(folder+'/review-preparation-proof.json'),proposal:m.editorialProposal,proposalSha256:m.editorialProposalSha256,parentHeld:true,parentLineNotDeclaredComplete:true,nativeAudioExcluded:true,wholeHeardReviewPending:true};
 if(!process.argv.includes('--execute'))console.log(JSON.stringify({status:'prepared_registration_not_selected',provenance,providerCalls:0}));
 else{
  const id=randomUUID(),now=Date.now(),noteId=randomUUID();db.exec('BEGIN IMMEDIATE');try{
   db.prepare("INSERT INTO generation_attempts(id,shot_id,provider,model,operation,prompt,status,result_asset_path,cost_usd,created_at)VALUES(?,?,'ltx_local','ltx-2.5-fast-editorial-coverage','lip_sync',?,'hold_for_review',?,0,?)").run(id,shot,JSON.stringify(provenance),m.candidateAssetPath,now);
   db.prepare('INSERT INTO cost_ledger_entries(id,project_id,generation_attempt_id,amount_usd,created_at)VALUES(?,?,?,0,?)').run(randomUUID(),project,id,now);settleAvatarSpend(db,project,reservation,id);bindAttemptRevision(db,project,id,auth);
   db.prepare("INSERT INTO review_notes(id,project_id,subject_type,subject_id,source,note,resolved,created_at)VALUES(?,?,'shot',?,'qc',?,0,?)").run(noteId,project,shot,'Derived covered answer candidate held for full AV: '+JSON.stringify({attemptId:id,...provenance}),now);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  writeFileSync(folder+'/registration.json',JSON.stringify({at:new Date().toISOString(),attemptId:id,noteId,proposalNoteId:m.proposalNoteId,status:'held_for_complete_coverage_av',provenance,providerCalls:0,wholeLineApproved:false},null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:id,status:'held_for_complete_coverage_av',providerCalls:0}));
 }
}finally{db.close();}
