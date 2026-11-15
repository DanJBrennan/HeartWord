import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {parseCodexEvents} from '../../src/providers/codex-text.js';
const projectId=JSON.parse(readFileSync('outputs/mark6-production/workspace.json','utf8')).projectId;
const db=new DatabaseSync('C:/Users/danbr/HeartWordData/db/heartword.sqlite',{readOnly:true});
const ids=new Set(db.prepare('SELECT s.id FROM shots s JOIN scenes sc ON sc.id=s.scene_id WHERE sc.project_id=?').all(projectId).map(r=>r.id));
const base='C:/Users/danbr/HeartWordData/assets/preparation/crew-reasoning/'+projectId,rows=[];
for(const folder of readdirSync(base)){
 const path=join(base,folder,'response.jsonl');if(!existsSync(path))continue;
 const parsed=parseCodexEvents(readFileSync(path,'utf8')),foreign:any[]=[];
 function walk(x:any,p=''){if(Array.isArray(x))return x.forEach((v,i)=>walk(v,p+'['+i+']'));if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){if(/shot.*id|id.*shot/i.test(k)&&typeof v==='string'&&!ids.has(v))foreign.push({path:p+'.'+k,value:v});walk(v,p+'.'+k);}}
 walk(parsed.result);writeFileSync('outputs/mark6-production/'+folder+'.parsed.json',JSON.stringify(parsed,null,2));rows.push({task:folder,usage:parsed.usage,foreign,keys:Object.keys(parsed.result as any)});
}
console.log(JSON.stringify(rows));db.close();
