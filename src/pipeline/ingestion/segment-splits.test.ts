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
  root = mkdtempSync(join(tmpdir(), "hw-segment-split-"));
  const put = (p: string, b: Buffer | string) => { const x = join(root, "assets", p); mkdirSync(dirname(x), { recursive: true }); writeFileSync(x, b); };
  put("source/hatam/mark-3/mark-3-text.docx", docx("1Source"));
  put("source/hatam/mark-3/mark-3-fcbh-audio.mp3", "audio");
  put("reference/english/mark-3/mark-3-text.docx", docx("1Reference"));
  db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,language TEXT,book TEXT,chapter INTEGER);
    CREATE TABLE characters(id TEXT PRIMARY KEY,canon_status TEXT);
    CREATE TABLE audio_segments(id TEXT,project_id TEXT,layer TEXT,source_path TEXT,start_ms INTEGER,end_ms INTEGER,speaker_character_id TEXT,verse_ref TEXT,confidence REAL,created_at INTEGER);
    CREATE TABLE source_alignment_corrections(id TEXT,project_id TEXT,audio_segment_id TEXT,verse_ref TEXT,assigned_text TEXT,reviewer_name TEXT,evidence TEXT,source_hash TEXT,alignment_hash TEXT,created_at INTEGER);
    CREATE TABLE source_alignment_editorial_classifications(id TEXT,project_id TEXT,audio_segment_id TEXT,classification TEXT,title_text TEXT,cross_reference_text TEXT,next_verse_ref TEXT,reviewer_name TEXT,evidence TEXT,film_treatment TEXT,source_hash TEXT,alignment_hash TEXT,created_at INTEGER);
    CREATE TABLE source_alignment_speaker_attributions(id TEXT,project_id TEXT,audio_segment_id TEXT,character_id TEXT,verse_ref TEXT,reviewer_name TEXT,evidence TEXT,source_hash TEXT,alignment_hash TEXT,created_at INTEGER);
    CREATE TABLE source_alignment_boundary_overrides(id TEXT,project_id TEXT,audio_segment_id TEXT,original_start_ms INTEGER,original_end_ms INTEGER,start_ms INTEGER,end_ms INTEGER,reviewer_name TEXT,evidence TEXT,created_at INTEGER);
    CREATE TABLE source_alignment_segment_splits(id TEXT,project_id TEXT,original_segment_id TEXT,original_start_ms INTEGER,original_end_ms INTEGER,split_at_ms INTEGER,first_segment_id TEXT,second_segment_id TEXT,superseded_correction_ids TEXT,superseded_editorial_classification_ids TEXT,superseded_speaker_attribution_ids TEXT,superseded_boundary_override_ids TEXT,reviewer_name TEXT,evidence TEXT,source_hash TEXT,alignment_hash TEXT,created_at INTEGER);
    INSERT INTO projects VALUES ('p','hatam','mark',3);
    INSERT INTO characters VALUES ('jesus','approved');
    INSERT INTO audio_segments VALUES ('seg','p','original_reading','source/hatam/mark-3/mark-3-fcbh-audio.mp3',1000,2000,NULL,'Mark 3:5',80,1);
  `);
  return db;
}
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

it("splits a clean segment into two new segments at the split point", async () => {
  const db = setup();
  const { recordSegmentSplit } = await import("./segment-splits.js");
  const result = recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 1400, reviewerName: "Dan", evidence: "Quote ends and narration begins at 1.4s." });
  expect(db.prepare("SELECT id FROM audio_segments WHERE id='seg'").get()).toBeUndefined();
  expect(db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=?").get(result.firstSegmentId)).toEqual({ start_ms: 1000, end_ms: 1400 });
  expect(db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=?").get(result.secondSegmentId)).toEqual({ start_ms: 1400, end_ms: 2000 });
  const split = db.prepare("SELECT original_segment_id,split_at_ms,superseded_correction_ids FROM source_alignment_segment_splits WHERE id=?").get(result.splitId);
  expect(split).toMatchObject({ original_segment_id: "seg", split_at_ms: 1400, superseded_correction_ids: null });
});

it("rejects a split point outside the segment's bounds", async () => {
  const db = setup();
  const { recordSegmentSplit } = await import("./segment-splits.js");
  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 1000, reviewerName: "Dan", evidence: "x" })).toThrow("strictly inside");
  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 2000, reviewerName: "Dan", evidence: "x" })).toThrow("strictly inside");
  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 3000, reviewerName: "Dan", evidence: "x" })).toThrow("strictly inside");
});

it("refuses to split a segment with existing evidence unless explicitly acknowledged", async () => {
  const db = setup();
  const { recordSegmentSplit } = await import("./segment-splits.js");
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  const attributionId = recordSourceAlignmentSpeakerAttribution(db, { projectId: "p", audioSegmentId: "seg", characterId: "jesus", reviewerName: "Dan", evidence: "Prior attribution before the split need was found." });

  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 1400, reviewerName: "Dan", evidence: "Splitting the quote from the trailing narration." }))
    .toThrow("acknowledgeSupersededEvidence");

  const result = recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 1400, reviewerName: "Dan", evidence: "Splitting the quote from the trailing narration.", acknowledgeSupersededEvidence: true });
  expect(db.prepare("SELECT superseded_speaker_attribution_ids FROM source_alignment_segment_splits WHERE id=?").get(result.splitId))
    .toEqual({ superseded_speaker_attribution_ids: JSON.stringify([attributionId]) });
  // The superseded evidence row itself is preserved, not deleted, even though it no longer targets a live segment.
  expect(db.prepare("SELECT id FROM source_alignment_speaker_attributions WHERE id=?").get(attributionId)).toMatchObject({ id: attributionId });
  expect(db.prepare("SELECT speaker_character_id FROM audio_segments WHERE id=?").get(result.firstSegmentId)).toMatchObject({ speaker_character_id: null });
});

it("requires a named reviewer and evidence", async () => {
  const db = setup();
  const { recordSegmentSplit } = await import("./segment-splits.js");
  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 1400, reviewerName: "", evidence: "x" })).toThrow("Named reviewer");
  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "seg", splitAtMs: 1400, reviewerName: "Dan", evidence: " " })).toThrow("Named reviewer");
});

it("rejects a segment outside this project's original-reading layer", async () => {
  const db = setup();
  const { recordSegmentSplit } = await import("./segment-splits.js");
  expect(() => recordSegmentSplit(db, { projectId: "p", audioSegmentId: "missing", splitAtMs: 1400, reviewerName: "Dan", evidence: "x" })).toThrow("original-reading interval");
});
