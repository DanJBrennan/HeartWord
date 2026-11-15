import {createRequire} from 'node:module';
import {resolve,isAbsolute} from 'node:path';
import {readFileSync} from 'node:fs';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
const directory='C:/Users/danbr/HeartWordBackupStaging/20261007-first';
const manifest=JSON.parse(readFileSync(directory+'/backup.json','utf8'));
const refs=new Map(manifest.references.map(([old,path])=>[old,path.startsWith('assets/')?path.slice(7):path]));
for(const f of manifest.files.filter(f=>f.path.startsWith('data/'))){const rel=f.path.slice(5);refs.set(resolve(manifest.sourceRoot,rel),rel.startsWith('assets/')?rel.slice(7):rel);}
const db=new DatabaseSync(directory+'/data/db/heartword.sqlite',{readOnly:true});const groups=new Map();
for(const row of db.prepare('select id,asset_path from media_library_items').all()){const projected=refs.get(row.asset_path)??row.asset_path;const list=groups.get(projected)??[];list.push(row);groups.set(projected,list);}
console.log(JSON.stringify([...groups].filter(([p,rows])=>rows.length>1),null,2));db.close();
