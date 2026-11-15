import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {productionAuthorization,validateAttemptRevision} from '../../src/pipeline/creative-direction/crew-store.js';
import {uploadGeminiReviewFile} from '../../src/providers/gemini-text.js';
import {inspectAvBudget} from './av-call.js';
const top='outputs/mark6-production',folder=top+'/complete-twelve-baskets216-source-window-20261111',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),m=read(folder+'/review-preparation-proof.json'),d=read(folder+'/direct-selected-picture-review.json'),db=getDb();
try{
 const auth=productionAuthorization(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856');auth.assertCurrent();validateAttemptRevision(db,getDataDir(),'c457a815-d07d-4902-91b5-7b936b549856',m.attemptId);
 const n=read(top+'/native-generation/execution.json'),av=read(top+'/voice-review/execution.json'),s=read(top+'/allowance-snapshot.json');inspectAvBudget(av,read(top+'/av-model-preflight.json'),'wholePerformanceAV');
 if(existsSync(folder+'/file-upload-started.json')||existsSync(folder+'/files-main-attachment.json')||existsSync(folder+'/complete-window-av-review.json')||n.entries.length!==216||n.entries.some((x:any)=>x.status!=='returned_unreviewed')||av.calls.length!==144||av.pendingUsd!==0||!s.ordinaryUsageAllowed||Date.now()-Date.parse(s.observedAt)>120000||d.status!=='actual_all219_full0_48_96_144_192_217_218_and_incoming_seen'||!d.allMaterialChecksClear||d.wholeSha256!==m.wholeSha256||!db.prepare("SELECT id FROM generation_attempts WHERE id=? AND operation='generate_final_video' AND status='hold_for_review'").get(m.attemptId))throw Error('Exact idle216/directactualreview/freshallowance/knownAV144 required');
 const bytes=readFileSync(m.whole),expected={sha256:m.wholeSha256,mimeType:'video/mp4',sizeBytes:bytes.length};if(createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Actualreviewmedia changed');
 writeFileSync(folder+'/file-upload-started.json',JSON.stringify({at:new Date().toISOString(),attemptId:m.attemptId,localPath:m.whole,expected,generationCalls:0,transport:'Gemini Files API resumable; non-generative/no-cost per official docs; no automatic retry',docs:'https://aistudio.google.com/docs/files'},null,2),{flag:'wx'});
 const file=await uploadGeminiReviewFile(bytes,'video/mp4','Mark6 actual216 first219 reviewed pictures');
 const proof={at:new Date().toISOString(),attemptId:m.attemptId,localPath:m.whole,expected,file,serverHashSizeMimeAndResourceVerified:true,generationCalls:0,transportRequests:2,notMediaAcceptance:true,wholeFilmReady:false};writeFileSync(folder+'/files-main-attachment.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({name:file.name,state:file.state,sizeBytes:file.sizeBytes,serverHashVerified:true,generationCalls:0}));
}finally{db.close();}
