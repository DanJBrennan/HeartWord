import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crewBriefHash, loadCrewBrief, productionAssetPath } from "../../src/pipeline/creative-direction/crew-context.js";
import { requireCurrentPlan, validateHandoffPlan } from "../../src/pipeline/creative-direction/crew-store.js";
import { importCutManifest } from "../../src/pipeline/assembly/import-cut-manifest.js";
import { assertEditorialRebuildable } from "../../src/pipeline/assembly/render-editorial-cut.js";
import { recordCutTimingAudit, type CutTimingAudit } from "../../src/pipeline/assembly/cut-timing-audit.js";
import { structuralCutFindings } from "../../src/pipeline/assembly/finishing.js";
import { fixtureTreatment } from "../helpers/crew-treatment.js";
import { fixtureWave } from "../helpers/pcm-wave.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: InstanceType<typeof DatabaseSync>, directory: string;
function docxBody(xmlBody: string): Buffer {
  const name = Buffer.from("word/document.xml");
  const bytes = Buffer.from(xmlBody);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
function docx(text: string): Buffer { return docxBody(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`); }
function docxParagraphs(lines: string[]): Buffer {
  return docxBody(`<w:document>${lines.map(line => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:document>`);
}
function file(path: string, content: string | Buffer) { const absolute = join(directory, "assets", path); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, content); }
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "heartword-crew-test-"));
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',2,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 2:1','Mark 2:2',1);
    INSERT INTO shots (id,scene_id,sequence,action,verse_ref,created_at) VALUES ('shot','scene',1,'Roof intact','Mark 2:1-2',1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES ('c','Witness','global','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,notes,created_at) VALUES ('v','c','v1','approved','Approved brown robe',1);
    INSERT INTO character_assets (id,character_version_id,category,path,created_at) VALUES ('a','v','body_pose','ref.png',1);
    INSERT INTO shot_characters VALUES ('shot','c');
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('audio','p','original_reading','source.wav',0,8000,'Mark 2:1-2',1);`);
  file("source/hatam/mark-2/mark-2-text.docx", docx("1Original words. 2More words."));
  file("reference/english/mark-2/mark-2-text.docx", docx("1Reference words. 2More reference."));
  file("ref.png", "reference fixture"); file("source.wav", fixtureWave(8000));
});
afterEach(() => {
  db.close();
  if (relative(tmpdir(), directory).startsWith("heartword-crew-test-")) rmSync(directory, { recursive: true, force: true });
});
describe("immutable project brief", () => {
  const existingCut = () => {
    file("existing.mp4", "unchanged film fixture");
    db.exec("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES ('cut','p','existing.mp4',10000,1,1)");
    const brief = loadCrewBrief(db, directory, "p", "finishing");
    const audit: CutTimingAudit = { kind: "observed_cut_timing", renderId: "cut", renderSha256: brief.render!.sha256,
      durationMs: 10000, summary: "Narration is incomplete in the existing film.", findings: ["Final four seconds of narration are absent."], evidenceDirectory: "exports/audit",
      picture: [{ shotId: "shot", label: "Existing shot", path: "existing.mp4", startMs: 0, endMs: 10000, uncertaintyMs: 42, evidence: "pixel_match" }],
      audio: [{ segmentId: "audio", referencePath: "source.wav", voice: "original", observations: [{ referenceStartMs: 0, durationMs: 4000, startMs: 2000, correlation: .99 }] }],
      unverifiedAudio: [{ segmentId: "audio", reason: "Only the first half matched." }] };
    return { brief, audit };
  };
  it("retains partial observed timing for crew review without approving source completeness or rewriting media", () => {
    const { brief, audit } = existingCut();
    recordCutTimingAudit(db, brief, audit); recordCutTimingAudit(db, brief, audit);
    const loaded = loadCrewBrief(db, directory, "p", "finishing");
    expect(loaded.render!.timingAudit?.findings).toEqual(audit.findings);
    expect(loaded.render!.audioMap).toBeUndefined();
    expect(structuralCutFindings(loaded).join(" ")).toContain("Final four seconds");
    expect(db.prepare("SELECT COUNT(*) AS n FROM chapter_render_manifests").get()!.n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM edit_commands WHERE command_type='audit_cut_timing'").get()!.n).toBe(1);
    expect(readFileSync(join(directory, "assets", "existing.mp4"), "utf8")).toBe("unchanged film fixture");
  });
  it("excludes timing observations after the actual film or source audio changes", () => {
    const { brief, audit } = existingCut(); recordCutTimingAudit(db, brief, audit);
    file("existing.mp4", "a different cut");
    expect(loadCrewBrief(db, directory, "p", "finishing").render!.timingAudit).toBeUndefined();
    file("existing.mp4", "unchanged film fixture"); file("source.wav", fixtureWave(8000, 220));
    expect(loadCrewBrief(db, directory, "p", "finishing").render!.timingAudit).toBeUndefined();
  });
  it("rejects unknown sources, invalid intervals, and a changed current render before saving observations", () => {
    const { brief, audit } = existingCut();
    const invalid = structuredClone(audit); invalid.audio[0]!.segmentId = "foreign-source";
    expect(() => recordCutTimingAudit(db, brief, invalid)).toThrow("audio interval");
    invalid.audio = audit.audio; invalid.picture[0]!.endMs = 20000;
    expect(() => recordCutTimingAudit(db, brief, invalid)).toThrow("picture interval");
    db.exec("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES ('new','p','existing.mp4',10000,1,2)");
    expect(() => recordCutTimingAudit(db, brief, audit)).toThrow("current film changed");
    expect(db.prepare("SELECT COUNT(*) AS n FROM edit_commands").get()!.n).toBe(0);
  });
  it("loads exact source text, version notes, timing and scoped canon", () => {
    const b = loadCrewBrief(db, directory, "p", "planning");
    expect(b.source.text[0]!.text).toBe("Original words.");
    expect(b.canon).toMatchObject([{ id: "c", versionId: "v", notes: "Approved brown robe" }]);
    expect(b.audio[0]!.endMs).toBe(8000);
  });
  it("surfaces a producer-resolved title-card decision instead of the default do-not-display note", () => {
    file("source/hatam/mark-2/mark-2-text.docx", docxParagraphs([
      "MARKUS 2", "Yesus dimig Lewi", "(Mat. 9:9-13; Luk. 5:27-32)", "1Original words. 2More words."
    ]));
    const unresolved = loadCrewBrief(db, directory, "p", "planning").producerNotes.find(n => n.note.includes("Yesus dimig Lewi"))!;
    expect(unresolved.note).toContain("do not automatically display it");

    db.exec(`INSERT INTO source_alignment_editorial_classifications
      (id,project_id,audio_segment_id,classification,title_text,cross_reference_text,next_verse_ref,reviewer_name,evidence,film_treatment,source_hash,alignment_hash,created_at)
      VALUES ('ec','p','audio','narrated_title_cross_reference','Yesus dimig Lewi','Mat. 9:9-13; Luk. 5:27-32','Mark 2:1','Dan','Confirmed spoken; approved as a title card','title_card','h','h',1)`);
    const resolved = loadCrewBrief(db, directory, "p", "planning").producerNotes.find(n => n.note.includes("Yesus dimig Lewi"))!;
    expect(resolved.note).toContain("Human-resolved by Dan: display as an on-screen title card.");
    expect(resolved.note).not.toContain("do not automatically display");
  });
  it("supplies only active reusable lessons whose project, subject, language, book, and region match", () => {
    const insert = db.prepare(`INSERT INTO production_lessons
      (id,project_id,scope_kind,scope_value,subject_id,issue,requested_change,status,source_language,source_book,source_chapter,source_region,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const values = (id: string, scope: string, value: string | null, subject: string, status = "active", language = "hatam", region = "Papuan") =>
      insert.run(id, "p", scope, value, subject, "review", id, status, language, "mark", 2, region, 1, 1);
    values("chapter-current", "chapter", null, "p");
    values("shot-current", "shot", null, "shot");
    values("foreign-shot", "shot", null, "a-shot-from-another-chapter");
    values("book-current", "book", "mark", "p");
    values("wrong-language", "book", "mark", "p", "active", "another-language");
    values("wrong-region", "book", "mark", "p", "active", "hatam", "another-region");
    values("candidate", "book", "mark", "p", "candidate");
    values("disabled", "book", "mark", "p", "disabled");

    expect(loadCrewBrief(db, directory, "p", "planning").appliedLessons?.map(lesson => lesson.id)).toEqual([
      "book-current", "chapter-current", "shot-current"
    ]);
  });
  it("does not substitute Mark 2 reference text for another chapter", () => {
    db.exec("UPDATE projects SET chapter=3");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow();
  });
  it("recognizes a verse that continues a sentence with a lowercase word", () => {
    file("reference/english/mark-2/mark-2-text.docx", docx("1Reference introduction: 2how it continues for 40 days."));
    const b = loadCrewBrief(db, directory, "p", "planning");
    expect(b.source.reference.map(v => v.verse)).toEqual([1, 2]);
    expect(b.source.reference[1]!.text).toBe("how it continues for 40 days.");
  });
  it("rejects cross-project verse references and incomplete source coverage", () => {
    db.exec("UPDATE shots SET verse_ref='John 2:1'");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("another book");
    db.exec("UPDATE shots SET verse_ref='Mark 2:1'");
    file("reference/english/mark-2/mark-2-text.docx", docx("1Reference words."));
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("coverage differ");
  });
  it("blocks unapproved, other-region, ambiguous-version and foreign-scope cast", () => {
    db.exec("UPDATE characters SET region='Other'");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("project-appropriate");
    db.exec("UPDATE characters SET region='Papuan', scope_kind='chapter', scope_book='mark', scope_chapter=3");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("project-appropriate");
    db.exec("UPDATE characters SET scope_kind='global'; INSERT INTO character_versions (id,character_id,version_label,status,created_at) VALUES ('v2','c','v2','approved',2)");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("one approved");
  });
  it("blocks missing/changed source and canon before generation", () => {
    const b = loadCrewBrief(db, directory, "p", "planning");
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('run','p','planning',?,?,'approved',?,1)").run(crewBriefHash(b, "planning"), JSON.stringify(b),JSON.stringify({contributions:{creative_director:{emotionalTreatment:fixtureTreatment(b)}}}));
    expect(requireCurrentPlan(db, directory, "p").id).toBe("run");
    file("ref.png", "changed reference");
    expect(() => requireCurrentPlan(db, directory, "p")).toThrow("stale");
  });
  it("blocks overlapping source intervals and asset traversal", () => {
    db.exec("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('overlap','p','original_reading','source.wav',4000,8000,'Mark 2:2',2)");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("overlap");
    expect(() => productionAssetPath(directory, "../secret.txt")).toThrow("inside");
  });
  it("blocks an ambiguous gap between two different source recordings", () => {
    db.exec("UPDATE audio_segments SET end_ms=3000; INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('other','p','original_reading','other.wav',4000,8000,'Mark 2:2',2)");
    expect(() => loadCrewBrief(db, directory, "p", "planning")).toThrow("gap");
  });
  it("retains unassigned intervals between aligned lines from the same recording", () => {
    db.exec("UPDATE audio_segments SET end_ms=3000; INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('a2','p','original_reading','source.wav',4000,8000,'Mark 2:2',2)");
    const b = loadCrewBrief(db, directory, "p", "planning");
    expect(b.audio).toHaveLength(3);
    expect(b.audio[1]).toMatchObject({ startMs: 3000, endMs: 4000, path: "source.wav", speakerId: null, provenance: "unassigned_source_interval" });
  });
  it("accepts a real (non-gap-filler) audio segment with no verse claim, like narration or a title card", () => {
    db.exec("UPDATE audio_segments SET end_ms=6000; INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,created_at) VALUES ('title','p','original_reading','source.wav',6000,8000,NULL,2)");
    const b = loadCrewBrief(db, directory, "p", "planning");
    expect(b.audio).toHaveLength(2);
    expect(b.audio[1]).toMatchObject({ id: "title", startMs: 6000, endMs: 8000, verseRef: null, speakerId: null });
  });
  it("backfills a recording's own leading silence before its first detected interval", () => {
    db.exec("UPDATE audio_segments SET start_ms=588");
    const b = loadCrewBrief(db, directory, "p", "planning");
    expect(b.audio).toHaveLength(2);
    expect(b.audio[0]).toMatchObject({ startMs: 0, endMs: 588, path: "source.wav", speakerId: null, verseRef: null, provenance: "unassigned_source_interval" });
    expect(b.audio[1]).toMatchObject({ id: "audio", startMs: 588, endMs: 8000 });
  });
  it("uses the saved group spokesperson without rewriting the recording's original speaker identity", () => {
    db.exec(`INSERT INTO character_groups (id,name,scope_kind,created_at) VALUES ('g','Witnesses','global',1);
      INSERT INTO characters (id,name,scope_kind,canon_status,region,group_id,created_at,updated_at) VALUES ('old','Legacy group','global','rejected','Papuan','g',1,1);
      UPDATE characters SET group_id='g',is_spokesperson=1 WHERE id='c'; UPDATE audio_segments SET speaker_character_id='old';`);
    expect(loadCrewBrief(db, directory, "p", "planning").audio[0]).toMatchObject({ speakerId: "c", sourceSpeakerId: "old" });
    expect(db.prepare("SELECT speaker_character_id FROM audio_segments").get()!.speaker_character_id).toBe("old");
  });
  it("invalidates an external handoff when a different crew plan is introduced", () => {
    const b = loadCrewBrief(db, directory, "p", "planning");
    expect(() => validateHandoffPlan(db, directory, "p")).toThrow("production crew");
    db.prepare("INSERT INTO production_runs (id,project_id,phase,brief_hash,brief_json,status,result_json,created_at) VALUES ('run','p','planning',?,?,'approved',?,1)").run(crewBriefHash(b, "planning"), JSON.stringify(b),JSON.stringify({contributions:{creative_director:{emotionalTreatment:fixtureTreatment(b)}}}));
    expect(() => validateHandoffPlan(db, directory, "p")).toThrow("direction changed");
    expect(() => validateHandoffPlan(db, directory, "p", "run")).not.toThrow();
    expect(() => validateHandoffPlan(db, directory, "p", "older-run")).toThrow("direction changed");
  });
  it("attaches timing to a hand-edited cut only when it preserves every source segment", () => {
    file("cut.mp4", "existing cut fixture");
    db.exec("INSERT INTO chapter_renders (id,project_id,result_asset_path,total_duration_ms,shot_count,created_at) VALUES ('render','p','cut.mp4',9000,1,1)");
    const b = loadCrewBrief(db, directory, "p", "finishing");
    expect(b.render!.timeline).toEqual([]);
    const manifest = { renderId: "render", renderSha256: b.render!.sha256, timeline: [{ shotId: "shot", startMs: 0, endMs: 9000 }],
      audioMap: [{ segmentId: "audio", sourceStartMs: 0, sourceEndMs: 8000, startMs: 1000, endMs: 9000 }] };
    expect(() => importCutManifest(db, directory, "p", { ...manifest, audioMap: [] })).toThrow("mapping");
    expect(() => importCutManifest(db, directory, "p", { ...manifest, renderSha256: "changed" })).toThrow("unchanged");
    importCutManifest(db, directory, "p", manifest);
    expect(loadCrewBrief(db, directory, "p", "finishing").render!.audioMap).toEqual(manifest.audioMap);
    expect(() => importCutManifest(db, directory, "p", manifest)).toThrow("immutable");
    expect(() => assertEditorialRebuildable(db, "p")).toThrow("existing editor");
  });
});
