import 'dotenv/config';
import {readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {getDataDir} from '../../src/db/client.js';
import {digest,productionAssetPath} from '../../src/pipeline/creative-direction/crew-context.js';
import {productionAuthorization} from '../../src/pipeline/creative-direction/crew-store.js';
import {uploadGeminiReviewFile,getGeminiReviewFile,deleteGeminiReviewFile} from '../../src/providers/gemini-text.js';
import {inspectAvBudget} from './av-call.js';
const top='outputs/mark6-production',f=top+'/complete-film-20261112',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),data=getDataDir(),project='c457a815-d07d-4902-91b5-7b936b549856',mode=process.argv[2],r=read(f+'/finished-render-result.json'),qc=read(f+'/actual-source-and-mix-qc.json'),path=productionAssetPath(data,r.path),expected={sha256:r.sha256,mimeType:'video/mp4',sizeBytes:statSync(path).size},id='m6_complete_film_review178_av_20261112';
if(qc.status!=='actual_complete_encoded_film_source_and_approved_mix_technical_checks_pass'||qc.finalSha256!==r.sha256||qc.actualVideoFrames!==19612||digest(readFileSync(path))!==r.sha256)throw Error('Exact complete technically checked scored film required');
const db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true});
try{productionAuthorization(db,data,project).assertCurrent();if(db.prepare('SELECT id FROM chapter_renders WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 1').get(project)?.id!==r.renderId)throw Error('Current final render changed');}finally{db.close();}
if(mode==='upload'){
 const j=read(top+'/voice-review/execution.json');inspectAvBudget(j,read(top+'/av-model-preflight.json'),'finalFilmParts');
 if(j.calls.length!==177||j.pendingUsd!==0||existsSync(f+'/full-film-file-upload-started.json')||existsSync(f+'/full-film-file-attachment.json'))throw Error('Settled177 and no prior upload required; reconcile uncertain upload without retry');
 writeFileSync(f+'/full-film-file-upload-started.json',JSON.stringify({at:new Date().toISOString(),path,expected,originalQuality:true,lossyProxy:false,generationCalls:0},null,2),{flag:'wx'});
 const file=await uploadGeminiReviewFile(readFileSync(path),'video/mp4','Hatam Mark6 complete original scored review film');
 writeFileSync(f+'/full-film-file-attachment.json',JSON.stringify({at:new Date().toISOString(),path,expected,file,generationCalls:0},null,2),{flag:'wx'});console.log(JSON.stringify({name:file.name,state:file.state,bytes:expected.sizeBytes,generationCalls:0}));
}else if(mode==='poll'){
 const a=read(f+'/full-film-file-attachment.json');if(a.path!==path||JSON.stringify(a.expected)!==JSON.stringify(expected))throw Error('Exact owned fullfilm resource required');
 const file=await getGeminiReviewFile(a.file,expected);if(file.state==='FAILED')throw Error('Same fullfilm upload failed; do not repeat blindly');
 const p={at:new Date().toISOString(),path,expected,file,allActive:file.state==='ACTIVE',generationCalls:0};writeFileSync(f+'/full-film-file-metadata-latest.json',JSON.stringify(p,null,2));if(p.allActive)writeFileSync(f+'/full-film-files-ready.json',JSON.stringify(p,null,2));console.log(JSON.stringify({name:file.name,state:file.state,generationCalls:0}));
}else if(mode==='cleanup'){
 if(existsSync(f+'/full-film-file-cleanup.json'))throw Error('Owned resource already cleaned');const a=read(f+'/full-film-file-attachment.json'),av=read(f+'/complete-film-av-review.json'),j=read(top+'/voice-review/execution.json');
 if(j.pendingUsd!==0||!j.calls.some((x:any)=>x.id===id&&x.status==='returned_reconciled'&&x.costUsd===av.response.costUsd)||a.expected.sha256!==expected.sha256||av.media[0]?.sha256!==expected.sha256||av.media[0]?.uploadedFile?.name!==a.file.name)throw Error('Known exact fullfilm receipt and owned reviewed resource required');
 await deleteGeminiReviewFile(a.file);writeFileSync(f+'/full-film-file-cleanup.json',JSON.stringify({at:new Date().toISOString(),name:a.file.name,serverResourceDeleted:true,localOriginalPreserved:true,reviewReceiptKnown:true,generationCalls:0},null,2),{flag:'wx'});console.log(JSON.stringify({serverResourceDeleted:true,generationCalls:0}));
}else throw Error('Explicit upload/poll/cleanup mode required; no inference or automatic retry');
