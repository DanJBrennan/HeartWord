/** Local cutover evidence. Never starts a stage or calls a provider. */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
const {DatabaseSync,backup}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const mode=process.argv[2],root=resolve(process.argv[3]??'C:/Users/danbr/HeartWordData');
const dbPath=join(root,'db','heartword.sqlite');
const quote=(s:string)=>`"${s.replaceAll('"','""')}"`;
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
function snapshot(prior?:Record<string,{columns:string[]}>,assetRoot=root) {
  const db=new DatabaseSync(dbPath,{readOnly:true});db.exec('PRAGMA query_only=ON');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{name:string}>;
  const records=Object.fromEntries(tables.map(({name})=>{
    const columns=prior?.[name]?.columns??(db.prepare(`PRAGMA table_info(${quote(name)})`).all() as Array<{name:string}>).map(c=>c.name);
    const rows=db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`).all().map(row=>JSON.stringify(row,(_key,value)=>typeof value==='bigint'?value.toString():value)).sort();
    return [name,{columns,rows:rows.length,sha256:hash(rows.join('\n'))}];
  }));
  const foreignKeys=db.prepare('PRAGMA foreign_key_check').all().map(row=>JSON.stringify(row)).sort();
  const renders=db.prepare('SELECT id,result_asset_path FROM chapter_renders ORDER BY id').all().map(row=>{const path=join(assetRoot,'assets',String(row.result_asset_path));return {...row,...(existsSync(path)?{bytes:statSync(path).size,modifiedMs:statSync(path).mtimeMs}:{missing:true})};});
  db.close();return {databaseHash:hash(readFileSync(dbPath)),records,foreignKeys,renders};
}
if(mode==='baseline') {
  const baseline=snapshot();
  const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),backupRoot=join(root,'backups',`normal-interface-${stamp}`);
  mkdirSync(join(backupRoot,'db'),{recursive:true});
  const reader=new DatabaseSync(dbPath,{readOnly:true});try{await backup(reader,join(backupRoot,'db','heartword.sqlite'));}finally{reader.close();}
  writeFileSync('outputs/normal-interface-baseline.json',JSON.stringify({root,backupRoot,...baseline},null,2));
  console.log(JSON.stringify({backupRoot,tables:Object.keys(baseline.records).length,renders:baseline.renders.length}));
} else if(mode==='inspect') {
  const baseline=JSON.parse(readFileSync('outputs/normal-interface-baseline.json','utf8'));
  const after=snapshot(baseline.records,baseline.root);
  const changed=Object.keys(baseline.records).filter(name=>baseline.records[name].sha256!==after.records[name]?.sha256);
  const additions=Object.keys(after.records).filter(name=>!baseline.records[name]);
  const permitted=['control_room_presentation_briefs','control_room_red_team_findings'];
  const result={root,changedExistingTables:changed,productionRecordsUnchanged:changed.every(name=>permitted.includes(name)),newTables:additions.map(name=>({name,rows:after.records[name]!.rows})),foreignKeysUnchanged:JSON.stringify(baseline.foreignKeys)===JSON.stringify(after.foreignKeys),rendersUnchanged:JSON.stringify(baseline.renders)===JSON.stringify(after.renders),retainedRenders:after.renders.length,after};
  writeFileSync(process.argv[4]??'outputs/normal-interface-preservation.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,after:undefined}));
  if(!result.productionRecordsUnchanged||!result.foreignKeysUnchanged||!result.rendersUnchanged)process.exitCode=1;
} else throw new Error('Choose baseline or inspect.');
