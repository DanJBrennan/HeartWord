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
