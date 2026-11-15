/**
 * Records Dan's reviewed Mark 4 storm speaker decisions without generating
 * media. The current original-reading alignment already separates the two
 * Jesus phrases into speech intervals; only Mark 4:38 needs a new split.
 */
import { getDb } from "../src/db/client.js";
import { recordSegmentSplit } from "../src/pipeline/ingestion/segment-splits.js";
import { recordSourceAlignmentSpeakerAttribution } from "../src/pipeline/ingestion/source-alignment-speaker-attributions.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const db = getDb();

function original(startMs: number, endMs: number) {
  return db.prepare(
    "SELECT id FROM audio_segments WHERE project_id=? AND layer='original_reading' AND start_ms=? AND end_ms=?"
  ).get(projectId, startMs, endMs) as { id: string } | undefined;
}
function character(name: string) {
  const row = db.prepare("SELECT id FROM characters WHERE name=? AND canon_status='approved'").get(name) as { id: string } | undefined;
  if (!row) throw new Error(`Missing approved ${name} character.`);
  return row.id;
}
function bind(audioSegmentId: string, characterId: string, verseRef: string, evidence: string) {
  const existing = db.prepare(
    "SELECT id FROM source_alignment_speaker_attributions WHERE project_id=? AND audio_segment_id=? AND character_id=?"
  ).get(projectId, audioSegmentId, characterId);
  if (!existing) recordSourceAlignmentSpeakerAttribution(db, {
    projectId, audioSegmentId, characterId, verseRef, reviewerName: "Dan Brennan", evidence
  });
}

const jesusId = character("Jesus");
const peterId = character("Peter");

// Dan: Mark 4:38 remains narration through 473.234 s; Peter speaks the
// final plea from 473.234 s through the retained interval's end.
let peterSegment = original(473234, 476434);
if (!peterSegment) {
  const storm38 = original(462434, 476434);
  if (!storm38) throw new Error("Expected Mark 4:38 source interval or its approved split is missing.");
  const split = recordSegmentSplit(db, {
    projectId, audioSegmentId: storm38.id, splitAtMs: 473234,
    reviewerName: "Dan Brennan",
    evidence: "Producer review: narration through 10.800 seconds of the retained Mark 4:38 interval; Peter speaks the final plea after that.",
    acknowledgeSupersededEvidence: true
  });
  peterSegment = { id: split.secondSegmentId };
}
bind(peterSegment.id, peterId, "Mark 4:38", "Producer review: the final plea in the boat is Peter; the preceding retained source interval is narration.");

// Dan: in the verse-39 review excerpt, narration ends at 9 seconds, Jesus
// says the held command, and narration resumes after 12 seconds. The current
// audio alignment retains that spoken portion as this middle interval.
const jesus39 = original(486583, 488521);
if (!jesus39) throw new Error("Expected Mark 4:39 Jesus speech interval is missing.");
bind(jesus39.id, jesusId, "Mark 4:39", "Producer review: narrator leads into Mark 4:39; Jesus speaks the command in the retained middle speech interval; narration resumes afterward.");

// Dan: Mark 4:40 is narration through approximately 3 seconds, followed by
// Jesus's complete question to the verse end. The alignment retains the
// question in two speech intervals separated by a natural pause.
for (const bounds of [[499351, 501407], [502017, 504416]] as const) {
  const segment = original(bounds[0], bounds[1]);
  if (!segment) throw new Error(`Expected Mark 4:40 Jesus speech interval ${bounds.join("-")} is missing.`);
  bind(segment.id, jesusId, "Mark 4:40", "Producer review: after the narrated lead-in, this retained speech interval belongs to Jesus's complete Mark 4:40 question.");
}

const saved = db.prepare(
  `SELECT a.verse_ref, c.name, s.start_ms, s.end_ms
   FROM source_alignment_speaker_attributions a
   JOIN audio_segments s ON s.id=a.audio_segment_id
   JOIN characters c ON c.id=a.character_id
   WHERE a.project_id=? AND a.verse_ref IN ('Mark 4:38','Mark 4:39','Mark 4:40')
   ORDER BY s.start_ms`
).all(projectId);
console.log(JSON.stringify(saved, null, 2));
