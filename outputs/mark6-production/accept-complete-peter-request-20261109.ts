// Normal-stage selection only after actual whole-line heard and direct reviews clear.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {getDb,getDataDir} from '../../src/db/client.js';
import {acceptLipSyncCandidate} from '../../src/pipeline/voice-lipsync/candidate-selection.js';
import {assembleSingleShot} from '../../src/pipeline/assembly/assemble-single-shot.js';
const root='outputs/mark6-production',folder=root+'/complete-peter-request-source-window-20261109',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
if(existsSync(folder+'/selection-and-assembly.json')||read(root+'/native-generation/execution.json').entries.some((e:any)=>e.status!=='returned_unreviewed'))throw Error('No duplicate selection; settled native required');
const m=read(folder+'/review-preparation-proof.json'),av=read(folder+'/complete-line-av-review.json'),direct=read(folder+'/direct-complete-line-review.json'),names=['complete_speech_correspondence','quiet_and_resumption','actual_four_internal_joins','expression_fits_practical_request','identity_face_jaw_clothes_and_text','complete_source_ending','approved_music_source_continuity','consultation_to_request_boundary'];
if(av.attemptId!==m.attemptId||av.response.result?.status!=='clear'||av.response.result?.framingAssessment?.severity!=='minor'||names.some(n=>av.response.result.checks?.[n]?.status!=='clear')||direct.status!=='direct_complete_picture_and_edges_inspected_heard_review_pending'||direct.wholeSha256!==m.wholeSha256||direct.boundarySha256!==m.boundarySha256||hash(m.whole)!==m.wholeSha256||hash(m.candidate)!==m.candidateSha256)throw Error('All actual eight heard checks and exact inspected whole line must clear');
const db=getDb(),project='c457a815-d07d-4902-91b5-7b936b549856',shot='5853deb0-d835-4464-9e81-bc0062d396c4';
try{
 const receipt='mark6-production-audio-review-m6_peter_request_complete_and_incoming_av_20261109';
 if(!db.prepare('SELECT id FROM cost_ledger_entries WHERE id=? AND project_id=? AND amount_usd=?').get(receipt,project,av.response.costUsd))throw Error('Actual AV usage must be reconciled to film ledger');
 const selection=acceptLipSyncCandidate(db,project,m.attemptId,{reviewer:'Codex direct complete retained picture/joins plus bounded actual whole-line audiovisual reviewer',evidence:JSON.stringify({direct:folder+'/direct-complete-line-review.json',av:folder+'/complete-line-av-review.json',scope:'Completeoriginal13.1785sPetercollectiverequest/allfourinternaljoins/actualincomingconsultationcut; no native translation or publishing approval',approvedMusicAndNarratorReportsPreserved:true,receipt})});
 const assembled=assembleSingleShot(db,shot),out=join(getDataDir(),'assets',assembled.assembledVideoPath),ss=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8',windowsHide:true})).streams,v=ss.find((s:any)=>s.codec_type==='video');
 if(Math.abs(assembled.durationMs-13178.5)>.001||!assembled.hasDialogueAudio||v.width!==1280||v.height!==720||v.r_frame_rate!=='24/1'||Number(v.nb_read_frames)!==317||hash(m.candidate)!==m.candidateSha256)throw Error('Actual normal-stage complete7.4765s/180frame assembly/source invariant failed');
 if(m.frames!==317||m.sourceSamples48k!==632568||m.audioSamples!==316284||JSON.stringify(m.sourceMs)!=='[530993.5,544172]')throw Error('Exact protected full invitation scope required');
 const proof={at:new Date().toISOString(),status:'accepted_complete_Peter_request_and_assembled',attemptId:m.attemptId,selection,assembled,assembledSha256:hash(out),originalCandidate:m.candidate,originalCandidateSha256:m.candidateSha256,sourceWindowMs:[530993.5,544172],sourceSamples48k:632568,pictureFrames:317,review:folder+'/complete-line-av-review.json',directReview:folder+'/direct-complete-line-review.json',receipt,approvedGlobalMixReview:m.whole,approvedGlobalMixSha256:m.wholeSha256,finalEditorUse:'Original selected lip_sync candidate and unchanged continuous approved global master; do not recursively encode review derivative',providerCalls:0,wholeFilmReady:false};
 writeFileSync(folder+'/selection-and-assembly.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
}finally{db.close();}
