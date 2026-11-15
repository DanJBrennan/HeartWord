import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {uploadGeminiReviewFile} from '../../src/providers/gemini-text.js';
import {inspectAvBudget} from './av-call.js';
const top='outputs/mark6-production',folder=top+'/complete-entry-wind-reaction-parent-source-window-20261112',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),m=read(folder+'/review-preparation-proof.json'),db=getDb();
try{
 const auth=productionAuthorization(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856');auth.assertCurrent();
 const av=read(top+'/voice-review/execution.json');inspectAvBudget(av,read(top+'/av-model-preflight.json'),'wholePerformanceAV');
 if(existsSync(folder+'/file-upload-started.json')||existsSync(folder+'/complete-parent-av-review.json')||av.calls.length!==165||av.pendingUsd!==0||m.pictureFrames!==410||!m.exactApprovedMasterPcmVerified||!m.continuousAacPacketsIdentical||!m.localExtra248Frame98Excluded||JSON.stringify(m.sourceWindowMs)!=='[723198,740291]')throw Error('Exact complete accepted245247248/source410/final98/settled165 required');
 for(const c of m.rows){validateAttemptRevision(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856',c.attemptId);if(!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND operation='assemble_shot' AND status='accepted'").get(c.editorClipId))throw Error('Exact accepted NORMAL component required');}
 const bytes=readFileSync(m.whole),expected={sha256:m.wholeSha256,mimeType:'video/mp4',sizeBytes:bytes.length};if(createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Original parent review changed');
 writeFileSync(folder+'/file-upload-started.json',JSON.stringify({at:new Date().toISOString(),attemptId:'complete-entry-wind-reaction-parent-actual410',localPath:m.whole,expected,generationCalls:0,noRetry:true,docs:'https://aistudio.google.com/docs/files'},null,2),{flag:'wx'});
 const file=await uploadGeminiReviewFile(bytes,'video/mp4','Mark6 complete entry wind reaction parent actual NORMAL410');
 writeFileSync(folder+'/files-main-attachment.json',JSON.stringify({at:new Date().toISOString(),attemptId:'complete-entry-wind-reaction-parent-actual410',localPath:m.whole,expected,file,serverHashSizeMimeAndResourceVerified:true,generationCalls:0,notMediaAcceptance:true,wholeFilmReady:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({name:file.name,state:file.state,sizeBytes:file.sizeBytes,serverHashVerified:true,generationCalls:0}));
}finally{db.close();}
