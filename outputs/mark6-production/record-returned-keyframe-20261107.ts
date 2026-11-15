// Record one actual builtin return through existing keyframe import/acceptance.
import {readFileSync,writeFileSync,copyFileSync,existsSync,constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {getDb,getDataDir} from '../../src/db/client.js';
import {importKeyframe,acceptKeyframe,sha256} from '../../src/pipeline/media-generation/external-keyframes.js';
const [folder,actual,verdict]=process.argv.slice(2);if(!folder||!actual||!verdict||!['hold','accept'].includes(verdict))throw Error('Explicit operation folder, actual returned image, root verdict required');
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),request=read(join(folder,'request.json')),review=readFileSync(join(folder,'review.txt'),'utf8'),brief=read(request.briefFile),journalPath=join(root,'images/execution.json'),journal=read(journalPath),entry=journal.calls.find((c:any)=>c.id===request.id);
if(!resolve(folder).startsWith(resolve(root)+'\\')||!entry||entry.status!=='pending_builtin'||request.apiFallback!==false||request.route!=='included_builtin_imagegen'||sha256(readFileSync(request.briefFile))!==request.briefSha256||brief.promptHash!==request.promptSha256||sha256(brief.prompt)!==request.promptSha256||!review.trim()||existsSync(join(folder,'journal-reconciliation.json')))throw Error('Actual immutable reserved builtin return and explicit direct review required');
const saved=join(folder,'generated.png');copyFileSync(actual,saved,constants.COPYFILE_EXCL);const db=getDb();try{
 const imported=importKeyframe(db,getDataDir(),brief,saved,review);if(verdict==='accept')acceptKeyframe(db,imported.attemptId);
 Object.assign(entry,{status:verdict==='accept'?'returned_imported_accepted':'returned_imported_held',attemptId:imported.attemptId,artifact:saved,artifactSha256:sha256(readFileSync(saved)),reviewEvidence:join(folder,'review.txt'),returnedAt:new Date().toISOString()});
 writeFileSync(journalPath,JSON.stringify(journal,null,2));writeFileSync(join(folder,'journal-reconciliation.json'),JSON.stringify(entry,null,2),{flag:'wx'});console.log(JSON.stringify({attemptId:imported.attemptId,status:entry.status,saved:imported.imagePath}));
}finally{db.close();}
