/**
 * Repair the named source-speaker gaps exposed by the Mark 4 final-cut
 * review. Each range starts immediately after its narrated lead-in and ends
 * at the end of Jesus's continuing quotation. No timing is changed.
 */
import "dotenv/config";
import { getDb } from "../src/db/client.js";
import { recordSourceAlignmentSpeakerAttribution } from "../src/pipeline/ingestion/source-alignment-speaker-attributions.js";
import { runVoicing } from "../src/pipeline/voicing/index.js";

const projectId = "8a5659a4-b033-4d5f-80e2-904b217cf8a0";
const jesusId = "b78bed54-1d53-4b9f-9070-549dddb71b19";
const db = getDb();
const continuingJesusRanges = [
  // The source reviewer already confirmed these three intervals as Mark 4:12.
  // They continue Jesus's direct quotation from Mark 4:11 and must not fall
  // back to narrator merely because the original aligner left verse_ref null.
  { startMs: 144878, endMs: 169227, label: "Mark 4:12 continuation of Jesus's private explanation" },
  { startMs: 172991, endMs: 258679, label: "Mark 4:13–20 explanation of the parable" },
  { startMs: 262484, endMs: 306801, label: "Mark 4:21–25 lamp teaching" },
  { startMs: 314979, endMs: 358269, label: "Mark 4:26–29 seed-growing parable" },
  { startMs: 361365, endMs: 396232, label: "Mark 4:30–32 mustard-seed comparison" }
];

const allRows = db.prepare(`SELECT id, verse_ref, start_ms, end_ms, speaker_character_id
  FROM audio_segments WHERE project_id=? AND layer='original_reading' ORDER BY start_ms`).all(projectId) as Array<{
  id: string; verse_ref: string | null; start_ms: number; end_ms: number; speaker_character_id: string | null;
}>;
const targets = allRows.filter(row =>
  row.speaker_character_id === null && continuingJesusRanges.some(range => row.start_ms >= range.startMs && row.end_ms <= range.endMs)
);
if (!targets.length) throw new Error("No unassigned continuing-Jesus intervals were found; refusing an empty repair.");
if (targets.some(row => !continuingJesusRanges.some(range => row.start_ms >= range.startMs && row.end_ms <= range.endMs))) {
  throw new Error("A proposed attribution lies outside the reviewed continuing-Jesus ranges.");
}

db.exec("BEGIN IMMEDIATE");
try {
  for (const row of targets) {
    const range = continuingJesusRanges.find(item => row.start_ms >= item.startMs && row.end_ms <= item.endMs)!;
    recordSourceAlignmentSpeakerAttribution(db, {
      projectId, audioSegmentId: row.id, characterId: jesusId,
      verseRef: row.verse_ref ? row.verse_ref.replace(/^mark/, "Mark") : null,
      reviewerName: "Dan Brennan",
      evidence: `Producer review of the Mark 4 final cut confirmed that this interval remains Jesus speaking within the ${range.label}; it is not narrator speech.`
    });
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const result = await runVoicing(projectId, { sourceSegmentIds: targets.map(row => row.id) });
if (!result.ok || result.generated + result.reused !== targets.length || result.skippedNoVoice) {
  throw new Error(`Scoped Jesus cast-audio preparation failed: ${result.reasoning}`);
}
console.log(JSON.stringify({
  repairedIntervals: targets.map(({ verse_ref, start_ms, end_ms }) => ({ verse_ref, start_ms, end_ms })),
  voicePreparation: result
}, null, 2));
