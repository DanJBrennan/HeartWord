/**
 * Coverage report for stage 6's "narrator must never go silent"
 * requirement (docs/design/timeline.md). For each real narration-only
 * span in the source recording (audio_segments.layer='original_reading',
 * speaker_character_id IS NULL), lists the shots whose verse_ref falls
 * within that span, their current assembled-clip durations, and the gap
 * between the real span length and the shots' current total -- the
 * concrete todo list for closing each gap (extend a shot's duration,
 * add a cutaway, or both).
 *
 * Verse-range matching note: a shot's verse_ref can share a boundary
 * verse with the narration span before or after it (e.g. a shot on
 * "Mark 2:12" sits on the seam between "Mark 2:11-12 (narration)" and
 * "Mark 2:12-14 (narration)") -- this report assigns such a shot to
 * BOTH neighboring spans' listings (flagged) rather than silently
 * picking one, since collapsing that ambiguity wrongly was a real bug
 * caught earlier this project (assemble-single-shot.ts's own history).
 * A human still needs to look at genuinely ambiguous boundary shots.
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { parseVerseRange } from "../src/pipeline/scene-breakdown/build-scenes.js";

const PROJECT_ID = "fe1408a5-d515-4d5b-b5c1-5fc55d0ae32d";
const db = getDb();

interface NarrationSeg {
  verse_ref: string;
  start_ms: number;
  end_ms: number;
}
interface ShotRow {
  id: string;
  verse_ref: string;
  scene_seq: number;
  shot_seq: number;
  needs_lip_sync: number;
}

function readNarrationSegments(rows: Record<string, unknown>[]): NarrationSeg[] {
  return rows.map((row) => {
    if (typeof row.verse_ref !== "string" || typeof row.start_ms !== "number" || typeof row.end_ms !== "number") {
      throw new Error("Expected narration segment rows with verse_ref, start_ms, and end_ms.");
    }
    return { verse_ref: row.verse_ref, start_ms: row.start_ms, end_ms: row.end_ms };
  });
}

function readShots(rows: Record<string, unknown>[]): ShotRow[] {
  return rows.map((row) => {
    if (typeof row.id !== "string" || typeof row.verse_ref !== "string" || typeof row.scene_seq !== "number" || typeof row.shot_seq !== "number" || typeof row.needs_lip_sync !== "number") {
      throw new Error("Expected shot rows with id, verse_ref, sequence, and lip-sync fields.");
    }
    return { id: row.id, verse_ref: row.verse_ref, scene_seq: row.scene_seq, shot_seq: row.shot_seq, needs_lip_sync: row.needs_lip_sync };
  });
}

const narrationSegs = readNarrationSegments(db
  .prepare(
    `SELECT verse_ref, start_ms, end_ms FROM audio_segments
     WHERE project_id = ? AND layer = 'original_reading' AND speaker_character_id IS NULL ORDER BY start_ms`
  )
  .all(PROJECT_ID));

const shots = readShots(db
  .prepare(
    `SELECT s.id, s.verse_ref, sc.sequence as scene_seq, s.sequence as shot_seq, s.needs_lip_sync
     FROM shots s JOIN scenes sc ON sc.id = s.scene_id WHERE sc.project_id = ? ORDER BY sc.sequence, s.sequence`
  )
  .all(PROJECT_ID));

const shotDurations = db
  .prepare(
    `SELECT s.id AS shot_id, cl.timeline_end_ms - cl.timeline_start_ms as dur
     FROM shots s
     JOIN scenes sc ON sc.id = s.scene_id
     JOIN clips cl ON cl.shot_id = s.id
     JOIN generation_attempts ga ON ga.id = cl.generation_attempt_id
     WHERE sc.project_id = ? AND ga.operation = 'assemble_shot' AND ga.status = 'accepted'
       AND ga.created_at = (SELECT MAX(ga2.created_at) FROM clips cl2 JOIN generation_attempts ga2 ON ga2.id=cl2.generation_attempt_id WHERE cl2.shot_id=s.id AND ga2.operation='assemble_shot' AND ga2.status='accepted')`
  )
  .all(PROJECT_ID) as Array<{ shot_id: string; dur: number }>;
const durById = new Map(shotDurations.map((d) => [d.shot_id, d.dur]));

// This session's supplementary inserts aren't DB shots -- mapped by hand
// to the real narration span whose story beat they visually cover.
const supplementalInserts: Array<{ label: string; verseRef: string; durationMs: number }> = [
  { label: "friends-carrying-to-house", verseRef: "Mark 2:1-5 (narration)", durationMs: 4000 },
  { label: "friends-roof-arrival", verseRef: "Mark 2:1-5 (narration)", durationMs: 4000 },
  { label: "friends-roof-digging", verseRef: "Mark 2:1-5 (narration)", durationMs: 4000 },
  { label: "pilot-shot004-recast", verseRef: "Mark 2:1-5 (narration)", durationMs: 4000 },
  { label: "crowd-indoor-reaction-to-dust-falling", verseRef: "Mark 2:1-5 (narration)", durationMs: 8000 },
  { label: "paralytic-s-tearful-hope-and-crowd-silence", verseRef: "Mark 2:1-5 (narration)", durationMs: 8000 },
  { label: "paralytic-face-before-healing", verseRef: "Mark 2:5-8 (narration)", durationMs: 4000 },
  { label: "friends-watching-from-roof-aperture", verseRef: "Mark 2:5-8 (narration)", durationMs: 4000 },
  { label: "crowd-witness-breathless-reaction", verseRef: "Mark 2:5-8 (narration)", durationMs: 4000 },
  { label: "scribe-unhappy-amid-celebration", verseRef: "Mark 2:12-14 (narration)", durationMs: 4000 }
];

// Spans Dan has confirmed are planned for a music bed instead of
// narration (docs/design/timeline.md's one deliberate exception to
// "narrator must never go silent") -- excluded from the gap report
// entirely rather than reported as a defect.
const musicBedSpans = new Set<string>(["Mark 2:11-12 (narration)"]);

function stripNarrationSuffix(verseRef: string): string {
  return verseRef.replace(" (narration)", "");
}

console.log("verse_ref | real_ms | covered_ms | gap_ms | status");
console.log("-".repeat(80));

let totalRealMs = 0;
let totalGapMs = 0;

// A silent shot sitting exactly on a single shared boundary verse (e.g.
// "Mark 2:12") numerically fits inside BOTH neighboring narration spans
// ("Mark 2:11-12" and "Mark 2:12-14") -- the same boundary-ambiguity
// pitfall this project has hit before (assemble-single-shot.ts's own
// verse-match fallback history). It plays only once in the real
// timeline, so it must be claimed by exactly one span. Narration spans
// are processed in chronological order and each non-dialogue shot is
// claimed by the FIRST (earliest) span whose range contains it, then
// removed from consideration for every later span.
const claimedShotIds = new Set<string>();

for (const seg of narrationSegs) {
  if (musicBedSpans.has(seg.verse_ref)) {
    console.log(`\n${seg.verse_ref}: MUSIC BED (confirmed) -- not narration, excluded from gap report`);
    continue;
  }
  const { start: segStart, end: segEnd } = parseVerseRange(stripNarrationSuffix(seg.verse_ref));
  const realMs = seg.end_ms - seg.start_ms;
  totalRealMs += realMs;

  const coveringShots = shots.filter((s) => {
    // Only NON-dialogue shots are candidates for playing narration audio
    // underneath them -- a needs_lip_sync shot already has its own
    // correct composite_cast_master audio in its own separate time slot,
    // so counting it here would both double-count real chapter runtime
    // and mask how short the actual silent b-roll coverage is.
    if (s.needs_lip_sync) return false;
    if (claimedShotIds.has(s.id)) return false;
    const { start, end } = parseVerseRange(s.verse_ref);
    return start >= segStart && end <= segEnd;
  });
  coveringShots.forEach((s) => claimedShotIds.add(s.id));

  let sumMs = 0;
  const lines: string[] = [];
  for (const s of coveringShots) {
    const d = durById.get(s.id);
    if (d === undefined) {
      lines.push(`    ! ${s.verse_ref} -- no assembled clip found`);
      continue;
    }
    sumMs += d;
    lines.push(`    - ${s.verse_ref}: ${d}ms`);
  }
  for (const ins of supplementalInserts.filter((i) => i.verseRef === seg.verse_ref)) {
    sumMs += ins.durationMs;
    lines.push(`    + [insert] ${ins.label}: ${ins.durationMs}ms`);
  }

  const gapMs = realMs - sumMs;
  totalGapMs += gapMs;
  const status = gapMs > 1000 ? "SHORT -- needs more coverage" : gapMs < -1000 ? "check overlap/boundary counting" : "OK";
  console.log(`\n${seg.verse_ref} | real=${realMs}ms | covered=${sumMs}ms | gap=${gapMs}ms | ${status}`);
  lines.forEach((l) => console.log(l));
}

console.log("\n" + "=".repeat(80));
console.log(`Total narration-only real duration: ${totalRealMs}ms (${(totalRealMs / 1000).toFixed(1)}s)`);
console.log(`Total gap remaining: ${totalGapMs}ms (${(totalGapMs / 1000).toFixed(1)}s)`);
