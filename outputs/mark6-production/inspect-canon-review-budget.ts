import {readFileSync} from 'node:fs';
import {getDb,getDataDir} from '../../src/db/client.js';
import {canonReferenceMedia} from '../../src/pipeline/creative-direction/visual-reference-media.js';
const id=JSON.parse(readFileSync('outputs/mark6-production/workspace.json','utf8')).projectId,db=getDb(),run=db.prepare('SELECT brief_json FROM production_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 1').get(id) as {brief_json:string};
const brief=JSON.parse(run.brief_json),media=canonReferenceMedia(db,getDataDir(),brief,{compact:process.argv.includes("--compact")});
console.log(JSON.stringify({images:media.length,totalMiB:media.reduce((n,m)=>n+Buffer.byteLength(m.data,'base64'),0)/1048576,imagesByCaption:media.map(m=>({caption:m.caption,MiB:Buffer.byteLength(m.data,'base64')/1048576})),maxCharactersInSingleShot:Math.max(...brief.shots.map((s:any)=>s.characterIds.length))}));
