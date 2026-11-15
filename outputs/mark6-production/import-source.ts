import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {getDb} from '../../src/db/client.js';
import {alignmentKey} from '../../src/pipeline/ingestion/gemini-alignment.js';
import {parseSourceTextByVerse,parseChapterTitle} from '../../src/pipeline/ingestion/parse-source-text.js';
import {resolveAndBindSourcePaths} from '../../src/pipeline/ingestion/source-catalog.js';
import {runIngestionWithAlignment} from '../../src/pipeline/ingestion/index.js';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const root=resolve('outputs/mark6-production'), projectId=read(root+'/workspace.json').projectId;
const db=getDb(),project=db.prepare('SELECT id,language,book,chapter FROM projects WHERE id=?').get(projectId) as any;
if(db.prepare('SELECT id FROM audio_segments WHERE project_id=? LIMIT 1').get(projectId))throw Error('Import already has source rows; reconcile instead of replacing.');
const paths=resolveAndBindSourcePaths(db,project),evidence=read('outputs/mark6-preparation/alignment-current-preparation.json');
if(evidence.localPlacementCoverage!==evidence.result.coverage)throw Error('Coverage mismatch');
const key=alignmentKey(paths.audioPath,parseSourceTextByVerse(paths.docxPath),undefined,parseChapterTitle(paths.docxPath,6)??'');
db.prepare('INSERT INTO alignment_evidence(project_id,source_hash,model,result_json,status,created_at) VALUES (?,?,?,?,?,?)').run(projectId,key,evidence.result.model,JSON.stringify(evidence.result),'critical_hold',Date.now());
// Fail closed if ingestion would try to purchase fresh alignment. All earlier
// results remain provisional; no confidence or human attestation is invented.
const result=await runIngestionWithAlignment(projectId,async()=>{throw Error('New alignment requests are not authorized.');});
const segments=db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(projectId);
writeFileSync(root+'/source-import.json',JSON.stringify({projectId,result,sourceEvidence:key,segments,nativeAttestation:false},null,2));
console.log(JSON.stringify({result,segments:segments.length}));
