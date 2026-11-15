// Run from the HeartWord repository with:
// $env:HEARTWORD_RESTIC_EXE='<restic executable>'
// node --test tests/assembly/restic-backup.integration.mjs
// Uses real restic and isolated temporary fixtures; never production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync,linkSync,rmSync} from 'node:fs';
import {join,resolve,relative,sep,basename,toNamespacedPath} from 'node:path';
import {tmpdir} from 'node:os';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
const executable=process.env.HEARTWORD_RESTIC_EXE;
const helper=resolve('scripts/backup-restic-current.mjs');
const enabled=process.platform==='win32'&&executable&&existsSync(executable);
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'heartword-restic-integration-'));
 const data=join(root,'data'),app=join(root,'app'),repo=join(root,'repo'),password=join(root,'password.txt');
 mkdirSync(join(data,'db'),{recursive:true});mkdirSync(join(app,'src'),{recursive:true});
 writeFileSync(password,randomBytes(32).toString('base64')+'\n');
 writeFileSync(join(data,'rejected-take.mp4'),'Retained rejected take bytes');
 writeFileSync(join(data,'.env'),'FIXTURE_SECRET=not-backed-up');
 writeFileSync(join(app,'.env'),'FIXTURE_SECRET=not-backed-up');
 writeFileSync(join(app,'.env.example'),'FIXTURE_SECRET=\n');
 writeFileSync(join(app,'src','saved.js'),'// Uncommitted runtime source');
 const db=new DatabaseSync(join(data,'db','heartword.sqlite'));
 db.exec("PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;CREATE TABLE saved(value TEXT);INSERT INTO saved VALUES('Exact committed WAL state');");
 t.after(()=>{
  db.close();
  const temp=resolve(tmpdir()),target=resolve(root);
  if(!target.startsWith(temp+sep)||!basename(target).startsWith('heartword-restic-integration-'))throw Error('Unsafe fixture cleanup path.');
  rmSync(target,{recursive:true,force:true});
 });
 const run=(capture='capture',extra=[])=>spawnSync(process.execPath,[helper,'--data',data,'--app',app,'--capture',join(root,capture),'--repo',repo,'--password',password,'--restic',executable,'--tag','heartword-integration',...extra],{encoding:'utf8',timeout:120000,windowsHide:true});
 const restic=args=>spawnSync(executable,['--repo',repo,'--password-file',password,...args],{encoding:'utf8',timeout:120000,windowsHide:true});
 return {root,data,app,repo,password,db,run,restic};
}
test('real restic preserves committed WAL rows, historical hardlink aliases, media and source while excluding secrets',{skip:!enabled},t=>{
 const f=fixture(t),history=join(f.data,'db','history.sqlite');
 const old=new DatabaseSync(history);old.exec("CREATE TABLE history(value TEXT);INSERT INTO history VALUES('Retain historical state');");old.close();
 linkSync(history,join(f.data,'db','history-alias.sqlite'));
 const captured=f.run();assert.equal(captured.status,0,captured.stdout+captured.stderr);
 const result=JSON.parse(readFileSync(join(f.root,'capture-result.json'),'utf8'));assert.equal(result.sourceStable,true);assert.equal(result.databases,3);
 const checked=f.restic(['check','--read-data']);assert.equal(checked.status,0,checked.stdout+checked.stderr);
 const target=join(f.root,'restored'),snapshotPath=p=>'/'+resolve(p).replace(/^([A-Za-z]):/,'$1').replaceAll('\\','/');
 const sourceRoots={data:f.data,app:f.app,capture:join(f.root,'capture')};
 // Restore actual application subtrees, not protected C:\\Users ancestor metadata.
 for(const [name,source]of Object.entries(sourceRoots)){
  const restored=f.restic(['restore',result.snapshotId+':'+snapshotPath(source),'--target',join(target,name),'--verify']);
  assert.equal(restored.status,0,restored.stdout+restored.stderr);
 }
 const restoredPath=p=>{
  for(const [name,source]of Object.entries(sourceRoots))if(p===source||p.startsWith(source+sep))return join(target,name,relative(source,p));
  throw Error('Unrecognized fixture path '+p);
 };
 assert.equal(readFileSync(restoredPath(join(f.data,'rejected-take.mp4')),'utf8'),'Retained rejected take bytes');
 assert.equal(readFileSync(restoredPath(join(f.app,'src','saved.js')),'utf8'),'// Uncommitted runtime source');
 assert.equal(existsSync(restoredPath(join(f.data,'.env'))),false);assert.equal(existsSync(restoredPath(join(f.app,'.env'))),false);
 assert.equal(existsSync(restoredPath(join(f.app,'.env.example'))),true);
 assert.equal(existsSync(restoredPath(join(f.data,'db','heartword.sqlite'))),false);
 for(const [name,table,value]of [['heartword.sqlite','saved','Exact committed WAL state'],['history.sqlite','history','Retain historical state'],['history-alias.sqlite','history','Retain historical state']]){
  const p=restoredPath(join(f.root,'capture','sqlite','db',name)),copy=new DatabaseSync(toNamespacedPath(p),{readOnly:true});
  try{assert.equal(copy.prepare(`SELECT value FROM ${table}`).get().value,value);assert.equal(copy.prepare('PRAGMA journal_mode').get().journal_mode,'delete');}finally{copy.close();}
  assert.equal(existsSync(p+'-wal'),false);assert.equal(existsSync(p+'-shm'),false);
 }
 assert.equal(existsSync(join(f.data,'.disaster-backup.lock')),false);
});
test('active production refuses capture and leaves the source and prior state intact',{skip:!enabled},t=>{
 const f=fixture(t);f.db.exec("CREATE TABLE production_runs(status TEXT);INSERT INTO production_runs VALUES('running');");
 const captured=f.run();assert.notEqual(captured.status,0);assert.match(captured.stdout,/Production active/);
 assert.equal(existsSync(join(f.root,'capture-result.json')),false);assert.equal(existsSync(join(f.repo,'config')),false);
 assert.equal(f.db.prepare('SELECT status FROM production_runs').get().status,'running');assert.equal(existsSync(join(f.data,'.disaster-backup.lock')),false);
});
test('wrong repository credentials do not produce a successful capture or replace a prior snapshot',{skip:!enabled},t=>{
 const f=fixture(t),first=f.run();assert.equal(first.status,0,first.stdout+first.stderr);
 const result=JSON.parse(readFileSync(join(f.root,'capture-result.json'),'utf8')),originalKey=readFileSync(f.password,'utf8');
 writeFileSync(f.password,randomBytes(32).toString('base64')+'\n');
 const failed=f.run('wrong-key-capture');assert.notEqual(failed.status,0);assert.equal(existsSync(join(f.root,'wrong-key-capture-result.json')),false);
 assert.equal(existsSync(join(f.data,'.disaster-backup.lock')),false);assert.equal(readFileSync(join(f.data,'rejected-take.mp4'),'utf8'),'Retained rejected take bytes');
 writeFileSync(f.password,originalKey);
 const snapshots=f.restic(['snapshots','--json']);assert.equal(snapshots.status,0,snapshots.stderr);assert(JSON.parse(snapshots.stdout).some(s=>s.id===result.snapshotId));
});

test('explicit incremental parent preserves earlier snapshots and changed media',{skip:!enabled},t=>{
 const f=fixture(t);const first=f.run();assert.equal(first.status,0,first.stdout+first.stderr);
 const old=JSON.parse(readFileSync(join(f.root,'capture-result.json'),'utf8'));
 writeFileSync(join(f.data,'new-take.mp4'),'New recoverable take');
 const second=f.run('next-capture',['--parent',old.snapshotId,'--tag','heartword-integration-next']);assert.equal(second.status,0,second.stdout+second.stderr);
 const next=JSON.parse(readFileSync(join(f.root,'next-capture-result.json'),'utf8'));
 const snapshots=f.restic(['snapshots','--json']);const saved=JSON.parse(snapshots.stdout);
 assert(saved.some(s=>s.id===old.snapshotId));assert(saved.some(s=>s.id===next.snapshotId));
 const listed=f.restic(['ls','--json',next.snapshotId]);assert.match(listed.stdout,/new-take\.mp4/);
});

test('hardlinked WAL aliases refuse capture rather than mixing separate WAL histories',{skip:!enabled},t=>{
 const f=fixture(t);linkSync(join(f.data,'db','heartword.sqlite'),join(f.data,'db','wal-alias.sqlite'));
 const result=f.run();assert.notEqual(result.status,0);assert.match(result.stdout,/Hardlinked WAL database/);
 assert.equal(existsSync(join(f.root,'capture-result.json')),false);assert.equal(existsSync(join(f.data,'.disaster-backup.lock')),false);
});

test('scheduled supplement and independent verifier restore every external file and database',{skip:!enabled},t=>{
 const f=fixture(t),external=join(f.root,'outside.mp4');writeFileSync(external,'Outside media preserved');
 f.db.prepare('INSERT INTO saved VALUES(?)').run(JSON.stringify({file:external}));
 const captured=f.run();assert.equal(captured.status,0,captured.stdout+captured.stderr);
 const common=['--capture',join(f.root,'capture'),'--restic',executable,'--repo',f.repo,'--password',f.password];
 for(const script of ['backup-restic-external.mjs','backup-restic-verify.mjs']){const r=spawnSync(process.execPath,[resolve('scripts',script),...common],{encoding:'utf8',timeout:120000,windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);}
 const proof=JSON.parse(readFileSync(join(f.root,'verified.json'),'utf8'));assert.equal(proof.passed,true);assert.equal(proof.externalFiles,1);assert.equal(proof.databases,1);
});

test('scheduled scratch cleanup rejects paths outside its exact D run namespace',{skip:!enabled},t=>{
 const f=fixture(t),result=spawnSync(process.execPath,[resolve('scripts/backup-restic-clean-run.mjs'),f.root],{encoding:'utf8',timeout:10000,windowsHide:true});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Unexpected backup scratch directory/);
 assert.equal(readFileSync(join(f.data,'rejected-take.mp4'),'utf8'),'Retained rejected take bytes');
});
