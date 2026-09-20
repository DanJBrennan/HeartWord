import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { computeNarrationCoverage } from "./narration-coverage.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("src/db/schema.sql", "utf8"));
  db.exec(`
    INSERT INTO projects (id,language,book,chapter,created_at,updated_at) VALUES ('p','hatam','mark',3,1,1);
    INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc','p',1,'Mark 3:7','Mark 3:8',1);
  `);
  return db;
}
function narrationSeg(db: InstanceType<typeof DatabaseSync>, id: string, verseRef: string, startMs: number, endMs: number) {
  db.prepare(`INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at)
    VALUES (?,'p','original_reading','a.mp3',?,?,NULL,?,90,1)`).run(id, startMs, endMs, verseRef);
}
function shot(db: InstanceType<typeof DatabaseSync>, id: string, sequence: number, verseRef: string, needsLipSync = false) {
  db.prepare(`INSERT INTO shots (id,scene_id,sequence,action,verse_ref,needs_lip_sync,status,created_at)
    VALUES (?,'sc',?,'Some action.',?,?, 'planned',1)`).run(id, sequence, verseRef, needsLipSync ? 1 : 0);
}
function acceptedClip(db: InstanceType<typeof DatabaseSync>, shotId: string, durationMs: number) {
  db.prepare(`INSERT INTO generation_attempts (id,shot_id,provider,model,operation,status,cost_usd,created_at)
    VALUES (?,?, 'veo_3_1_lite','veo-3.1','assemble_shot','accepted',0,1)`).run(`ga-${shotId}`, shotId);
  db.prepare(`INSERT INTO clips (id,shot_id,generation_attempt_id,timeline_start_ms,timeline_end_ms,created_at)
    VALUES (?,?,?,0,?,1)`).run(`clip-${shotId}`, shotId, `ga-${shotId}`, durationMs);
}

it("reports a real shortfall using the assumed default when no shot has been generated yet", () => {
  const db = setup();
  narrationSeg(db, "seg", "Mark 3:7-8", 0, 20000); // 20s of real narration
  shot(db, "s1", 1, "Mark 3:7"); // one non-dialogue shot, never generated -> assumed 8000ms
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans).toHaveLength(1);
  expect(report.spans[0]).toMatchObject({ verseRef: "Mark 3:7-8", realMs: 20000, coveredMs: 8000, gapMs: 12000, status: "short" });
  expect(report.spans[0]!.shots).toEqual([{ shotId: "s1", verseRef: "Mark 3:7", durationMs: 8000, durationSource: "assumed_default" }]);
});

it("reports ok once enough shots (real or assumed) cover the real span", () => {
  const db = setup();
  narrationSeg(db, "seg", "Mark 3:7-8", 0, 15000);
  shot(db, "s1", 1, "Mark 3:7");
  shot(db, "s2", 2, "Mark 3:8");
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans[0]).toMatchObject({ realMs: 15000, coveredMs: 16000, status: "ok" });
});

it("prefers a real accepted assembled clip's duration over the assumed default", () => {
  const db = setup();
  narrationSeg(db, "seg", "Mark 3:7-8", 0, 20000);
  shot(db, "s1", 1, "Mark 3:7");
  acceptedClip(db, "s1", 5000);
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans[0]!.shots[0]).toMatchObject({ durationMs: 5000, durationSource: "assembled_clip" });
  expect(report.spans[0]!.coveredMs).toBe(5000);
});

it("never counts a dialogue (needs_lip_sync) shot as narration coverage", () => {
  const db = setup();
  narrationSeg(db, "seg", "Mark 3:7-8", 0, 20000);
  shot(db, "dialogue", 1, "Mark 3:7", true);
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans[0]!.shots).toEqual([]);
  expect(report.spans[0]!.coveredMs).toBe(0);
  expect(report.spans[0]!.status).toBe("short");
});

it("claims a boundary shot for only the first (earliest) span it fits, not both", () => {
  const db = setup();
  db.exec(`INSERT INTO scenes (id,project_id,sequence,verse_start,verse_end,created_at) VALUES ('sc2','p',2,'Mark 3:9','Mark 3:9',1)`);
  narrationSeg(db, "seg1", "Mark 3:7-8", 0, 8000);
  narrationSeg(db, "seg2", "Mark 3:8-9", 8000, 16000);
  shot(db, "boundary", 1, "Mark 3:8"); // fits inside both spans' verse ranges
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans[0]!.shots.map(s => s.shotId)).toEqual(["boundary"]);
  expect(report.spans[1]!.shots).toEqual([]);
});

it("credits a multi-verse shot to the first span it overlaps, counting it exactly once", () => {
  const db = setup();
  // Three narrower narration rows, as the aligner really splits clauses --
  // a shot planned for "Mark 3:16-17" is wider than any single one.
  narrationSeg(db, "seg16", "Mark 3:16", 0, 5000);
  narrationSeg(db, "seg17a", "Mark 3:17", 5000, 10000);
  narrationSeg(db, "seg17b", "Mark 3:17", 10000, 14000);
  shot(db, "wide", 1, "Mark 3:16-17");
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans[0]!.shots.map(s => s.shotId)).toEqual(["wide"]);
  expect(report.spans[1]!.shots).toEqual([]);
  expect(report.spans[2]!.shots).toEqual([]);
  // Counted once, not three times, and not zero times.
  expect(report.totalCoveredMs).toBe(8000);
});

it("resolves a segment's verse reference through a recorded correction, not the raw column", () => {
  const db = setup();
  db.prepare(`INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at)
    VALUES ('split-child','p','original_reading','a.mp3',0,12000,NULL,NULL,90,1)`).run();
  db.prepare(`INSERT INTO source_alignment_corrections (id,project_id,audio_segment_id,verse_ref,assigned_text,reviewer_name,evidence,source_hash,alignment_hash,created_at)
    VALUES ('c1','p','split-child','Mark 3:7','Some narration.','Dan','Heard it.','sh','ah',1)`).run();
  shot(db, "s1", 1, "Mark 3:7");
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans).toHaveLength(1);
  expect(report.spans[0]).toMatchObject({ verseRef: "Mark 3:7", verseRefSource: "correction", realMs: 12000, coveredMs: 8000 });
  expect(report.unplaceableMs).toBe(0);
});

it("excludes editorial title/cross-reference narration from the coverage question, but reports it", () => {
  const db = setup();
  db.prepare(`INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at)
    VALUES ('title','p','original_reading','a.mp3',0,14000,NULL,NULL,90,1)`).run();
  db.prepare(`INSERT INTO source_alignment_editorial_classifications (id,project_id,audio_segment_id,classification,title_text,cross_reference_text,next_verse_ref,reviewer_name,evidence,source_hash,alignment_hash,created_at)
    VALUES ('e1','p','title','narrated_title_cross_reference','Yesus kin Beelzebul','(Mat 12:22)','Mark 3:23','Dan','Heard it.','sh','ah',1)`).run();
  narrationSeg(db, "seg", "Mark 3:7", 14000, 20000);
  const report = computeNarrationCoverage(db, "p");
  expect(report.spans).toHaveLength(1);
  expect(report.editorialMs).toBe(14000);
  expect(report.totalRealMs).toBe(6000); // editorial audio is not Scripture needing coverage
  expect(report.excluded).toContainEqual({ segmentId: "title", startMs: 0, endMs: 14000, durationMs: 14000, reason: "editorial" });
});

it("surfaces narration it cannot place instead of silently dropping it", () => {
  const db = setup();
  db.prepare(`INSERT INTO audio_segments (id,project_id,layer,source_path,start_ms,end_ms,speaker_character_id,verse_ref,confidence,created_at)
    VALUES ('orphan','p','original_reading','a.mp3',0,6000,NULL,NULL,90,1)`).run();
  narrationSeg(db, "seg", "Mark 3:7", 6000, 12000);
  const report = computeNarrationCoverage(db, "p");
  expect(report.unplaceableMs).toBe(6000);
  expect(report.excluded).toContainEqual({ segmentId: "orphan", startMs: 0, endMs: 6000, durationMs: 6000, reason: "unplaceable" });
  expect(report.spans).toHaveLength(1); // still reports what it can place
});

it("totals real, covered and gap milliseconds across every span", () => {
  const db = setup();
  narrationSeg(db, "seg1", "Mark 3:7", 0, 5000);
  narrationSeg(db, "seg2", "Mark 3:8", 5000, 9000);
  shot(db, "s1", 1, "Mark 3:7");
  const report = computeNarrationCoverage(db, "p");
  expect(report.totalRealMs).toBe(9000);
  expect(report.totalCoveredMs).toBe(8000); // s1 assumed 8000ms; seg2 has no covering shot
  expect(report.totalGapMs).toBe(1000);
});
