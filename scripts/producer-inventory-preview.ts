/** Read-only browser demonstration using actual HeartWord data and the same
 * inventory/discussion/producer projections as the normal server. No migration,
 * seed, provider, production dispatch or writable DB connection is opened.
 * Run: npx tsx scripts/producer-inventory-preview.ts C:/Users/danbr/HeartWordData
 */
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import express from 'express';
import {readChapterInventory} from '../src/server/chapter-inventory.js';
import {readChapterDiscussion} from '../src/server/chapter-discussion.js';
import {readProductionView} from '../src/server/production-view.js';
import {PRODUCTION_CREW} from '../src/server/production-crew.js';
const root=resolve(process.argv[2]??'C:/Users/danbr/HeartWordData');
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
const db=new DatabaseSync(join(root,'db','heartword.sqlite'),{readOnly:true});db.exec('PRAGMA query_only=ON');
globalThis.fetch=(async()=>{throw new Error('Provider/network calls disabled in read-only preview.');}) as typeof fetch;
const app=express();
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');if(req.path.startsWith('/api')&&req.method!=='GET'){res.status(403).json({error:'Read-only real-data preview. Use the normal HeartWord server for saved edits/production controls.'});return;}next();});
app.get('/api/projects',(_req,res)=>res.json({projects:db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()}));
app.get('/api/characters',(_req,res)=>res.json({characters:db.prepare(`SELECT c.*,cv.version_label,cv.status version_status,cv.voice_provider,cv.voice_id,(SELECT COUNT(*) FROM audio_segments a WHERE a.speaker_character_id=c.id AND a.layer='original_reading') spoken_segment_count FROM characters c LEFT JOIN character_versions cv ON cv.character_id=c.id GROUP BY c.id HAVING cv.created_at=MAX(cv.created_at) OR cv.created_at IS NULL ORDER BY c.name`).all()}));
app.get('/api/control-room/roster',(_req,res)=>res.json({roster:PRODUCTION_CREW}));
app.get('/api/projects/inventory',(req,res)=>{try{res.json(readChapterInventory(db,root,String(req.query.language??'hatam'),String(req.query.book??'mark')));}catch(error){res.status(503).json({error:(error as Error).message});}});
app.get('/api/projects/:projectId/production/discussion',(req,res)=>{try{res.json(readChapterDiscussion(db,req.params.projectId));}catch(error){res.status(503).json({error:(error as Error).message});}});
app.get('/api/projects/:projectId/production/view',(req,res)=>{try{res.json(readProductionView(db,root,req.params.projectId));}catch(error){res.status(503).json({error:(error as Error).message});}});
app.use('/api',(_req,res)=>res.status(503).json({error:'Read-only real-data preview exposes inspection endpoints only. Existing edit/provider controls are available through the normal HeartWord server.'}));
app.get('/',(_req,res)=>res.type('html').send(readFileSync('dist/web/index.html','utf8').replace('<body>','<body><aside style="padding:8px 14px;background:#153f38;color:#bde4d4;font:12px system-ui;border-bottom:1px solid #5c9b87">REAL HEARTWORD CHAPTER DATA · read-only preview · production edits/provider calls disabled in this demonstration.</aside>')));
app.use('/media',express.static(join(root,'assets')));app.use(express.static('dist/web'));
app.listen(4027,'127.0.0.1',()=>console.log('Real-data chapter inventory: http://127.0.0.1:4027 (query_only; no migration or providers)'));
