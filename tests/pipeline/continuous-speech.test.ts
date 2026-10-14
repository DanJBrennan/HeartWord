import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import express from "express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let db: import("node:sqlite").DatabaseSync, root: string;
let server: ReturnType<express.Express["listen"]> | undefined;
vi.mock("../../src/db/client.js", () => ({ getDb: () => db, getDataDir: () => root }));
vi.mock("../../src/pipeline/ingestion/source-review.js", () => ({ sourceReviewHashes: () => ({ sourceHash: "synthetic-scripture", alignmentHash: "synthetic-alignment" }) }));
vi.mock("../../src/providers/elevenlabs.js", () => ({ reVoiceAudio: vi.fn(async (_voice: string, path: string) => ({ audioBuffer: readFileSync(path), requestSettings: { fixture: true } })) }));
vi.mock("../../src/pipeline/voicing/extract-clip.js", () => ({ extractClip: vi.fn((_source: string, start: number, end: number, path: string) => writeFileSync(path, JSON.stringify({ start, end }), { flag: "wx" })) }));
vi.mock("../../src/pipeline/ingestion/detect-silences.js", () => ({ getAudioDurationMs: (path: string) => { const v = JSON.parse(readFileSync(path, "utf8")); return v.end - v.start; } }));
import { confirmContinuousSpeech, confirmSpeechRunPauseBoundary, readConfirmedSpeechRuns, speechCoverageSegments, speechRunPauseIsSafe } from "../../src/pipeline/ingestion/continuous-speech.js";
import { incompleteSpeakerAttributionHold } from "../../src/pipeline/ingestion/speaker-attribution-gate.js";
import { runVoicing } from "../../src/pipeline/voicing/index.js";
import { reVoiceAudio } from "../../src/providers/elevenlabs.js";
import { bindShotUtterance } from "../../src/pipeline/voice-lipsync/utterance-binding.js";
import { resolveSpeechRunCastAudio } from "../../src/pipeline/voice-lipsync/speech-run-audio.js";
import { buildCoverageManifestsForProject } from "../../src/pipeline/casting/build-coverage-manifest.js";
import { assertSpeakerAudioContinuity, continuousAudioGroups } from "../../src/pipeline/assembly/continuous-audio.js";
import { planEditorialCut } from "../../src/pipeline/assembly/editorial-plan.js";
import type { CrewBrief } from "../../src/pipeline/creative-direction/crew-types.js";
import { buildScenesFromHeadings } from "../../src/pipeline/scene-breakdown/build-scenes.js";
const reference = [{ verse: 3, text: "He said, “First." }, { verse: 4, text: "Second." }, { verse: 5, text: "Third.”" }, { verse: 6, text: "They said, “Question”; he said, “Answer.”" }];
function docx(text: string) {
  const name = Buffer.from("word/document.xml"), bytes = Buffer.from(`<w:document><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:document>`);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 10); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
beforeEach(() => {
  vi.clearAllMocks(); root = mkdtempSync(join(tmpdir(), "hw-continuous-speech-")); mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "source.mp3"), "synthetic-source-performance");
  for (const path of ["source/hatam/mark-4/mark-4-text.docx", "reference/english/mark-4/mark-4-text.docx"]) {
    const out = join(root, "assets", path); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, docx("1Setup. 2Context. 3First. 4Second. 5Third. 6Question and answer."));
  }
  writeFileSync(join(root, "assets", "source/hatam/mark-4/mark-4-fcbh-audio.mp3"), "synthetic-source-performance");
  db = new DatabaseSync(":memory:"); db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',4,1,1);
    INSERT INTO characters (id,name,scope_kind,canon_status,region,created_at,updated_at) VALUES
    ('jesus','Jesus','global','approved','Papuan',1,1),('peter','Peter','global','approved','Papuan',1,1);
    INSERT INTO character_versions (id,character_id,version_label,status,voice_provider,voice_id,created_at) VALUES
    ('jv','jesus','v1','approved','elevenlabs','jvoice',1),('pv','peter','v1','approved','elevenlabs','pvoice',1);
    INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,verse_ref,confidence,created_at) VALUES
    ('a','p','original_reading','source.mp3',0,2000,'Mark 4:3',82,1),
    ('b','p','original_reading','source.mp3',2000,5000,NULL,60,1),
    ('c','p','original_reading','source.mp3',5000,9000,'Mark 4:5',80,1),
    ('n','p','original_reading','source.mp3',9000,10000,'Mark 4:6',90,1),
    ('p','p','original_reading','source.mp3',10000,12000,'Mark 4:6',90,1),
    ('j','p','original_reading','source.mp3',12000,14000,'Mark 4:6',90,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('scene','p',1,'Mark 4:3','Mark 4:6',1);
    INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,dialogue_character_id,coverage_plan,created_at) VALUES
    ('beat','scene',1,'Source-supported emphasis','Mark 4:4',1,'jesus','covered_sequence',1);`);
});
afterEach(async () => { await new Promise<void>(r => server ? server.close(() => r()) : r()); server = undefined; db.close(); if (resolve(root).startsWith(resolve(tmpdir(), "hw-continuous-speech-"))) rmSync(root, { recursive: true, force: true }); });
function confirm(ids = ["a", "b", "c"], characterId: string | null = "jesus", verseRef = "Mark 4:3-5", key = "run-one") {
  return confirmContinuousSpeech(db, { projectId: "p", audioSegmentIds: ids, characterId, verseRef, internalVerseTiming: "unresolved", reviewerName: "Synthetic source reviewer", evidence: "Confirmed uninterrupted speaker and exact outer source bounds; internal verses not located.", idempotencyKey: key });
}
it("attributes the entire speech across verses without deleting intervals, corrections or approximate alignment", () => {
  db.exec("INSERT INTO source_alignment_corrections VALUES ('correction','p','b','Mark 4:4','Reviewed words','Dan','Reviewed internal text','source','alignment',1)");
  const before = db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence FROM audio_segments ORDER BY start_ms").all();
  const run = confirm();
  expect(db.prepare("SELECT id,start_ms,end_ms,verse_ref,confidence FROM audio_segments ORDER BY start_ms").all()).toEqual(before);
  expect(db.prepare("SELECT assigned_text,reviewer_name FROM source_alignment_corrections").get()).toMatchObject({ assigned_text: "Reviewed words", reviewer_name: "Dan" });
  expect(incompleteSpeakerAttributionHold(reference.slice(0, 3), speechCoverageSegments(db, "p"))).toBeNull();
  expect(readConfirmedSpeechRuns(db, "p")[0]).toMatchObject({ id: run.id, startMs: 0, endMs: 9000, internalVerseTiming: "unresolved" });
  expect(confirm().id).toBe(run.id);
  expect(db.prepare("SELECT count(*) n FROM edit_commands").get()!.n).toBe(1);
});
it("reuses a single broad, already-attributed interval as complete verse-range coverage", () => {
  expect(incompleteSpeakerAttributionHold(reference.slice(0, 3), [{ verseRef: "Mark 4:3-5", speakerId: "jesus", startMs: 0, endMs: 9000 }])).toBeNull();
  expect(incompleteSpeakerAttributionHold(reference.slice(0, 3), [{ verseRef: "Mark 4:3", speakerId: "jesus" }])).toContain("4, 5");
  db.exec("UPDATE audio_segments SET end_ms=9000,speaker_character_id='jesus' WHERE id='a'; DELETE FROM audio_segments WHERE id IN ('b','c')");
  db.exec("INSERT INTO source_alignment_speaker_attributions VALUES ('legacy','p','a','jesus','Mark 4:3-5','Dan','Whole confirmed quotation','source','alignment',1)");
  expect(incompleteSpeakerAttributionHold(reference.slice(0, 3), speechCoverageSegments(db, "p"))).toBeNull();
});
it("keeps speaker attribution across a narrative scene heading without asking for a soundtrack split", () => {
  const result = buildScenesFromHeadings([
    { verseStart: 3, headingText: "First scene", parallelRefs: null },
    { verseStart: 5, headingText: "Second scene", parallelRefs: null }
  ], 6, "mark", 4, [{ verseRef: "Mark 4:3-5", speakerName: "Jesus", continuousSpeech: true }]);
  expect(result.boundaryStraddlingWarnings).toEqual([]);
  expect(result.scenes.every(scene => scene.summary.includes("Jesus"))).toBe(true);
});
it("keeps narration interruption and two speakers sharing a verse separately evidenced", async () => {
  confirm(); confirm(["n"], null, "Mark 4:6", "narration"); confirm(["p"], "peter", "Mark 4:6", "question"); confirm(["j"], "jesus", "Mark 4:6", "answer");
  expect(incompleteSpeakerAttributionHold(reference, speechCoverageSegments(db, "p"))).toBeNull();
  expect(() => confirm(["n", "p", "j"], "jesus", "Mark 4:6", "wrong")).toThrow(/already covers|conflicts/);
  await runVoicing("p");
  expect(reVoiceAudio).toHaveBeenCalledTimes(3); // one whole long speech, Peter, Jesus
  expect(vi.mocked(reVoiceAudio).mock.calls[0]![0]).toBe("jvoice");
  const rows = db.prepare("SELECT o.id,a.source_path,a.start_ms,a.end_ms,a.speaker_character_id FROM composite_audio_source_map m JOIN audio_segments o ON o.id=m.original_segment_id JOIN audio_segments a ON a.id=m.composite_segment_id ORDER BY o.start_ms").all() as Array<{ id: string; source_path: string; start_ms: number; end_ms: number; speaker_character_id: string | null }>;
  expect(rows.slice(0, 3).map(r => r.source_path)).toEqual([rows[0]!.source_path, rows[0]!.source_path, rows[0]!.source_path]);
  expect(rows.map(r => [r.start_ms, r.end_ms])).toEqual([[0, 2000], [2000, 5000], [5000, 9000], [0, 1000], [0, 2000], [0, 2000]]);
  const source = speechCoverageSegments(db, "p");
  const placements = rows.map((r, i) => ({ segmentId: r.id, path: r.source_path, speakerId: r.speaker_character_id, voice: r.speaker_character_id ? "cast" as const : "original" as const,
    sourceStartMs: r.start_ms, sourceEndMs: r.end_ms, startMs: source[i]!.startMs, endMs: source[i]!.endMs }));
  assertSpeakerAudioContinuity(source.map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, speakerId: s.speakerId })), placements);
  expect(continuousAudioGroups(placements).map(g => g.segmentIds)).toEqual([["a", "b", "c"], ["n"], ["p"], ["j"]]);
  await runVoicing("p"); expect(reVoiceAudio).toHaveBeenCalledTimes(3);
});
it("requires independent timing for a source-supported performance change and crosses an internal alignment edge safely", async () => {
  const run = confirm();
  const input = { projectId: "p", shotId: "beat", sourceSegmentId: "a", speechRunId: run.id, startMs: 1800, endMs: 5200, characterVersionId: "jv", approvedBy: "Synthetic phrase reviewer" };
  expect(() => bindShotUtterance(db, input)).toThrow("independent timing evidence");
  expect(buildCoverageManifestsForProject("p").shots[0]!.status).toBe("needs_exact_interval");
  bindShotUtterance(db, { ...input, timingEvidence: "Source phrase evidence: delivery changes at 1.8s, completes at 5.2s. This is independent of unresolved verse 4 timing." });
  await runVoicing("p", { sourceSegmentIds: ["a", "b", "c"] });
  expect(resolveSpeechRunCastAudio(db, "beat", "jv")).toMatchObject({ startMs: 1800, endMs: 5200 });
  expect(buildCoverageManifestsForProject("p").shots[0]!.status).toBe("planned");
  expect(readConfirmedSpeechRuns(db, "p")[0]!.internalVerseTiming).toBe("unresolved");
  db.prepare("UPDATE composite_audio_source_map SET voice_version_id='pv' WHERE original_segment_id='b'").run();
  expect(() => resolveSpeechRunCastAudio(db, "beat", "jv")).toThrow("source/voice-matched");
});
it("keeps an explicitly forced revision continuous and preserves the old accepted cast file", async () => {
  confirm(); await runVoicing("p", { sourceSegmentIds: ["a", "b", "c"] });
  const old = String(db.prepare("SELECT source_path FROM audio_segments WHERE layer='composite_cast_master' LIMIT 1").get()!.source_path);
  await runVoicing("p", { sourceSegmentIds: ["a", "b", "c"], force: true });
  expect(reVoiceAudio).toHaveBeenCalledTimes(2);
  expect(readFileSync(join(root, "assets", old), "utf8")).toBe('{"start":0,"end":9000}');
  expect(db.prepare("SELECT count(DISTINCT source_path) n FROM audio_segments WHERE layer='composite_cast_master'").get()!.n).toBe(1);
});
it("holds a partial accepted cast map before any new provider request", async () => {
  confirm();
  db.exec("INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,created_at) VALUES ('old','p','composite_cast_master','accepted.mp3',0,2000,'jesus',1)");
  db.exec("INSERT INTO composite_audio_source_map VALUES ('old','a','retained-hash','jv',1)");
  expect((await runVoicing("p", { sourceSegmentIds: ["a", "b", "c"] })).reasoning).toContain("partial retained cast map");
  expect(reVoiceAudio).not.toHaveBeenCalled();
  expect(db.prepare("SELECT source_path FROM audio_segments WHERE id='old'").get()!.source_path).toBe("accepted.mp3");
});
it("holds real gaps, speaker conflicts, chapter boundaries and changed source; exact-equivalent re-ingest remains reusable", () => {
  expect(() => confirm(["a", "c"])).toThrow("contiguous");
  expect(() => confirm(["a"], "jesus", "Mark 5:3")).toThrow("this chapter");
  expect(() => confirm(["a"], "jesus", "Mark 4:99")).toThrow("verified source");
  db.exec("UPDATE audio_segments SET speaker_character_id='peter' WHERE id='b'");
  expect(() => confirm()).toThrow("existing speaker decision");
  db.exec("UPDATE audio_segments SET speaker_character_id=NULL WHERE id='b'"); confirm();
  db.exec("UPDATE audio_segments SET end_ms=4999 WHERE id='b'");
  expect(() => readConfirmedSpeechRuns(db, "p")).toThrow("reconciliation");
  db.exec("UPDATE audio_segments SET end_ms=5000 WHERE id='b'");
  // Remap through the existing durable attribution evidence, as ingestion does.
  db.exec("PRAGMA foreign_keys=OFF; UPDATE audio_segments SET id='replacement' WHERE id='b'; UPDATE source_alignment_speaker_attributions SET audio_segment_id='replacement' WHERE audio_segment_id='b'; PRAGMA foreign_keys=ON");
  expect(readConfirmedSpeechRuns(db, "p")[0]!.members[1]!.id).toBe("replacement");
  writeFileSync(join(root, "assets", "source.mp3"), "changed");
  expect(() => readConfirmedSpeechRuns(db, "p")).toThrow("changed audio");
});
it("reconciles an explicit outer-boundary revision while retaining the entire prior confirmation", () => {
  const old = confirm();
  db.exec("UPDATE audio_segments SET end_ms=9500 WHERE id='c'; UPDATE audio_segments SET start_ms=9500 WHERE id='n'");
  expect(() => readConfirmedSpeechRuns(db, "p")).toThrow("reconciliation");
  const replacement = confirmContinuousSpeech(db, { projectId: "p", audioSegmentIds: ["a", "b", "c"], characterId: "jesus", verseRef: "Mark 4:3-5", internalVerseTiming: "unresolved", reviewerName: "Synthetic boundary reviewer", evidence: "Explicit source-supported speech end revision; next narrator interval remains contiguous", idempotencyKey: "replacement", supersedesRunId: old.id });
  expect(readConfirmedSpeechRuns(db, "p").map(r => r.id)).toEqual([replacement.id]);
  const payloads = db.prepare("SELECT payload FROM edit_commands WHERE command_type='confirm_continuous_speech' ORDER BY sequence").all();
  expect(payloads).toHaveLength(2);
  expect(JSON.parse(String(payloads[0]!.payload)).run.endMs).toBe(9000);
  expect(JSON.parse(String(payloads[1]!.payload)).supersededRunSnapshot.run.id).toBe(old.id);
});
it("does not derive an emotional pause from an uncertain internal verse boundary", () => {
  const run = confirm();
  const brief = { audio: run.members.map(m => ({ id: m.id, path: m.source_path, startMs: m.start_ms, endMs: m.end_ms,
    speakerId: "jesus", verseRef: m.verse_ref, confidence: 80, speechRun: { id: run.id, startMs: run.startMs, endMs: run.endMs, verseRef: run.verseRef, internalVerseTiming: run.internalVerseTiming } })),
    shots: [{ id: "cover", needsLipSync: false, clip: { durationMs: 10000 } }] } as CrewBrief;
  expect(() => planEditorialCut(brief, { edits: [{ shotId: "cover", sourceStartMs: 0, durationMs: 10000 }], pauses: [{ afterSegmentId: "a", durationMs: 1000, reason: "emotion" }] } as never)).toThrow("independently reviewed phrase");
  brief.audio[0]!.safePauseAfter = true; // a separately attested source pause
  expect(planEditorialCut(brief, { edits: [{ shotId: "cover", sourceStartMs: 0, durationMs: 10000 }], pauses: [{ afterSegmentId: "a", durationMs: 1000, reason: "Source-confirmed safe phrase pause" }] } as never).audioMap.map(m => [m.sourceStartMs, m.sourceEndMs])).toEqual([[0, 2000], [2000, 5000], [5000, 9000]]);
});
it("requires explicit pause safety even when a generic boundary correction already exists", () => {
  const run = confirm();
  db.exec("INSERT INTO source_alignment_boundary_overrides VALUES ('old','p','a',0,2000,0,2000,'Reviewer','Start-boundary timing reviewed; no claim about a pause at the end',1)");
  expect(speechRunPauseIsSafe(db, "p", run, 2000)).toBe(false);
  expect(() => confirmSpeechRunPauseBoundary(db, { projectId: "p", speechRunId: run.id, boundaryMs: 2200, reviewerName: "Reviewer", evidence: "x", idempotencyKey: "pause" })).toThrow("exact retained boundary");
  confirmSpeechRunPauseBoundary(db, { projectId: "p", speechRunId: run.id, boundaryMs: 2000, reviewerName: "Synthetic phrase reviewer", evidence: "Independently reviewed complete phrase and safe pause, not merely a verse label", idempotencyKey: "pause" });
  expect(speechRunPauseIsSafe(db, "p", run, 2000)).toBe(true);
  expect(readConfirmedSpeechRuns(db, "p")[0]!.members.map(m => [m.start_ms, m.end_ms])).toEqual([[0, 2000], [2000, 5000], [5000, 9000]]);
});
it("manual producer control and stage readers reopen the same saved run through HTTP", async () => {
  const { projectsRouter } = await import("../../src/server/routes/projects.js");
  const app = express(); app.use(express.json()); app.use("/api/projects", projectsRouter); server = app.listen(0);
  await new Promise(r => server!.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/projects/p/continuous-speech`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioSegmentIds: ["a", "b", "c"], characterId: "jesus", verseRef: "Mark 4:3-5", internalVerseTiming: "approximate", reviewerName: "Synthetic reviewer", evidence: "Confirmed whole performance, not internal verse locations", idempotencyKey: "http-one" }) });
  expect(response.status).toBe(201);
  const result = await (await fetch(url)).json();
  expect(result.runs).toEqual(readConfirmedSpeechRuns(db, "p"));
  expect(createHash("sha256").update(readFileSync(join(root, "assets", "source.mp3"))).digest("hex")).toBe(result.runs[0].audioHash);
  await runVoicing("p");
  const cast = await (await fetch(url.replace("continuous-speech", "audio-segments?layer=composite_cast_master"))).json();
  expect(cast.segments.slice(0, 3).map((s: { start_ms: number; end_ms: number }) => [s.start_ms, s.end_ms])).toEqual([[0, 2000], [2000, 5000], [5000, 9000]]);
  expect(cast.segments.slice(0, 3).every((s: { speaker_name: string }) => s.speaker_name === "Jesus")).toBe(true);
});
