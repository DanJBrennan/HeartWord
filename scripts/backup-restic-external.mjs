// Supplement a completed current capture with present external references.
// Reads only the captured standalone databases, never live database rows.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync,lstatSync,statSync,readFileSync,writeFileSync,openSync,closeSync,createReadStream} from 'node:fs';
import {resolve,relative,isAbsolute,join,dirname,toNamespacedPath} from 'node:path';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
const args=process.argv.slice(2),opts=Object.fromEntries(args.map((v,i)=>v.startsWith('--')?[v.slice(2),args[i+1]]:null).filter(Boolean));
if(!opts.capture||!opts.restic||!opts.repo||!opts.password)throw Error('Required: --capture --restic --repo --password');
const capture=resolve(opts.capture),work=dirname(capture),meta=JSON.parse(readFileSync(join(capture,'capture.json'),'utf8'));
const inv=JSON.parse(readFileSync(join(capture,'source-inventory.json'),'utf8'));
const covered=new Set([...inv.data,...inv.application].map(([p])=>resolve(p).toLowerCase()));
const skip=new Set(['imported_from','sourceRoot','originalPath','sourceOriginal','url','uri']);
const refs=new Map();let databaseName,tables=0,rows=0;
function inspect(v,context){
 if(typeof v==='string'){
  if(v.startsWith('{')||v.startsWith('[')){try{inspect(JSON.parse(v),context);return;}catch{}}
  if(!/^(?:[a-z]:[\\/]|\\\\)/i.test(v)||! /\.(mp4|mov|mkv|webm|wav|mp3|flac|m4a|aac|ogg|png|jpe?g|webp|blend\d*|docx|json|py|ttf|otf|vdb|abc)$/i.test(v))return;
  const p=resolve(v),rel=relative(meta.dataRoot,p);if(!(rel.startsWith('..')||isAbsolute(rel))||covered.has(p.toLowerCase()))return;
  const entry=refs.get(p.toLowerCase())??{path:p,aliases:[],references:[]};entry.aliases.push(v);entry.references.push({database:databaseName,context});refs.set(p.toLowerCase(),entry);
 }else if(Array.isArray(v))v.forEach((x,i)=>inspect(x,context+'['+i+']'));
 else if(v&&typeof v==='object'&&!(v instanceof Uint8Array))for(const [k,x]of Object.entries(v))if(!skip.has(k))inspect(x,context+'.'+k);
}
async function hash(p){const h=createHash('sha256');for await(const c of createReadStream(p))h.update(c);return h.digest('hex');}
const files=[],missing=[];
for(const d of meta.databases){databaseName=d.relativePath;const db=new DatabaseSync(toNamespacedPath(join(capture,'sqlite',d.relativePath)),{readOnly:true});try{for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){tables++;for(const row of db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').iterate()){rows++;inspect(row,name+':'+(row.id??row.project_id??''));}}}finally{db.close();}}
for(const f of refs.values()){
 if(!existsSync(f.path)){missing.push(f);continue;}const s=lstatSync(f.path);if(!s.isFile()||s.isSymbolicLink())throw Error('External reference is not a regular file: '+f.path);
 files.push({...f,bytes:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,sha256:await hash(f.path)});
}
const inventory=join(work,'external-inventory.json'),roots=join(work,'external-roots.txt'),log=join(work,'external-restic.jsonl');
writeFileSync(inventory,JSON.stringify({databases:meta.databases.length,tables,rows,files,missing},null,2),{flag:'wx',flush:true});
writeFileSync(roots,[...files.map(f=>f.path),inventory].join('\n')+'\n',{flag:'wx'});
const command=['--repo',opts.repo,'--password-file',opts.password,'--cache-dir',join(dirname(resolve(opts.repo)),'cache'),'backup','--json','--tag','heartword-external','--group-by','host,tags','--files-from-verbatim',roots];
if(opts.parent)command.push('--parent',opts.parent);
const fd=openSync(log,'wx');
const code=await new Promise((yes,no)=>{const p=spawn(opts.restic,command,{stdio:['ignore',fd,fd],windowsHide:true});p.once('error',no);p.once('exit',yes);});closeSync(fd);
if(code!==0)throw Error('External capture failed: restic exit '+code+'; see '+log);
for(const f of files){const s=statSync(f.path);if(s.size!==f.bytes||s.mtimeMs!==f.mtimeMs||s.ctimeMs!==f.ctimeMs||await hash(f.path)!==f.sha256)throw Error('External reference changed during capture: '+f.path);}
const summary=readFileSync(log,'utf8').trim().split(/\r?\n/).map(l=>{try{return JSON.parse(l);}catch{return {};}}).findLast(r=>r.message_type==='summary');
if(!summary?.snapshot_id)throw Error('No completed external snapshot.');
writeFileSync(join(work,'external-result.json'),JSON.stringify({sourceStable:true,snapshotId:summary.snapshot_id,files:files.length,missingHistoricalPaths:missing.length,summary},null,2),{flag:'wx',flush:true});
console.log(JSON.stringify({snapshotId:summary.snapshot_id,files:files.length,missingHistoricalPaths:missing.length}));
