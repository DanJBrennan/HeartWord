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
afterEach(() => { db?.close(); cleanup.splice(0).forEach(path => rmSync(path, { recursive:true, force:true })); });
function docx(text: string): Buffer { const name=Buffer.from("word/document.xml"), bytes=Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`); const local=Buffer.alloc(30), central=Buffer.alloc(46), end=Buffer.alloc(22); local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50,0);central.writeUInt32LE(bytes.length,20);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+bytes.length,16);return Buffer.concat([local,name,bytes,central,name,end]); }

it("ingests an isolated new chapter from real fixture files then holds before invented scene planning", async () => {
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
