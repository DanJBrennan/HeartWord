import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {getDataDir} from '../../src/db/client.js';
import {exportChapterPackage,verifyChapterPackage,restoreChapterPackage} from '../../src/pipeline/assembly/chapter-package.js';
const top='outputs/mark6-production',f=top+'/complete-film-20261112',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),data=getDataDir(),base='C:/Users/danbr/HeartWordExports/mark6-review-20261112',dest=base+'/chapter-package-v2',restored=base+'/restore-proof-data',mode=process.argv[2];
if(mode==='export'){
 const review=read(f+'/whole-film-root-review.json'),j=read(top+'/voice-review/execution.json'),n=read(top+'/native-generation/execution.json');
 if(review.status!=='accepted_for_user_review_portable_proof_pending'||j.calls.length!==178||j.pendingUsd!==0||n.entries.length!==263||n.entries.some((x:any)=>x.status!=='returned_unreviewed'))throw Error('Actual accepted COMPLETE film/settled178/nativeIDLE required');
 const runtime=join(data,'assets/generated/hatam/mark-6/editable-review-runtime-20261112');if(!existsSync(runtime))cpSync(top+'/portable-runtime-template-20261112',runtime,{recursive:true,errorOnExist:true,force:false});
 const roots=read(top+'/checkpoints/source-review-root-index-20261110.json').items.map((x:any)=>dirname(x.root));
 const docs:string[]=[];const walk=(d:string)=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.md'))docs.push(p);}};walk('docs');
 const extras=[runtime,...roots,f,top+'/checkpoints',top+'/portable-proof-portrait-shift-preparation-20261112',top+'/voice-review/execution.json',top+'/execution.json',top+'/native-generation/execution.json',top+'/allowance-snapshot.json',top+'/bounded-resume-20261104.json',top+'/av-model-preflight.json',top+'/av-review',top+'/check-complete-film-source-and-mix-20261112.py','AGENTS.md',...docs];
 mkdirSync(base,{recursive:true});const db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true});try{const m=exportChapterPackage(db,data,'c457a815-d07d-4902-91b5-7b936b549856',dest,{includeApplication:true,extraFiles:[...new Set(extras)].map(x=>resolve(x))});verifyChapterPackage(dest);const proof={at:new Date().toISOString(),status:'actual_complete_review_package_exported_and_all_bytes_verified',package:dest,files:m.files.length,bytes:m.files.reduce((n,x)=>n+x.bytes,0),recordsSha256:m.recordsSha256,problems:m.problems,providerCalls:0,portableEditRerenderPending:true};writeFileSync(base+'/package-export-proof.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));}finally{db.close();}
 }else if(mode==='restore'){
 const m=restoreChapterPackage(dest,restored);const proof={at:new Date().toISOString(),status:'actual_complete_film_package_independently_restored',package:dest,restoredRoot:restored,files:m.files.length,recordsSha256:m.recordsSha256,providerCalls:0,originalRootsUnavailableEditRerenderPending:true};writeFileSync(base+'/package-restore-proof.json',JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify(proof));
 }else throw Error('Explicit export or restore mode required');
