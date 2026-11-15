import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {uploadGeminiReviewFile} from '../../src/providers/gemini-text.js';
import {inspectAvBudget} from './av-call.js';
const top='outputs/mark6-production',folder=top+'/complete-feeding-parent-source-window-20261111',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),m=read(folder+'/review-preparation-proof.json'),db=getDb();
try{
 const auth=productionAuthorization(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856');auth.assertCurrent();
 const av=read(top+'/voice-review/execution.json');inspectAvBudget(av,read(top+'/av-model-preflight.json'),'wholePerformanceAV');
 if(existsSync(folder+'/file-upload-started.json')||existsSync(folder+'/complete-window-av-review.json')||av.calls.length!==145||av.pendingUsd!==0||m.frames!==1706||!m.all1706DecodedPicturesIdenticalToAcceptedNormalSelections||!m.exactApprovedMasterPcmVerified||!m.aacPacketsIdenticalToContinuousReference||!m.capacity218Excluded||JSON.stringify(m.sourceWindowMs)!=='[579613.875,650729]')throw Error('Exact accepted whole parent technical/current plan/settled145 required');
 for(const c of m.components){validateAttemptRevision(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856',c.acceptedNativeAttemptId);if(!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND operation='assemble_shot' AND status='accepted' AND result_asset_path=?").get(c.editorClipId,c.path.replace(getDataDir()+'\\assets\\','').replace(getDataDir()+'/assets/',''))) {
  const row=db.prepare("SELECT result_asset_path FROM generation_attempts WHERE id=? AND operation='assemble_shot' AND status='accepted'").get(c.editorClipId);if(!row||!c.path.endsWith(String(row.result_asset_path)))throw Error('Exact accepted NORMAL component required');
 }}
 const bytes=readFileSync(m.whole),expected={sha256:m.wholeSha256,mimeType:'video/mp4',sizeBytes:bytes.length};if(createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Original parent review changed');
 writeFileSync(folder+'/file-upload-started.json',JSON.stringify({at:new Date().toISOString(),attemptId:'complete-feeding-parent-accepted-normal1706',localPath:m.whole,expected,generationCalls:0,noRetry:true,docs:'https://aistudio.google.com/docs/files'},null,2),{flag:'wx'});
 const file=await uploadGeminiReviewFile(bytes,'video/mp4','Mark6 complete feeding parent actual accepted NORMAL1706');
 writeFileSync(folder+'/files-main-attachment.json',JSON.stringify({at:new Date().toISOString(),attemptId:'complete-feeding-parent-accepted-normal1706',localPath:m.whole,expected,file,serverHashSizeMimeAndResourceVerified:true,generationCalls:0,notMediaAcceptance:true,wholeFilmReady:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({name:file.name,state:file.state,sizeBytes:file.sizeBytes,serverHashVerified:true,generationCalls:0}));
}finally{db.close();}
