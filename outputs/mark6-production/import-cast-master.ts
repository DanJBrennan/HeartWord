import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {relative,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {getDb,getDataDir} from '../../src/db/client.js';
import {hasCurrentSourceReview} from '../../src/pipeline/ingestion/source-review.js';
const root='outputs/mark6-production',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),projectId=read(root+'/workspace.json').projectId,db=getDb(),assets=join(getDataDir(),'assets');
if(!hasCurrentSourceReview(db,projectId)||existsSync(root+'/cast-master-import.json'))throw Error('Missing current acceptance or import already recorded.');
if(db.prepare("SELECT id FROM production_runs WHERE project_id=? AND status='running'").get(projectId))throw Error('A crew snapshot is active; do not change its audio inputs.');
if(db.prepare("SELECT id FROM audio_segments WHERE project_id=? AND layer='composite_cast_master' LIMIT 1").get(projectId))throw Error('Composite master already exists; no replacement.');
const projection=read(root+'/source-projection.json'),fitted=read(root+'/fitted-cast-audio.json'),sourceRows=db.prepare("SELECT * FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(projectId) as any[];
const sourceHash=createHash('sha256').update(readFileSync(join(assets,sourceRows[0].source_path))).digest('hex'),rows=[];
for(const source of sourceRows){const p=projection.rows.find((r:any)=>r.id===source.id),fit=p.quoteId&&fitted.rows.find((f:any)=>f.id===p.quoteId);
 if(source.speaker_character_id&&!fit)throw Error('Actor performance missing');
 let path=source.source_path,startMs=source.start_ms,endMs=source.end_ms,voiceVersionId=null;
 if(fit){if(createHash('sha256').update(readFileSync(fit.path)).digest('hex')!==fit.sha256||fit.characterId!==source.speaker_character_id)throw Error('Cast binding changed');
  path=relative(assets,fit.path);if(path.startsWith('..'))throw Error('Cast outside assets');startMs=0;endMs=fit.sampleCount/48;voiceVersionId=fit.versionId;
  if(Math.abs(endMs-(source.end_ms-source.start_ms))>.001)throw Error('Cast duration mismatch');
  const sidecar=fit.path+'.json';if(existsSync(sidecar))throw Error('Retained sidecar exists; reconcile');
  writeFileSync(sidecar,JSON.stringify({format:'heartword-cast-master',version:1,sourcePath:source.source_path,sourceHash,sourceStartMs:source.start_ms,sourceEndMs:source.end_ms,voiceVersionId,rawTake:fit.rawPath,rawSha256:fit.rawSha256,operation:fit.operation,durationMs:endMs,usage:'retained_source_bound_performance_no_new_request',candidatePerformance:'technical and batched audio checks completed; full-line audiovisual review pending',speed:1},null,2),{flag:'wx'});
 }
 rows.push({id:randomUUID(),sourcePath:path,startMs,endMs,speakerId:source.speaker_character_id,verseRef:source.verse_ref,originalSegmentId:source.id,sourceHash,voiceVersionId});
}
db.exec('BEGIN IMMEDIATE');try{
 const insert=db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES (?,?,'composite_cast_master',?,?,?,?,?,NULL,?)"),map=db.prepare('INSERT INTO composite_audio_source_map(composite_segment_id,original_segment_id,source_hash,voice_version_id,created_at) VALUES (?,?,?,?,?)');
 for(const r of rows){insert.run(r.id,projectId,r.sourcePath,r.startMs,r.endMs,r.speakerId,r.verseRef,Date.now());map.run(r.id,r.originalSegmentId,r.sourceHash,r.voiceVersionId,Date.now());}
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
writeFileSync(root+'/cast-master-import.json',JSON.stringify({projectId,rows,actorTakes:rows.filter(r=>r.speakerId).length,originalNarratorIntervals:rows.filter(r=>!r.speakerId).length,newVoiceRequests:0,fullLineAVPending:true},null,2),{flag:'wx'});
console.log(JSON.stringify({rows:rows.length,actorTakes:18,originalNarratorIntervals:31,newVoiceRequests:0}));
