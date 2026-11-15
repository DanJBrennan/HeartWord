import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  root = mkdtempSync(join(tmpdir(), "hw-segment-merge-"));
  const put = (p: string, b: Buffer | string) => { const x = join(root, "assets", p); mkdirSync(dirname(x), { recursive: true }); writeFileSync(x, b); };
  put("source/hatam/mark-3/mark-3-text.docx", docx("1Source"));
  put("source/hatam/mark-3/mark-3-fcbh-audio.mp3", "audio");
  put("reference/english/mark-3/mark-3-text.docx", docx("1Reference"));
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('jesus','Jesus','global','approved','Papuan',1,1);
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES ('first','p','original_reading','source/hatam/mark-3/mark-3-fcbh-audio.mp3',1000,2000,'jesus','Mark 3:24',80,1);
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES ('second','p','original_reading','source/hatam/mark-3/mark-3-fcbh-audio.mp3',2524,4524,'jesus','Mark 3:25-26',80,1);
  `);
  return db;
}
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

it("merges two adjacent segments (with a natural pause gap) into one new segment spanning both", async () => {
  const db = setup();
  const { recordSegmentMerge } = await import("./segment-merges.js");
  const result = recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "Interior verses of one continuous quotation, per its own attribution text." });
  expect(db.prepare("SELECT id FROM audio_segments WHERE id IN ('first','second')").all()).toEqual([]);
  expect(db.prepare("SELECT start_ms,end_ms,speaker_character_id,verse_ref FROM audio_segments WHERE id=?").get(result.mergedSegmentId))
    .toEqual({ start_ms: 1000, end_ms: 4524, speaker_character_id: null, verse_ref: null });
  const merge = db.prepare("SELECT first_segment_id,second_segment_id,merged_segment_id,superseded_speaker_attribution_ids FROM source_alignment_segment_merges WHERE id=?").get(result.mergeId);
  expect(merge).toMatchObject({ first_segment_id: "first", second_segment_id: "second", merged_segment_id: result.mergedSegmentId });
});

it("merges two segments that touch exactly, with no gap", async () => {
  const db = setup();
  db.exec(`UPDATE audio_segments SET start_ms=2000,end_ms=4000 WHERE id='second'`);
  const { recordSegmentMerge } = await import("./segment-merges.js");
  const result = recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "No pause between these two clauses." });
  expect(db.prepare("SELECT start_ms,end_ms FROM audio_segments WHERE id=?").get(result.mergedSegmentId)).toEqual({ start_ms: 1000, end_ms: 4000 });
});

it("rejects merge targets that overlap", async () => {
  const db = setup();
  db.exec(`UPDATE audio_segments SET start_ms=1500,end_ms=3500 WHERE id='second'`);
  const { recordSegmentMerge } = await import("./segment-merges.js");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "x" })).toThrow("not overlap");
});

it("rejects merge targets passed out of chronological order", async () => {
  const db = setup();
  const { recordSegmentMerge } = await import("./segment-merges.js");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "second", secondSegmentId: "first", reviewerName: "Dan", evidence: "x" })).toThrow("must start before");
});

it("rejects a merge when another interval falls between the two targets", async () => {
  const db = setup();
  db.exec(`INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at) VALUES ('between','p','original_reading','source/hatam/mark-3/mark-3-fcbh-audio.mp3',2100,2300,NULL,'Mark 3:24',80,1)`);
  const { recordSegmentMerge } = await import("./segment-merges.js");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "x" })).toThrow("falls between");
});

it("refuses to merge segments with existing evidence unless explicitly acknowledged, and preserves the superseded rows", async () => {
  const db = setup();
  const { recordSegmentMerge } = await import("./segment-merges.js");
  const { recordSourceAlignmentSpeakerAttribution } = await import("./source-alignment-speaker-attributions.js");
  const firstAttributionId = recordSourceAlignmentSpeakerAttribution(db, { projectId: "p", audioSegmentId: "first", characterId: "jesus", reviewerName: "Dan", evidence: "Interior verse of the continuous quotation." });
  const secondAttributionId = recordSourceAlignmentSpeakerAttribution(db, { projectId: "p", audioSegmentId: "second", characterId: "jesus", reviewerName: "Dan", evidence: "Interior verse of the continuous quotation." });

  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "Merging the continuous quotation." }))
    .toThrow("acknowledgeSupersededEvidence");

  const result = recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "Merging the continuous quotation.", acknowledgeSupersededEvidence: true });
  const stored = db.prepare("SELECT superseded_speaker_attribution_ids FROM source_alignment_segment_merges WHERE id=?").get(result.mergeId) as { superseded_speaker_attribution_ids: string };
  expect(JSON.parse(stored.superseded_speaker_attribution_ids).sort()).toEqual([firstAttributionId, secondAttributionId].sort());
  // The superseded evidence rows themselves are preserved, not deleted, even though they no longer target a live segment.
  expect(db.prepare("SELECT id FROM source_alignment_speaker_attributions WHERE id=?").get(firstAttributionId)).toMatchObject({ id: firstAttributionId });
  expect(db.prepare("SELECT id FROM source_alignment_speaker_attributions WHERE id=?").get(secondAttributionId)).toMatchObject({ id: secondAttributionId });
  expect(db.prepare("SELECT speaker_character_id FROM audio_segments WHERE id=?").get(result.mergedSegmentId)).toMatchObject({ speaker_character_id: null });
});

it("refuses to merge a segment that a shot is already bound to", async () => {
  const db = setup();
  db.exec(`
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc','p',1,'Mark 3:24','Mark 3:26',1);
    INSERT INTO shots (id,scene_id,sequence,action,needs_lip_sync,dialogue_character_id,status,created_at) VALUES ('shot','sc',1,'Jesus speaks.',1,'jesus','planned',1);
    INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('cv','jesus','v1','approved',1);
  `);
  const { bindShotUtterance } = await import("../voice-lipsync/utterance-binding.js");
  bindShotUtterance(db, { projectId: "p", shotId: "shot", sourceSegmentId: "first", startMs: 1000, endMs: 2000, characterVersionId: "cv", approvedBy: "Dan" });
  const { recordSegmentMerge } = await import("./segment-merges.js");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: "x" })).toThrow("already bound");
});

it("requires a named reviewer and evidence", async () => {
  const db = setup();
  const { recordSegmentMerge } = await import("./segment-merges.js");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "", evidence: "x" })).toThrow("Named reviewer");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "first", secondSegmentId: "second", reviewerName: "Dan", evidence: " " })).toThrow("Named reviewer");
});

it("rejects a segment outside this project's original-reading layer", async () => {
  const db = setup();
  const { recordSegmentMerge } = await import("./segment-merges.js");
  expect(() => recordSegmentMerge(db, { projectId: "p", firstSegmentId: "missing", secondSegmentId: "second", reviewerName: "Dan", evidence: "x" })).toThrow("original-reading interval");
});
