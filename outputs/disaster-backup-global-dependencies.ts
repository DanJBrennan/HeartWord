import {createRequire} from 'node:module';
import {existsSync,statSync,writeFileSync} from 'node:fs';
import {isAbsolute,relative,resolve} from 'node:path';
import {productionRecords} from '../src/pipeline/assembly/chapter-package.js';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
const root='C:/Users/danbr/HeartWordData',db=new DatabaseSync(root+'/db/heartword.sqlite',{readOnly:true});
const outside=new Map<string,Set<string>>();
function inspect(value:unknown,context:string){if(typeof value==='string'){
 if(isAbsolute(value)&&/\.(mp4|mov|mkv|webm|wav|mp3|flac|m4a|aac|ogg|png|jpe?g|webp|blend\d*|docx|json|py|ttf|otf|vdb|abc)$/i.test(value)&&relative(root,resolve(value)).startsWith('..')){const refs=outside.get(value)??new Set();refs.add(context);outside.set(value,refs);}
 else if(value.startsWith('{')||value.startsWith('['))try{inspect(JSON.parse(value),context);}catch{}
}else if(Array.isArray(value))value.forEach((child,i)=>inspect(child,`${context}[${i}]`));else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))if(!/^(imported_from|sourceRoot|originalPath|sourceOriginal|url|uri)$/.test(key))inspect(child,`${context}.${key}`);}
const records=productionRecords(db);for(const [name,rows] of Object.entries(records.tables))for(const row of rows)inspect(row,`${name}:${row.id??row.project_id??''}`);db.close();
const report={tables:Object.keys(records.tables).length,outsideData:[...outside].map(([path,refs])=>({path,present:existsSync(path)&&statSync(path).isFile(),references:[...refs]}))};
writeFileSync('outputs/disaster-backup-global-dependencies.json',JSON.stringify(report,null,2));console.log(JSON.stringify({tables:report.tables,outsideReferencedPaths:report.outsideData.length,presentOutsideReferencedPaths:report.outsideData.filter(p=>p.present).map(p=>p.path)},null,2));
