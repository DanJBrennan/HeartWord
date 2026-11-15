// Self-contained restic capture of HeartWord data, consistent SQLite snapshots,
// and recoverable application source. No provider calls or cleanup operations.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, statSync, mkdirSync, writeFileSync, readFileSync, openSync, closeSync, unlinkSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname, relative, basename, toNamespacedPath } from 'node:path';
const { DatabaseSync, backup } = createRequire(import.meta.url)('node:sqlite');
const options = Object.fromEntries(process.argv.slice(2).map((v, i, a) => v.startsWith('--') ? [v.slice(2), a[i + 1]] : null).filter(Boolean));
const data = resolve(options.data ?? 'C:/Users/danbr/HeartWordData');
const application = resolve(options.app ?? '.');
const capture = resolve(options.capture ?? 'D:/HeartWordBackupCaptures/current-20261113');
const repository = resolve(options.repo ?? 'D:/HeartWordBackups/restic');
const passwordFile = resolve(options.password ?? 'D:/HeartWordBackupRecovery/restic-password.txt');
const restic = resolve(options.restic ?? 'D:/HeartWordBackupTools/restic_0.19.1_windows_amd64.exe');
const tag = options.tag ?? 'heartword-current';
const norm = p => resolve(p).replaceAll('\\', '/');
const secret = n => /^\.env(?:\..*)?$/.test(n) && n !== '.env.example';
const appIgnore = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist']);
const volatile = new Set(['.disaster-backup.lock','logs/disaster-backup-status.json','logs/disaster-backup-events.jsonl']);
const appNames = ['src','scripts','tests','docs','AGENTS.md','README.md','.env.example','package.json','package-lock.json','tsconfig.json','tsconfig.base.json','vite.config.ts','vitest.config.ts'];
const log = (phase, detail = {}) => console.log(JSON.stringify({at:new Date().toISOString(), phase, ...detail}));
function noLinks(path) {
  for (let p=resolve(path);;p=dirname(p)) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw Error('Linked path rejected: '+p);
    if (dirname(p)===p) break;
  }
}
function scan(root, app = false) {
  noLinks(root);
  const files = new Map(), excluded = [];
  function walk(p) {
    const s=lstatSync(p), rel=relative(root,p).replaceAll('\\','/'), n=basename(p);
    if(s.isSymbolicLink()) throw Error('Linked path rejected: '+p);
    if(secret(n) || (!app && volatile.has(rel)) || (app && appIgnore.has(n))) {excluded.push(p);return;}
    if(s.isDirectory()) for(const name of readdirSync(p).sort()) walk(join(p,name));
    else if(s.isFile()) files.set(p,{bytes:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,ino:s.ino});
    else throw Error('Unsupported file: '+p);
  }
  if(app) for(const name of appNames) {const p=join(root,name);if(existsSync(p))walk(p);}
  else walk(root);
  return {files,excluded};
}
const json = (p,v) => writeFileSync(p,JSON.stringify(v,null,2),{flag:'wx',flush:true});
function run(args, file) {
  return new Promise((resolveRun,reject) => {
    const fd=openSync(file,'wx');
    const child=spawn(restic,['--repo',repository,'--password-file',passwordFile,'--cache-dir',join(dirname(repository),'cache'),...args],{stdio:['ignore',fd,fd],windowsHide:true});
    child.once('error',e=>{closeSync(fd);reject(e);});
    child.once('exit',code=>{closeSync(fd);code===0?resolveRun():reject(Error('restic exit '+code+'; see '+file));});
  });
}
const gates=[];let ownsLock=false;
try {
  for(const p of [data,application,capture,repository,passwordFile])noLinks(p);
  for(const root of [data,application]) if(norm(capture).toLowerCase().startsWith(norm(root).toLowerCase()+'/'))throw Error('Capture must be outside live data/application.');
  if(existsSync(capture))throw Error('Capture directory already exists; use a fresh name.');
  mkdirSync(capture,{recursive:true});
  const lock=join(data,'.disaster-backup.lock');
  writeFileSync(lock,String(process.pid),{flag:'wx'});ownsLock=true;
  log('inventory');
  const tree=scan(data),app=scan(application,true);
  const databases=[...tree.files.keys()].filter(p=>/\.(sqlite3?|db)$/i.test(p)).sort();
  const mainPath=join(data,'db','heartword.sqlite');
  if(!databases.includes(mainPath))throw Error('Main database missing.');
  const physicalGates=new Map(), pathGates=new Map(),physicalCounts=new Map();
  for(const p of databases){const s=statSync(p,{bigint:true}),key=s.dev+':'+s.ino;physicalCounts.set(key,(physicalCounts.get(key)??0)+1);}
  for(const p of databases){
    try {
      // Historical revision packages contain hardlinked database aliases.
      // Reserve each physical file once, while preserving every saved path.
      const s=statSync(p,{bigint:true}),key=s.dev+':'+s.ino;
      let db=physicalGates.get(key);
      if(!db){db=new DatabaseSync(toNamespacedPath(p));gates.push(db);db.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE;');physicalGates.set(key,db);}
      if(physicalCounts.get(key)>1&&db.prepare('PRAGMA journal_mode').get().journal_mode==='wal')throw Error('Hardlinked WAL database requires canonical-path review.');
      pathGates.set(p,db);
    }
    catch(e){throw Error('Cannot reserve '+relative(data,p)+': '+e.message);}
  }
  const main=pathGates.get(mainPath);
  for(const [table,status] of [['production_runs','running'],['stage_executions','running'],['video_generation_jobs','active'],['directed_video_jobs','running']]) {
    if(main.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) && main.prepare(`SELECT 1 FROM ${table} WHERE status=? LIMIT 1`).get(status))throw Error('Production active in '+table);
  }
  const excluded=new Set([...tree.excluded,...app.excluded,...databases,...databases.flatMap(p=>['-wal','-shm','-journal'].map(s=>p+s))]);
  const stable = files => [...files].filter(([p])=>!excluded.has(p));
  const baseline=stable(scan(data).files), appBaseline=[...app.files];
  const dbReport=[];
  for(let i=0;i<databases.length;i++){
    const source=databases[i], dest=join(capture,'sqlite',relative(data,source));
    mkdirSync(dirname(dest),{recursive:true});
    const reader=new DatabaseSync(toNamespacedPath(source),{readOnly:true});
    try {await backup(reader,toNamespacedPath(dest));}finally{reader.close();}
    const copy=new DatabaseSync(toNamespacedPath(dest));
    try{
      // Normalize only the new snapshot so recovery needs no WAL/SHM sidecars.
      copy.exec('PRAGMA journal_mode=DELETE;');
      const integrity=copy.prepare('PRAGMA integrity_check').all(),foreignKeys=copy.prepare('PRAGMA foreign_key_check').all();
      if(JSON.stringify(integrity)!==JSON.stringify([{integrity_check:'ok'}]) || foreignKeys.length)throw Error('Database check failed: '+relative(data,source));
      dbReport.push({relativePath:relative(data,source).replaceAll('\\','/'),bytes:statSync(dest).size,integrity:'ok',foreignKeyIssues:0});
    }finally{copy.close();}
    if(i%10===0)log('database-snapshots',{completed:i+1,total:databases.length});
  }
  json(join(capture,'capture.json'),{format:'heartword-restic-sqlite-overlay-v1',startedAt:new Date().toISOString(),dataRoot:data,applicationRoot:application,sqliteOverlayRoot:join(capture,'sqlite'),tag,databases:dbReport,excluded:[...excluded],dataFiles:baseline.length,applicationFiles:appBaseline.length,notes:['Native restic snapshot contains ordinary data files and application source at their original paths. Raw SQLite files/journals are excluded; restore capture/sqlite over restored HeartWordData using relative paths.','Credentials and installed software require separate recovery. Cloud upload is not established by this local external-disk backup.']});
  json(join(capture,'source-inventory.json'),{data:baseline,application:appBaseline});
  // Backup exclusions match native drive-qualified paths, unlike restic ls paths.
  writeFileSync(join(capture,'excludes.txt'),[...excluded].map(norm).join('\n')+'\n',{flag:'wx'});
  const roots=[data,capture,...appNames.map(n=>join(application,n)).filter(existsSync)];
  writeFileSync(join(capture,'roots.txt'),roots.join('\n')+'\n',{flag:'wx'});
  if(!existsSync(passwordFile)){
    mkdirSync(dirname(passwordFile),{recursive:true});
    writeFileSync(passwordFile,randomBytes(48).toString('base64')+'\n',{flag:'wx',mode:0o600});
    const localKey=resolve(process.env.USERPROFILE??'.','.config','HeartWordBackup','restic-password.txt');
    mkdirSync(dirname(localKey),{recursive:true});
    if(existsSync(localKey))throw Error('Local recovery key already exists; inspect before replacement.');
    copyFileSync(passwordFile,localKey);
  }
  if(!existsSync(join(repository,'config'))){mkdirSync(dirname(repository),{recursive:true});await run(['init'],join(capture,'restic-init.log'));}
  // Logs must stay outside capture while restic reads it.
  const externalLog=join(dirname(capture),basename(capture)+'-restic.jsonl');
  log('restic-backup',{files:baseline.length,databases:databases.length,log:externalLog});
  const backupArgs=['backup','--json','--tag',tag,'--group-by','host,tags','--read-concurrency','4','--files-from-verbatim',join(capture,'roots.txt'),'--exclude-file',join(capture,'excludes.txt')];
  if(options.parent)backupArgs.push('--parent',options.parent);
  await run(backupArgs,externalLog);
  if(JSON.stringify(stable(scan(data).files))!==JSON.stringify(baseline) || JSON.stringify([...scan(application,true).files])!==JSON.stringify(appBaseline))throw Error('Source changed during capture; do not use this snapshot for cleanup.');
  const lines=readFileSync(externalLog,'utf8').trim().split(/\r?\n/).map(s=>{try{return JSON.parse(s);}catch{return {};}});
  const summary=lines.findLast(v=>v.message_type==='summary');
  if(!summary?.snapshot_id)throw Error('Missing restic snapshot completion.');
  const success={state:'captured-not-yet-restore-verified',snapshotId:summary.snapshot_id,completedAt:new Date().toISOString(),sourceStable:true,files:baseline.length,databases:dbReport.length,summary};
  json(join(dirname(capture),basename(capture)+'-result.json'),success);log('captured',success);
} catch(e) {log('failed',{error:e.message});process.exitCode=1;}
finally {for(const db of gates.reverse()){try{if(db.isTransaction)db.exec('ROLLBACK');}finally{db.close();}}if(ownsLock)unlinkSync(join(data,'.disaster-backup.lock'));}
