// Normal-stage selection only after actual whole-line heard and direct reviews clear.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptLipSyncCandidate} from '../../src/pipeline/voice-lipsync/candidate-selection.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const root='outputs/mark6-production',folder=root+'/complete-jesus-inventory-question-source-window-20261110',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(existsSync(folder+'/selection-and-assembly.json')||read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('No duplicate selection; settled native required');
const m=read(folder+'/review-preparation-proof.json'),av=read(folder+'/complete-line-av-review.json'),direct=read(folder+'/direct-complete-line-review.json'),names=['complete_speech_correspondence','quiet_and_resumption','actual_internal_join','expression_fits_composed_instruction','identity_face_jaw_clothes_and_text','complete_source_ending','approved_music_source_continuity','intro_to_question_boundary','body_and_hand_action'];
if(av.attemptId!==m.attemptId||av.response.result?.status!=='clear'||av.response.result?.framingAssessment?.severity!=='minor'||names.some(n=>av.response.result.checks?.[n]?.status!=='clear')||direct.status!=='direct_complete_picture_and_edges_inspected_heard_review_pending'||direct.wholeSha256!==m.wholeSha256||direct.boundarySha256!==m.boundarySha256||hash(m.whole)!==m.wholeSha256||hash(m.candidate)!==m.candidateSha256)throw Error('All actual eight heard checks and exact inspected whole line must clear');
const db=getDb(),project='c457a815-d07d-4902-91b5-7b936b549856',shot='24b0dc46-6b1e-41d1-966c-2b3d3d16c643';
try{
 const receipt='mark6-production-audio-review-m6_jesus_inventory_question_complete_and_incoming_av_20261110';
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get(receipt,project,av.response.costUsd))throw Error('Actual AV usage must be reconciled to film ledger');
 const selection=acceptLipSyncCandidate(db,project,m.attemptId,{reviewer:'Codex direct complete retained picture/joins plus bounded actual whole-line audiovisual reviewer',evidence:JSON.stringify({direct:folder+'/direct-complete-line-review.json',av:folder+'/complete-line-av-review.json',scope:'Completeoriginal5.1335sJesusinventoryquestion/oneinternaljoin/actualincomingintro; no native translation or publishing approval',approvedMusicAndNarratorReportsPreserved:true,receipt})});
 const assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath),ss=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=ss.find((s:any)=>s.codec_type==='video');
 if(Math.abs(assembled.durationMs-5133.5)>.001||!assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==124||hash(m.candidate)!==m.candidateSha256)throw Error('Actual normal-stage complete5.1335s/124frame assembly/source invariant failed');
 if(m.frames!==124||m.sourceSamples48k!==246408||m.audioSamples!==123204||JSON.stringify(m.sourceMs)!=='[564966.5,570100]')throw Error('Exact protected full cost-question scope required');
 const proof={at:new Date().toISOString(),status:'accepted_complete_Jesus_inventory_question_and_assembled',attemptId:m.attemptId,selection,assembled,assembledSha256:hash(out),originalCandidate:m.candidate,originalCandidateSha256:m.candidateSha256,sourceWindowMs:[564966.5,570100],sourceSamples48k:246408,pictureFrames:124,review:folder+'/complete-line-av-review.json',directReview:folder+'/direct-complete-line-review.json',receipt,approvedGlobalMixReview:m.whole,approvedGlobalMixSha256:m.wholeSha256,finalEditorUse:'Original selected lip_sync candidate and unchanged continuous approved global master; do not recursively encode review derivative',providerCalls:0,wholeFilmReady:false};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
}finally{db.close();}
