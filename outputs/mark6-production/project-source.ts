import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {getDb} from '../../src/db/client.js';
import {parseSourceTextByVerse,parseSourceHeadings} from '../../src/pipeline/ingestion/parse-source-text.js';
import {resolveAndBindSourcePaths} from '../../src/pipeline/ingestion/source-catalog.js';
import {confirmContinuousSpeech} from '../../src/pipeline/ingestion/continuous-speech.js';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),root='outputs/mark6-production';
if(existsSync(root+'/source-projection.json'))throw Error('Projection already retained; do not replay.');
const projectId=read(root+'/workspace.json').projectId,db=getDb(),project=db.prepare('SELECT id,language,book,chapter FROM projects WHERE id=?').get(projectId) as any;
const paths=resolveAndBindSourcePaths(db,project),verses=parseSourceTextByVerse(paths.docxPath),headings=parseSourceHeadings(paths.docxPath);
const norm=(s:string)=>s.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu)??[];
const tokens=verses.flatMap(v=>norm(v.text).map(word=>({word,verse:v.verse}))),quotes=read('outputs/mark6-preparation/voice-queue-v1/manifest.json').entries;
let cursor=0;
for(const q of quotes){const words=norm(q.exactHatam);let found=-1;for(let i=cursor;i<=tokens.length-words.length;i++)if(words.every((word,j)=>tokens[i+j].word===word)){found=i;break;}
 if(found<0)throw Error('Quote not in canonical source order: '+q.id);q.tokenStart=found;q.tokenEnd=found+words.length;cursor=q.tokenEnd;}
const old=db.prepare("SELECT * FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms").all(projectId) as any[];
if(old.length!==88||db.prepare('SELECT id FROM scenes WHERE project_id=? LIMIT 1').get(projectId)||db.prepare('SELECT id FROM edit_commands WHERE project_id=? LIMIT 1').get(projectId))throw Error('Unexpected existing downstream work.');
const rows:any[]=[];
const ref=(start:number,end:number)=>`Mark 6:${start}${end!==start?'-'+end:''}`;
const add=(s:number,e:number,verseRef:string|null,characterId:string|null,kind:string,quoteId?:string)=>{if(e>s)rows.push({id:randomUUID(),startMs:s,endMs:e,verseRef,characterId,kind,quoteId});};
add(0,4823,null,null,'original_spoken_title_and_quiet');
let time=4823,word=0;
function narration(end:number,endWord:number){if(end<=time)return;const from=tokens[Math.min(word,tokens.length-1)].verse,to=tokens[Math.max(word,endWord-1)].verse;
 // Preserve existing approximate pericope timing without asserting exact word
 // edges. Every source sample remains in one interval, including all gaps.
 let last=time,firstVerse=from;
 for(const h of headings.filter(h=>h.verseStart>from&&h.verseStart<=to)){
  const anchor=old.find(r=>r.verse_ref?.match(/:(\d+)/)?.[1]===String(h.verseStart));
  if(anchor&&anchor.start_ms>last&&anchor.start_ms<end){add(last,anchor.start_ms,ref(firstVerse,h.verseStart-1),null,'narration_approximate_heading_edge');last=anchor.start_ms;firstVerse=h.verseStart;}}
 add(last,end,ref(firstVerse,to),null,'narration');}
for(const q of quotes){const s=q.sourceWindow.startSample/24,e=q.sourceWindow.endSample/24;if(s<time)throw Error('Overlapping quotes');narration(s,q.tokenStart);add(s,e,q.verse,q.characterId??null,q.characterId?'actor_quote':'approved_narrator_report',q.id);time=e;word=q.tokenEnd;}
narration(796680,tokens.length);
if(rows[0].startMs!==0||rows.at(-1).endMs!==796680||rows.some((r,i)=>i&&r.startMs!==rows[i-1].endMs))throw Error('Source coverage is not exact and continuous.');
writeFileSync(root+'/source-projection-before.json',JSON.stringify({projectId,originalRows:old},null,2),{flag:'wx'});
db.exec('BEGIN IMMEDIATE');
try{db.prepare("DELETE FROM audio_segments WHERE project_id=? AND layer='original_reading'").run(projectId);
 const insert=db.prepare("INSERT INTO audio_segments(id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES (?,?,'original_reading',?,?,?,?,?,?,?)");
 for(const r of rows)insert.run(r.id,projectId,paths.audioRelPath,r.startMs,r.endMs,r.characterId,r.verseRef,r.kind==='actor_quote'?89:70,Date.now());
 for(const r of rows.filter(r=>r.verseRef))confirmContinuousSpeech(db,{projectId,audioSegmentIds:[r.id],characterId:r.characterId,verseRef:r.verseRef,internalVerseTiming:'unresolved',reviewerName:'HeartWord automated source preparation',evidence:`Source-order canonical token match plus retained original audio. ${r.quoteId??'Narration between evidenced quote edges'}. All source samples retained; internal word/verse timing approximate or unresolved. Dan authorized production using prepared sources; no native or personal listening attestation inferred.`,idempotencyKey:'mark6-production-source-'+r.id});
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
writeFileSync(root+'/source-projection.json',JSON.stringify({projectId,rows,canonicalWords:tokens.length,originalReadingFrames:19120320,sourceDurationMs:796680,nativeAttestation:false,internalVerseTiming:'unresolved',quotes:quotes.map((q:any)=>({id:q.id,tokenStart:q.tokenStart,tokenEnd:q.tokenEnd}))},null,2),{flag:'wx'});
console.log(JSON.stringify({rows:rows.length,sourceDurationMs:796680,canonicalWords:tokens.length,nativeAttestation:false}));
