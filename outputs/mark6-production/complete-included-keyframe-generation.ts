// Finish one actual reserved built-in result; no provider submission or ledger fiction.
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {importKeyframe,acceptKeyframe,type KeyframeBrief} from '../../src/pipeline/media-generation/external-keyframes.js';
const [briefFile,folder,generated,reviewFile]=process.argv.slice(2),accept=process.argv.includes('--accept');
if(!briefFile||!folder||!generated||!reviewFile)throw Error('Exact brief/folder/actual image/named review required');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex'),top='outputs/mark6-production',brief=read(briefFile) as KeyframeBrief,request=read(folder+'/request.json'),journalPath=top+'/images/execution.json',journal=read(journalPath),entry=journal.calls.find((c:any)=>c.id===request.id),review=readFileSync(reviewFile,'utf8').trim();
if(!resolve(folder).startsWith(resolve(top)+'\\')||!entry||entry.status!=='pending_builtin'||request.briefSha256!==hash(briefFile)||request.promptSha256!==brief.promptHash||request.shotId!==brief.context.shot.id||request.route!=='included_builtin_imagegen'||request.apiFallback!==false||!review)throw Error('Exact pending actual included request required');
const artifact=join(folder,'generated.png');if(existsSync(artifact)){if(hash(artifact)!==hash(generated))throw Error('Existing actual artifact differs');}else copyFileSync(generated,artifact);
const db=getDb();try{
 const result=importKeyframe(db,getDataDir(),brief,artifact,review),selection=accept?acceptKeyframe(db,result.attemptId,getDataDir()):undefined;
 Object.assign(entry,{status:accept?'returned_imported_accepted':'returned_imported_held',attemptId:result.attemptId,artifact,artifactSha256:hash(artifact),reviewEvidence:reviewFile,returnedAt:new Date().toISOString(),originalBuiltinOutput:generated});
 writeFileSync(journalPath,JSON.stringify(journal,null,2));writeFileSync(folder+'/journal-reconciliation.json',JSON.stringify(entry,null,2),{flag:'wx'});writeFileSync(folder+'/import-result.json',JSON.stringify({at:new Date().toISOString(),result,selection,providerCalls:0,apiFallback:false},null,2),{flag:'wx'});console.log(JSON.stringify({imageCalls:journal.calls.length,result,selection}));
}finally{db.close();}
