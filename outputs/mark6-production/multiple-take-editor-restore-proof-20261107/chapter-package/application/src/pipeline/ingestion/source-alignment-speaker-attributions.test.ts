import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

let db: InstanceType<typeof DatabaseSync>, root = "";
vi.mock("../../db/client.js", () => ({ getDb: () => db, getDataDir: () => root }));

function docx(text: string): Buffer {
  const name = Buffer.from("word/document.xml");
  const bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

function setup() {
  root = mkdtempSync(join(tmpdir(), "hw-speaker-attribution-"));
  const put = (p: string, b: Buffer | string) => { const x = join(root, "assets", p); mkdirSync(dirname(x), { recursive: true }); writeFileSync(x, b); };
  put("source/hatam/mark-3/mark-3-text.docx", docx("1Source"));
  put("source/hatam/mark-3/mark-3-fcbh-audio.mp3", "audio");
  put("reference/english/mark-3/mark-3-text.docx", docx("1Reference"));
  db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,language TEXT,book TEXT,chapter INTEGER);
    CREATE TABLE characters(id TEXT PRIMARY KEY,canon_status TEXT);
    CREATE TABLE audio_segments(id TEXT,project_id TEXT,layer TEXT,source_path TEXT,start_ms INTEGER,end_ms INTEGER,speaker_character_id TEXT,verse_ref TEXT,confidence REAL);
    CREATE TABLE source_alignment_speaker_attributions(id TEXT,project_id TEXT,audio_segment_id TEXT,character_id TEXT,verse_ref TEXT,reviewer_name TEXT,evidence TEXT,source_hash TEXT,alignment_hash TEXT,created_at INTEGER);
    INSERT INTO projects VALUES ('p','hatam','mark',3);
    INSERT INTO characters VALUES ('approved-char','approved'),('candidate-char','candidate');
    INSERT INTO audio_segments VALUES ('seg','p','original_reading','source/hatam/mark-3/mark-3-fcbh-audio.mp3',0,1000,NULL,'Mark 3:33',NULL);
  `);
  return db;
}
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

it("attributes a segment to an approved character and writes the live column", async () => {
  const db = setup();
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  const id = recordSourceAlignmentSpeakerAttribution(db, {
    projectId: "p", audioSegmentId: "seg", characterId: "approved-char",
    verseRef: "Mark 3:33", reviewerName: "Dan", evidence: "Text-analysis: 'buhup' (answered) introduces Jesus's reply, quote spans the whole segment."
  });
  expect(db.prepare("SELECT character_id,verse_ref,reviewer_name FROM source_alignment_speaker_attributions WHERE id=?").get(id))
    .toMatchObject({ character_id: "approved-char", verse_ref: "Mark 3:33", reviewer_name: "Dan" });
  expect(db.prepare("SELECT speaker_character_id FROM audio_segments WHERE id='seg'").get())
    .toMatchObject({ speaker_character_id: "approved-char" });
});

it("rejects a candidate (unapproved) character as a speaker", async () => {
  const db = setup();
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  expect(() => recordSourceAlignmentSpeakerAttribution(db, {
    projectId: "p", audioSegmentId: "seg", characterId: "candidate-char", reviewerName: "Dan", evidence: "x"
  })).toThrow("approved canon character");
});

it("rejects a segment outside this project's original-reading layer", async () => {
  const db = setup();
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  expect(() => recordSourceAlignmentSpeakerAttribution(db, {
    projectId: "p", audioSegmentId: "missing", characterId: "approved-char", reviewerName: "Dan", evidence: "x"
  })).toThrow("original-reading interval");
});

it("requires a named reviewer and evidence", async () => {
  const db = setup();
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  expect(() => recordSourceAlignmentSpeakerAttribution(db, {
    projectId: "p", audioSegmentId: "seg", characterId: "approved-char", reviewerName: "", evidence: "x"
  })).toThrow("Named reviewer");
  expect(() => recordSourceAlignmentSpeakerAttribution(db, {
    projectId: "p", audioSegmentId: "seg", characterId: "approved-char", reviewerName: "Dan", evidence: "  "
  })).toThrow("Named reviewer");
});

it("rejects a non-canonical verse reference when provided", async () => {
  const db = setup();
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  expect(() => recordSourceAlignmentSpeakerAttribution(db, {
    projectId: "p", audioSegmentId: "seg", characterId: "approved-char", verseRef: "chapter three verse one",
    reviewerName: "Dan", evidence: "x"
  })).toThrow("canonical");
});
