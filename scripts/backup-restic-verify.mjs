// Independent verification of a completed current + external capture.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,openSync,closeSync,existsSync,statSync,createReadStream,mkdirSync} from 'node:fs';
import {resolve,join,dirname,basename,toNamespacedPath} from 'node:path';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
const av=process.argv.slice(2),o=Object.fromEntries(av.map((v,i)=>v.startsWith('--')?[v.slice(2),av[i+1]]:null).filter(Boolean));
for(const k of ['capture','restic','repo','password'])if(!o[k])throw Error('Missing --'+k);
const capture=resolve(o.capture),work=dirname(capture),read=p=>JSON.parse(readFileSync(p,'utf8'));
const meta=read(join(capture,'capture.json')),current=read(capture+'-result.json'),external=read(join(work,'external-result.json')),inventory=read(join(work,'external-inventory.json'));
if(!current.sourceStable||!external.sourceStable)throw Error('Capture is not stable.');
const target=join(work,'verified-restore');if(existsSync(target))throw Error('Fresh verification destination required.');mkdirSync(target);
const sp=p=>'/'+resolve(p).replace(/^([A-Za-z]):/,'$1').replaceAll('\\','/');
async function run(args,name){const fd=openSync(join(work,name+'.log'),'wx');const code=await new Promise((yes,no)=>{const p=spawn(o.restic,['--repo',o.repo,'--password-file',o.password,'--cache-dir',join(dirname(resolve(o.repo)),'cache'),...args],{stdio:['ignore',fd,fd],windowsHide:true});p.once('error',no);p.once('exit',yes);});closeSync(fd);if(code!==0)throw Error(name+' failed: '+code);}
await run(['check','--read-data'],'repository-check');
await run(['restore',current.snapshotId+':'+sp(capture),'--target',join(target,'capture'),'--verify'],'restore-databases');
for(const d of meta.databases){const p=join(target,'capture','sqlite',d.relativePath);if(statSync(p).size!==d.bytes)throw Error('Database size mismatch.');const db=new DatabaseSync(toNamespacedPath(p),{readOnly:true});try{if(JSON.stringify(db.prepare('PRAGMA integrity_check').all())!==JSON.stringify([{integrity_check:'ok'}])||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database verification failed: '+d.relativePath);}finally{db.close();}}
const groups=new Map();for(const f of inventory.files){const parent=dirname(f.path);if(!groups.has(parent))groups.set(parent,[]);groups.get(parent).push(f);}
let i=0;for(const [parent,files]of groups){const destination=join(target,'external-'+i),include=join(work,'external-verify-'+i+'.txt');writeFileSync(include,files.map(f=>'/'+basename(f.path)).join('\n')+'\n',{flag:'wx'});await run(['restore',external.snapshotId+':'+sp(parent),'--target',destination,'--include-file',include,'--verify'],'restore-external-'+i++);for(const f of files){const p=join(destination,basename(f.path)),h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);if(statSync(p).size!==f.bytes||h.digest('hex')!==f.sha256)throw Error('External restore hash mismatch: '+f.path);}}
writeFileSync(join(work,'verified.json'),JSON.stringify({passed:true,at:new Date().toISOString(),currentSnapshot:current.snapshotId,externalSnapshot:external.snapshotId,databases:meta.databases.length,externalFiles:inventory.files.length,missingHistoricalPaths:inventory.missing.length,verification:'Every repository chunk checked; every captured database and external file independently restored and checked.'},null,2),{flag:'wx',flush:true});
