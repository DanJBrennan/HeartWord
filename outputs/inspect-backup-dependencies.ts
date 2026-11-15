import {createRequire} from 'node:module';
import {relative} from 'node:path';
import {writeFileSync} from 'node:fs';
import {inspectChapterPackage} from '../src/pipeline/assembly/chapter-package.js';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
const root='C:/Users/danbr/HeartWordData'; const db=new DatabaseSync(root+'/db/heartword.sqlite',{readOnly:true});
const reports=[];
for(const p of db.prepare('select id,language,book,chapter from projects').all()){
 const r=inspectChapterPackage(db,root,String(p.id));
 reports.push({project:p,files:r.manifest.files.length,problems:r.manifest.problems,editability:r.manifest.editability.length,external:[...r.sources.keys()].filter(x=>relative(root,x).startsWith('..')&&!r.sources.get(x)?.path.startsWith('application/'))});
}
db.close();writeFileSync('outputs/disaster-recovery-dependencies.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
