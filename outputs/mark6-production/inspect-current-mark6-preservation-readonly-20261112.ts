import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {getDataDir} from '../../src/db/client.js';
import {inspectChapterPackage} from '../../src/pipeline/assembly/chapter-package.js';
const top='outputs/mark6-production',out=top+'/checkpoints/preservation-readonly-before-complete-film-20261112.json',n=JSON.parse(readFileSync(top+'/native-generation/execution.json','utf8'));
if(existsSync(out)||n.entries.length!==263||n.entries.some((x:any)=>x.status!=='returned_unreviewed'))throw Error('All263nativeIDLE/read-only unique diagnostic required');
const data=getDataDir(),db=new DatabaseSync(join(data,'db/heartword.sqlite'),{readOnly:true});
try{
 const {manifest}=inspectChapterPackage(db,data,'c457a815-d07d-4902-91b5-7b936b549856',{includeApplication:true});
 const proof={at:new Date().toISOString(),scope:'Read-only preservation dependency discovery before actual completed cut, NOT export or portable proof',manifest,providerCalls:0,databaseWrites:0,wholeFilmReady:false};
 writeFileSync(out,JSON.stringify(proof,null,2),{flag:'wx'});
 console.log(JSON.stringify({files:manifest.files.length,bytes:manifest.files.reduce((n,x)=>n+x.bytes,0),problems:manifest.problems.length,firstProblems:manifest.problems.slice(0,12),editability:manifest.editability,providerCalls:0,databaseWrites:0,wholeFilmReady:false}));
}finally{db.close();}
