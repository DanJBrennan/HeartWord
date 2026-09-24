import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, dataDir = "";
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => dataDir }));
const cleanup: string[] = [];
const originalGeminiKey=process.env.GEMINI_API_KEY;
afterEach(() => { if(originalGeminiKey===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=originalGeminiKey; db?.close(); cleanup.splice(0).forEach(path => rmSync(path, { recursive:true, force:true })); });
function docx(text: string | string[]): Buffer { const name=Buffer.from("word/document.xml"), lines=Array.isArray(text)?text:[text], bytes=Buffer.from(`<w:document>${lines.map(line=>`<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:document>`); const local=Buffer.alloc(30), central=Buffer.alloc(46), end=Buffer.alloc(22); local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50,0);central.writeUInt32LE(bytes.length,20);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+bytes.length,16);return Buffer.concat([local,name,bytes,central,name,end]); }

it("ingests an isolated new chapter from real fixture files then holds before invented scene planning", async () => {
  delete process.env.GEMINI_API_KEY;
  dataDir=mkdtempSync(join(tmpdir(),"hw-fresh-")); cleanup.push(dataDir); const assets=join(dataDir,"assets"), source=join(assets,"source","hatam","mark-3"); mkdirSync(source,{recursive:true});
  writeFileSync(join(source,"mark-3-text.docx"),docx("1Fresh approved source verse. 2Second approved source verse."));
  execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=1","-c:a","libmp3lame",join(source,"mark-3-fcbh-audio.mp3")]);
  db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('fresh','hatam','mark',3,1,1)");
  const {runPipeline}=await import("../../src/pipeline/orchestrator.js"); const result=await runPipeline("fresh");
  expect(result).toMatchObject({stoppedAt:"scene_breakdown"}); expect(result.results[1]!.reasoning).toContain("found 0 pericope headings");
  expect(db.prepare("SELECT COUNT(*) n FROM audio_segments WHERE project_id='fresh' AND layer='original_reading'").get()).toMatchObject({n:1});
  expect(db.prepare("SELECT COUNT(*) n FROM review_notes WHERE project_id='fresh' AND subject_type='project' AND resolved=0").get()).toMatchObject({n:0});
  expect(db.prepare("SELECT COUNT(*) n FROM scenes WHERE project_id='fresh'").get()).toMatchObject({n:0});
});

it("holds a confident text alignment when its source boundary cuts through renewed audio", async () => {
  process.env.GEMINI_API_KEY = "offline-injected-aligner";
  dataDir=mkdtempSync(join(tmpdir(),"hw-boundary-hold-")); cleanup.push(dataDir);
  const source=join(dataDir,"assets","source","hatam","mark-3");
  const reference=join(dataDir,"assets","reference","english","mark-3");
  mkdirSync(source,{recursive:true}); mkdirSync(reference,{recursive:true});
  writeFileSync(join(source,"mark-3-text.docx"),docx(["1First source verse.","2Second source verse."]));
  writeFileSync(join(reference,"mark-3-text.docx"),docx(["1First reference verse.","2Second reference verse."]));
  execFileSync("ffmpeg",["-v","error","-y",
    "-f","lavfi","-i","sine=frequency=190:duration=0.775:sample_rate=8000",
    "-f","lavfi","-i","anullsrc=r=8000:cl=mono:d=0.740",
    "-f","lavfi","-i","sine=frequency=190:duration=1.485:sample_rate=8000",
    "-filter_complex","[0:a][1:a][2:a]concat=n=3:v=0:a=1",
    "-c:a","libmp3lame",join(source,"mark-3-fcbh-audio.mp3")]);
  db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('fresh','hatam','mark',3,1,1)");
  const {runIngestionWithAlignment}=await import("../../src/pipeline/ingestion/index.js");
  const aligned={segments:[
    {startMs:0,endMs:1733,verseRef:"v1",text:"First source verse.",score:1,status:"matched",note:"Fixture text match."},
    {startMs:1733,endMs:3000,verseRef:"v2",text:"Second source verse.",score:1,status:"matched",note:"Fixture text match."}
  ],coverage:1,uncoveredVerses:[],model:"offline fixture",config:{fastModel:"fixture",strongModel:"fixture",maxSegmentMs:14000}};
  const result=await runIngestionWithAlignment("fresh",async()=>aligned as any);
  expect(result.ok).toBe(false);
  expect(result.reasoning).toContain("source activity crosses both sides");
  const segments=db.prepare("SELECT id,start_ms AS startMs,end_ms AS endMs,speaker_character_id AS speakerId,confidence FROM audio_segments WHERE project_id='fresh' AND layer='original_reading' ORDER BY start_ms").all() as Array<{id:string;startMs:number;endMs:number;speakerId:string|null;confidence:number}>;
  expect(segments).toHaveLength(2);
  expect(segments.map(segment=>segment.confidence)).toEqual([75,75]);
  expect(segments.map(segment=>[segment.startMs,segment.endMs,segment.speakerId])).toEqual([[0,1733,null],[1733,3000,null]]);
  const note=db.prepare("SELECT subject_id,note FROM review_notes WHERE project_id='fresh' AND subject_type='audio_segment' AND source='qc'").get() as {subject_id:string;note:string};
  expect(note.subject_id).toBe(segments[0]!.id);
  expect(note.note).toContain("quiet gap");
  expect(note.note).toContain(segments[1]!.id);
});

it("re-ingests safely when a correction targets a segment that also has a boundary override", async () => {
  delete process.env.GEMINI_API_KEY;
  dataDir=mkdtempSync(join(tmpdir(),"hw-fresh-reingest-")); cleanup.push(dataDir); const assets=join(dataDir,"assets"), source=join(assets,"source","hatam","mark-3"), reference=join(assets,"reference","english","mark-3"); mkdirSync(source,{recursive:true}); mkdirSync(reference,{recursive:true});
  writeFileSync(join(source,"mark-3-text.docx"),docx("1Fresh approved source verse."));
  writeFileSync(join(reference,"mark-3-text.docx"),docx("1Fresh approved reference verse."));
  execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=1","-c:a","libmp3lame",join(source,"mark-3-fcbh-audio.mp3")]);
  db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('fresh','hatam','mark',3,1,1)");
  const {runIngestion}=await import("../../src/pipeline/ingestion/index.js");
  const {recordBoundaryOverride}=await import("../../src/pipeline/ingestion/boundary-overrides.js");
  const {recordSourceAlignmentCorrection}=await import("../../src/pipeline/ingestion/source-alignment-corrections.js");
  expect((await runIngestion("fresh")).ok).toBe(true);
  const original=db.prepare("SELECT id,start_ms,end_ms FROM audio_segments WHERE project_id='fresh' AND layer='original_reading'").get() as {id:string;start_ms:number;end_ms:number};
  recordBoundaryOverride(db,{projectId:"fresh",segmentId:original.id,startMs:original.start_ms,endMs:original.end_ms-100,reviewerName:"Dan",evidence:"Trimmed trailing silence."});
  const correctionId=recordSourceAlignmentCorrection(db,{projectId:"fresh",audioSegmentId:original.id,verseRef:"Mark 3:1",assignedText:"Corrected reading",reviewerName:"Dan",evidence:"Heard exact interval after boundary trim."});
  const second=await runIngestion("fresh");
  expect(second.ok).toBe(true);
  const remapped=db.prepare("SELECT audio_segment_id FROM source_alignment_corrections WHERE id=?").get(correctionId) as {audio_segment_id:string};
  const newSegment=db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=?").get(remapped.audio_segment_id) as {start_ms:number;end_ms:number};
  expect(newSegment).toEqual({start_ms:original.start_ms,end_ms:original.end_ms-100});
});

it("re-ingests safely when a speaker attribution targets a segment that also has a boundary override", async () => {
  delete process.env.GEMINI_API_KEY;
  dataDir=mkdtempSync(join(tmpdir(),"hw-fresh-speaker-reingest-")); cleanup.push(dataDir); const assets=join(dataDir,"assets"), source=join(assets,"source","hatam","mark-3"), reference=join(assets,"reference","english","mark-3"); mkdirSync(source,{recursive:true}); mkdirSync(reference,{recursive:true});
  writeFileSync(join(source,"mark-3-text.docx"),docx("1Fresh approved source verse."));
  writeFileSync(join(reference,"mark-3-text.docx"),docx("1Fresh approved reference verse."));
  execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=1","-c:a","libmp3lame",join(source,"mark-3-fcbh-audio.mp3")]);
  db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8"));
  db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('fresh','hatam','mark',3,1,1)");
  db.exec("INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('jesus','Jesus','global','approved','Papuan',1,1)");
  const {runIngestion}=await import("../../src/pipeline/ingestion/index.js");
  const {recordBoundaryOverride}=await import("../../src/pipeline/ingestion/boundary-overrides.js");
  const {recordSourceAlignmentSpeakerAttribution}=await import("../../src/pipeline/ingestion/source-alignment-speaker-attributions.js");
  expect((await runIngestion("fresh")).ok).toBe(true);
  const original=db.prepare("SELECT id,start_ms,end_ms FROM audio_segments WHERE project_id='fresh' AND layer='original_reading'").get() as {id:string;start_ms:number;end_ms:number};
  recordBoundaryOverride(db,{projectId:"fresh",segmentId:original.id,startMs:original.start_ms,endMs:original.end_ms-100,reviewerName:"Dan",evidence:"Trimmed trailing silence."});
  const attributionId=recordSourceAlignmentSpeakerAttribution(db,{projectId:"fresh",audioSegmentId:original.id,characterId:"jesus",verseRef:"Mark 3:1",reviewerName:"Dan",evidence:"Text analysis: quotative verb introduces Jesus's line."});
  expect(db.prepare("SELECT speaker_character_id FROM audio_segments WHERE id=?").get(original.id)).toMatchObject({speaker_character_id:"jesus"});
  const second=await runIngestion("fresh");
  expect(second.ok).toBe(true);
  const remapped=db.prepare("SELECT audio_segment_id FROM source_alignment_speaker_attributions WHERE id=?").get(attributionId) as {audio_segment_id:string};
  const newSegment=db.prepare("SELECT start_ms,end_ms,speaker_character_id FROM audio_segments WHERE id=?").get(remapped.audio_segment_id) as {start_ms:number;end_ms:number;speaker_character_id:string};
  expect(newSegment).toEqual({start_ms:original.start_ms,end_ms:original.end_ms-100,speaker_character_id:"jesus"});
});

it("uses a synthetic published heading to build an isolated fresh scene plan", async () => {
  delete process.env.GEMINI_API_KEY;
  dataDir=mkdtempSync(join(tmpdir(),"hw-fresh-positive-")); cleanup.push(dataDir); const assets=join(dataDir,"assets"), source=join(assets,"source","hatam","mark-3"); mkdirSync(source,{recursive:true});
  writeFileSync(join(source,"mark-3-text.docx"),docx(["MARKUS 3","Synthetic published heading","(Mat. 1:1)","1Fresh approved source verse."]));
  execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=1","-c:a","libmp3lame",join(source,"mark-3-fcbh-audio.mp3")]);
  db=new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql","utf8")); db.exec("INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('fresh','hatam','mark',3,1,1)");
  const {runIngestion}=await import("../../src/pipeline/ingestion/index.js"); const {runSceneBreakdown}=await import("../../src/pipeline/scene-breakdown/index.js");
  expect((await runIngestion("fresh")).ok).toBe(true); expect((await runSceneBreakdown("fresh")).ok).toBe(true);
  expect(db.prepare("SELECT summary,verse_start,verse_end FROM scenes WHERE project_id='fresh'").get()).toMatchObject({summary:expect.stringContaining("Synthetic published heading"),verse_start:"Mark 3:1",verse_end:"Mark 3:1"});
});
